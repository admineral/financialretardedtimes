'use client'

import { useMemo, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CrownIcon, UserIcon, RefreshCwIcon } from 'lucide-react'
import { ChatMessage } from '../types'
import { useUserProfile } from '../hooks/use-user-profile'
import { useUserActivity } from '../hooks/use-user-activity'
import { ActivityBarChart } from '@/app/chat-archive/components/ActivityBarChart'
import { WeeklyActivityGrid } from '@/app/chat-archive/components/weekly-activity-grid'

interface UserStats {
  totalMessages: number
  chartsShared: number
  totalLikes: number
  avgMessageLength: number
  mostActiveHour: number
  mostUsedSymbols: Array<{ symbol: string; count: number }>
  messageFrequency: number // messages per hour
  firstMessageTime: string
  lastMessageTime: string
  quotedMessages: number
  mentionedUsers: string[]
  timeDistribution: Record<number, number> // hour -> message count
}

interface UserProfileHoverProps {
  username: string
  userMessages: ChatMessage[]
  className?: string
}

/**
 * Skeleton loading state that matches the full card layout
 * Shows immediately with proper dimensions to prevent layout shift
 */
function ProfileSkeleton({ username }: { username: string }) {
  return (
    <Card className="w-96 shadow-lg border-2 animate-in fade-in duration-200">
      <CardHeader className="pb-0">
        <div className="flex items-center gap-3">
          {/* Avatar skeleton with pulse */}
          <div className="relative">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-pulse" />
          </div>
          
          <div className="flex-1 min-w-0 space-y-2">
            {/* Username + loading badge */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{username}</span>
              <Badge variant="outline" className="text-xs bg-primary/5 border-primary/20">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-muted-foreground">Loading...</span>
                </div>
              </Badge>
            </div>
            
            {/* Stats skeleton row */}
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-8" />
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-4 w-6" />
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-4 w-10" />
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-4 w-6" />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <Separator />
        
        {/* Weekly Activity Grid Skeleton */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          {/* Grid skeleton - 7 columns x 5 rows to match WeeklyActivityGrid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton 
                key={i} 
                className="h-3 w-3 rounded-sm"
                style={{ 
                  animationDelay: `${i * 20}ms`,
                  opacity: 0.3 + (Math.random() * 0.4)
                }}
              />
            ))}
          </div>
        </div>
        
        <Separator />
        
        {/* Activity Bar Chart Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <div className="flex items-end gap-0.5 h-[100px]">
            {Array.from({ length: 24 }).map((_, i) => (
              <Skeleton 
                key={i} 
                className="flex-1 rounded-t"
                style={{ 
                  height: `${20 + Math.random() * 60}%`,
                  animationDelay: `${i * 30}ms`
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0h</span>
            <span>12h</span>
            <span>23h</span>
          </div>
        </div>
        
        <Separator />
        
        {/* Bottom section skeleton */}
        <div className="flex items-center justify-center py-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-3 w-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
            <span>Fetching profile data...</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function UserProfileHover({ username, userMessages, className = '' }: UserProfileHoverProps) {
  // Get user_id from the latest message for this user
  const userId = userMessages.length > 0 ? userMessages[0].user_id || null : null
  
  // Retry state for fallback fetching
  const [retryCount, setRetryCount] = useState(0)
  
  // Fetch extended profile data from TradingView
  const { profile, isLoading: profileLoading, refetch: refetchProfile } = useUserProfile({
    userId,
    username
  })
  
  // Fetch user activity data (last 30 days) - this is the fallback when userMessages is empty
  const { activities, patterns: activityPatterns, isLoading: activityLoading, refetch: refetchActivity } = useUserActivity(username, 'bitcoin_de_DE', 30)
  
  // Determine if we're loading any data
  const isLoadingAnyData = profileLoading || activityLoading
  
  // Handle retry - refetch both profile and activity data
  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1)
    refetchProfile?.()
    refetchActivity?.()
  }, [refetchProfile, refetchActivity])

  const userStats = useMemo(() => {
    if (userMessages.length === 0) return null

    const stats: UserStats = {
      totalMessages: userMessages.length,
      chartsShared: 0,
      totalLikes: 0,
      avgMessageLength: 0,
      mostActiveHour: 0,
      mostUsedSymbols: [],
      messageFrequency: 0,
      firstMessageTime: userMessages[0]?.time || '',
      lastMessageTime: userMessages[userMessages.length - 1]?.time || '',
      quotedMessages: 0,
      mentionedUsers: [],
      timeDistribution: {}
    }

    let totalChars = 0
    const symbolCount: Record<string, number> = {}
    const mentionedUsers = new Set<string>()
    const timeDistribution: Record<number, number> = {}

    userMessages.forEach(message => {
      // Message length
      totalChars += message.text.length

      // Charts shared
      if (message.meta?.links?.charts?.data) {
        stats.chartsShared += Object.keys(message.meta.links.charts.data).length
      }

      // Total likes from charts
      if (message.meta?.temp?.chart_likes) {
        Object.values(message.meta.temp.chart_likes).forEach(like => {
          stats.totalLikes += like.count
        })
      }

      // Symbol usage
      if (message.symbol) {
        symbolCount[message.symbol] = (symbolCount[message.symbol] || 0) + 1
      }

      // Quoted messages
      if (message.text.includes('[quote=')) {
        stats.quotedMessages++
      }

      // Mentioned users
      const mentions = message.text.match(/@(\w+)/g)
      if (mentions) {
        mentions.forEach(mention => mentionedUsers.add(mention.substring(1)))
      }

      // Time distribution
      const hour = new Date(message.time).getHours()
      timeDistribution[hour] = (timeDistribution[hour] || 0) + 1
    })

    stats.avgMessageLength = Math.round(totalChars / userMessages.length)
    stats.mostUsedSymbols = Object.entries(symbolCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([symbol, count]) => ({ symbol, count }))
    
    stats.mentionedUsers = Array.from(mentionedUsers).slice(0, 5)
    stats.timeDistribution = timeDistribution

    // Most active hour
    const maxHour = Object.entries(timeDistribution).reduce((max, [hour, count]) => 
      count > max.count ? { hour: parseInt(hour), count } : max, 
      { hour: 0, count: 0 }
    )
    stats.mostActiveHour = maxHour.hour

    // Message frequency (messages per hour)
    if (stats.firstMessageTime && stats.lastMessageTime) {
      try {
        const firstTime = new Date(stats.firstMessageTime)
        const lastTime = new Date(stats.lastMessageTime)
        
        // Validate dates
        if (!isNaN(firstTime.getTime()) && !isNaN(lastTime.getTime())) {
          const hoursDiff = Math.max(1, (lastTime.getTime() - firstTime.getTime()) / (1000 * 60 * 60))
          stats.messageFrequency = Math.round((stats.totalMessages / hoursDiff) * 100) / 100
        }
      } catch (error) {
        console.warn('Error calculating message frequency:', error)
        stats.messageFrequency = 0
      }
    }

    return stats
  }, [userMessages])

  // Show skeleton loading state when fetching initial data
  if (isLoadingAnyData && !profile && !activityPatterns) {
    return <ProfileSkeleton username={username} />
  }

  // Fallback: If no local messages but we have activity data, show profile with activity
  const hasActivityData = activityPatterns && activityPatterns.totalMessages > 0
  const hasProfileData = profile !== null
  
  // If no userMessages but we have activity or profile data, we can still show something useful
  if ((!userStats || userMessages.length === 0) && !hasActivityData && !hasProfileData) {
    return (
      <Card className={`w-96 shadow-lg border-2 ${className}`}>
        <CardHeader className="pb-0">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-muted">
              <AvatarFallback className="text-sm font-bold bg-muted/50">
                <UserIcon className="h-6 w-6 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-bold text-lg">{username}</h3>
              <p className="text-sm text-muted-foreground">No data available</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isLoadingAnyData}
            className="w-full"
          >
            {isLoadingAnyData ? (
              <>
                <RefreshCwIcon className="h-3 w-3 mr-1.5 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCwIcon className="h-3 w-3 mr-1.5" />
                Retry fetch
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // If we have activity/profile data but no local messages, use fallback rendering
  const showFallbackProfile = (!userStats || userMessages.length === 0) && (hasActivityData || hasProfileData)
  
  const latestMessage = userMessages[userMessages.length - 1]
  const userBadges = latestMessage?.badges || []
  const isPremium = userBadges.some(badge => badge.name.includes('premium'))
  const isModerator = latestMessage?.is_moderator
  
  // For fallback profile, get avatar from profile if available
  // Convert null to undefined for AvatarImage type compatibility
  const avatarUrl = latestMessage?.user_pic ?? profile?.avatar ?? undefined

  return (
    <Card className={`w-96 shadow-lg border-2 animate-in fade-in slide-in-from-bottom-2 duration-200 ${className}`}>
      <CardHeader className="pb-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border-3 border-primary/40 shadow-md ring-2 ring-primary/25 hover:border-primary/60 hover:ring-3 hover:ring-primary/35 transition-all duration-200">
            <AvatarImage 
              src={avatarUrl} 
              alt={username}
              className="rounded-full object-cover"
            />
            <AvatarFallback className="text-sm font-bold bg-muted/50 rounded-full">
              {avatarUrl ? (
                username.slice(0, 2).toUpperCase()
              ) : (
                <UserIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="font-bold text-lg truncate">{username}</h3>
              {isLoadingAnyData && (
                <Badge variant="outline" className="text-xs bg-primary/5 border-primary/20">
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-muted-foreground">Syncing</span>
                  </div>
                </Badge>
              )}
              {isModerator && (
                <CrownIcon className="h-4 w-4 text-yellow-500" />
              )}
              {userBadges
                .filter(badge => !badge.name.includes('moderator'))
                .map((badge) => (
                  <Badge 
                    key={badge.name} 
                    variant={isPremium ? "default" : "outline"} 
                    className="text-xs"
                  >
                    {badge.verbose_name}
                  </Badge>
                ))}
            </div>
            
            {/* TradingView Profile Stats */}
            {profile && (
              <div className="flex items-center gap-4 animate-in fade-in duration-300">
                {profile.followers !== null && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Followers</span>
                    <span className="text-sm font-semibold tabular-nums">{profile.followers.toLocaleString()}</span>
                  </div>
                )}
                
                {profile.ideas !== null && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Ideas</span>
                    <span className="text-sm font-semibold tabular-nums">{profile.ideas.toLocaleString()}</span>
                  </div>
                )}
                
                {activityPatterns && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Messages</span>
                    <span className="text-sm font-semibold tabular-nums">{activityPatterns.totalMessages.toLocaleString()}</span>
                  </div>
                )}
                
                {profile.reputation !== null && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Rep</span>
                    <span className="text-sm font-semibold tabular-nums">{profile.reputation.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Stats skeleton while profile loading */}
            {profileLoading && !profile && (
              <div className="flex items-center gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex flex-col gap-1">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-4 w-6" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Separator after profile stats */}
        <Separator />
        
        {/* 30-Day Activity Calendar (if data available) */}
        {activities && activities.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
            <div className="space-y-2 relative">
              {activityLoading && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span>Syncing...</span>
                  </div>
                </div>
              )}
              <WeeklyActivityGrid
                data={activities}
                exactDays={30}
                minimal={true}
                compactMode={false}
              />
            </div>
            <Separator className="mt-4" />
          </div>
        )}
        
        {/* Activity grid skeleton while loading */}
        {activityLoading && !activities?.length && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton 
                  key={i} 
                  className="h-3 w-3 rounded-sm"
                  style={{ opacity: 0.3 + (Math.random() * 0.4) }}
                />
              ))}
            </div>
            <Separator className="mt-4" />
          </div>
        )}
        
        {/* 24-Hour Activity Chart (if data available) */}
        {activityPatterns && (
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 delay-100">
            <div className="space-y-2 relative">
              {activityLoading && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span>Syncing...</span>
                  </div>
                </div>
              )}
              <ActivityBarChart
                hourCounts={activityPatterns.hourCounts}
                totalMessages={activityPatterns.totalMessages}
                height={100}
              />
            </div>
            <Separator className="mt-4" />
          </div>
        )}
        
        {/* Activity chart skeleton while loading */}
        {activityLoading && !activityPatterns && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <div className="flex items-end gap-0.5 h-[100px]">
              {Array.from({ length: 24 }).map((_, i) => (
                <Skeleton 
                  key={i} 
                  className="flex-1 rounded-t"
                  style={{ height: `${20 + Math.random() * 60}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0h</span>
              <span>12h</span>
              <span>23h</span>
            </div>
            <Separator className="mt-4" />
          </div>
        )}

      </CardContent>
    </Card>
  )
}
