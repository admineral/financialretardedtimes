'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { CrownIcon, UserIcon } from 'lucide-react'
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

export function UserProfileHover({ username, userMessages, className = '' }: UserProfileHoverProps) {
  // Get user_id from the latest message for this user
  const userId = userMessages.length > 0 ? userMessages[0].user_id || null : null
  
  // Fetch extended profile data from TradingView
  const { profile, isLoading: profileLoading } = useUserProfile({
    userId,
    username
  })
  
  // Fetch user activity data (last 30 days)
  const { activities, patterns: activityPatterns, isLoading: activityLoading } = useUserActivity(username, 'bitcoin_de_DE', 30)
  
  // Determine if we're loading any data
  const isLoadingAnyData = profileLoading || activityLoading

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

  if (!userStats || userMessages.length === 0) {
    return (
      <Card className={`w-80 ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserIcon className="h-4 w-4" />
            <span className="text-sm">No data available for {username}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const latestMessage = userMessages[userMessages.length - 1]
  const userBadges = latestMessage?.badges || []
  const isPremium = userBadges.some(badge => badge.name.includes('premium'))
  const isModerator = latestMessage?.is_moderator

  return (
    <Card className={`w-96 shadow-lg border-2 ${className}`}>
      <CardHeader className="pb-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border-3 border-primary/40 shadow-md ring-2 ring-primary/25 hover:border-primary/60 hover:ring-3 hover:ring-primary/35 transition-all duration-200">
            <AvatarImage 
              src={latestMessage?.user_pic} 
              alt={username}
              className="rounded-full object-cover"
            />
            <AvatarFallback className="text-sm font-bold bg-muted/50 rounded-full">
              {latestMessage?.user_pic ? (
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
                <Badge variant="outline" className="text-xs animate-pulse">
                  Loading...
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
              <div className="flex items-center gap-4">
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
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Separator after profile stats */}
        {profile && <Separator />}
        
        {profileLoading && !profile && (
          <>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Loading TradingView data...
              </div>
            </div>
            <Separator />
          </>
        )}
        
        {/* 30-Day Activity Calendar (if data available) */}
        {activities && activities.length > 0 && (
          <>
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
            <Separator />
          </>
        )}
        
        {/* 24-Hour Activity Chart (if data available) */}
        {activityPatterns && (
          <>
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
            <Separator />
          </>
        )}
        

      </CardContent>
    </Card>
  )
}



