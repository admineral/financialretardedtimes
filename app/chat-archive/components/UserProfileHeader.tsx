'use client'

import React, { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ExternalLinkIcon, CalendarIcon } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useActivity } from '@/lib/activity-context'
import { format } from 'date-fns'
import { ActivityClock } from './ActivityClock'
import { ActivityBarChart } from './ActivityBarChart'
import { WeeklyActivityGrid } from './weekly-activity-grid'

interface UserProfileHeaderProps {
  username: string
  room: string
}

interface TradingViewProfile {
  username: string | null
  followers: number | null
  following: number | null
  ideas: number | null
  scripts: number | null
  joinDate: string | null
  avatar: string | null
  bio: string | null
}

export function UserProfileHeader({ username }: UserProfileHeaderProps) {
  const { activityPatterns, activities, selectedDate, setSelectedDate, isLoading } = useActivity()
  const [profile, setProfile] = useState<TradingViewProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  // Get first activity date (earliest message)
  const firstActivityDate = activities.length > 0 
    ? activities[activities.length - 1]?.date 
    : null

  // Fetch TradingView profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoadingProfile(true)
        const response = await fetch(`/Test/api/user-profile?username=${encodeURIComponent(username)}`)
        const data = await response.json()
        
        if (response.ok) {
          setProfile(data)
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
      } finally {
        setIsLoadingProfile(false)
      }
    }

    if (username) {
      fetchProfile()
    }
  }, [username])

  const formatJoinDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown'
    try {
      const date = new Date(dateString)
      const monthYear = format(date, 'MMM. yyyy')
      return monthYear
    } catch {
      return 'Unknown'
    }
  }

  const avatarSrc = profile?.avatar || `https://s3.tradingview.com/userpics/${username.toLowerCase()}_200.png`
  const avatarFallbackSrc = `https://s3.tradingview.com/userpics/${username.toLowerCase()}_50.png`

  // Handle date click
  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
  }

  return (
    <div className="w-full pb-8 border-b border-border space-y-6">
      {/* Top Section: Profile Info + Activity Visualization */}
      <div className="flex flex-col lg:flex-row items-start gap-6">
        {/* Activity Clock with Avatar */}
        <div className="flex-shrink-0">
          <ActivityClock
            hourCounts={activityPatterns?.hourCounts}
            totalMessages={activityPatterns?.totalMessages || 0}
            size={180}
            avatar={{
              src: avatarSrc,
              fallbackSrc: avatarFallbackSrc,
              alt: username
            }}
          />
        </div>

        {/* Profile Info */}
        <div className="flex-1 min-w-0">
          {/* Username */}
          <div className="mb-4">
            <a
              href={`https://de.tradingview.com/u/${username}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-4xl font-bold hover:text-primary transition-colors inline-flex items-center gap-2 group"
            >
              {username}
              <ExternalLinkIcon className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          </div>

          {/* Stats Row */}
          {isLoadingProfile ? (
            <div className="flex flex-wrap items-center gap-8 mb-4">
              {/* Loading skeletons for all stats */}
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-8 mb-4">
              <div>
                <span className="text-muted-foreground text-sm">Followers</span>
                <div className="font-semibold">
                  {profile?.followers?.toLocaleString() || '—'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Sie folgen</span>
                <div className="font-semibold">
                  {profile?.following?.toLocaleString() || '—'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Ideen</span>
                <div className="font-semibold">
                  {profile?.ideas?.toLocaleString() || '—'}
                </div>
              </div>
              {/* Activity Stats - Inline with profile stats */}
              {activityPatterns && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <span className="text-muted-foreground text-sm">Nachrichten</span>
                          <div className="font-semibold">
                            {activityPatterns.totalMessages.toLocaleString()}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold">Gesamtzahl der Nachrichten</p>
                          <p>Basierend auf 365 Tagen</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <span className="text-muted-foreground text-sm">Pro Tag</span>
                          <div className="font-semibold">
                            {Math.round(activityPatterns.totalMessages / 365)}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold">Berechnung:</p>
                          <p>{activityPatterns.totalMessages.toLocaleString()} Nachrichten ÷ 365 Tage</p>
                          <p>= {Math.round(activityPatterns.totalMessages / 365)} Nachrichten pro Tag</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
            </div>
          )}

          {/* Join Date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            <span>Seit {formatJoinDate(profile?.joinDate || firstActivityDate)} dabei</span>
          </div>
        </div>

        {/* Activity Visualizations Container */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* 30-Day Calendar Grid - Minimal */}
          <div className="flex-shrink-0 scale-75 origin-top-left">
            <WeeklyActivityGrid
              data={activities}
              onDateClick={handleDateClick}
              selectedDate={selectedDate}
              exactDays={30}
              isLoading={isLoading}
              allowFutureDates={false}
              minimal={true}
            />
          </div>

          {/* Activity Bar Chart */}
          <div className="flex-shrink-0 w-full lg:w-80">
            <ActivityBarChart
              hourCounts={activityPatterns?.hourCounts}
              totalMessages={activityPatterns?.totalMessages || 0}
              height={180}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

