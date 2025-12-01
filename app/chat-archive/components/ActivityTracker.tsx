'use client'

import React, { useMemo } from 'react'
import { WeeklyActivityGrid } from './weekly-activity-grid'
import { useActivity } from '@/lib/activity-context'
import { RefreshCwIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

interface ActivityTrackerProps {
  onDateClick?: (date: Date) => void
}

export function ActivityTracker({ onDateClick }: ActivityTrackerProps) {
  // Get all state from context
  const {
    selectedDate,
    selectedDays,
    activities,
    isLoading,
    progress,
    lastSyncTime,
    setSelectedDate,
    refreshActivities
  } = useActivity()

  // Handle date click
  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    if (onDateClick) {
      onDateClick(date)
    }
  }

  // Generate monthly calendar data for year view
  const generateMonthlyCalendars = () => {
    const today = new Date()
    const calendars = []
    
    const monthsToShow = Math.ceil(selectedDays / 30)
    
    for (let i = 0; i < monthsToShow; i++) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1)
      calendars.push({
        year: monthDate.getFullYear(),
        month: monthDate.getMonth() + 1
      })
    }
    
    return calendars
  }

  const monthlyCalendars = useMemo(generateMonthlyCalendars, [selectedDays])

  return (
    <div className="space-y-6">
      {/* Activity Grid */}
      <div className="w-full">
        {selectedDays === 30 ? (
          /* Single 30-day rolling window view */
          <WeeklyActivityGrid
            data={activities}
            onDateClick={handleDateClick}
            selectedDate={selectedDate}
            exactDays={30}
            className="w-full"
            isLoading={isLoading}
            progress={progress.total > 0 ? progress : undefined}
            onRefresh={refreshActivities}
            isRefreshing={isLoading}
            statusDot={{
              status: isLoading ? 'loading' : activities.length > 0 ? 'loaded' : 'error',
              syncTime: lastSyncTime || undefined
            }}
            allowFutureDates={false}
          />
        ) : (
          /* Year-style grid layout for 90+ days */
          <div className="space-y-6">
            {/* Monthly Grids - Organized by rows with better spacing */}
            <div className="relative p-3 bg-gradient-to-br from-muted/30 to-muted/10 rounded-xl border shadow-sm">
              {/* Progress Bar at top of calendar container */}
              {isLoading && progress.total > 0 && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-muted/50 rounded-t-xl overflow-hidden z-10">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              )}
              
              {/* Refresh Button - top right */}
              <HoverCard openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <button
                    onClick={refreshActivities}
                    disabled={isLoading}
                    className="absolute top-3 right-3 z-20 cursor-pointer hover:opacity-70 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <RefreshCwIcon className={cn("h-3.5 w-3.5 text-muted-foreground", isLoading && "animate-spin")} />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-auto p-2 text-xs" side="bottom" align="end">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {isLoading ? "Refreshing..." : "Refresh activity data"}
                    </div>
                    {lastSyncTime && !isLoading && (
                      <div className="text-muted-foreground">
                        Last updated: {lastSyncTime.toLocaleString()}
                      </div>
                    )}
                  </div>
                </HoverCardContent>
              </HoverCard>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pt-8">
                {[...monthlyCalendars].reverse().map((calendar) => (
                  <WeeklyActivityGrid
                    key={`${calendar.year}-${calendar.month}`}
                    data={activities}
                    onDateClick={handleDateClick}
                    selectedDate={selectedDate}
                    className="w-full"
                    isLoading={false}
                    progress={undefined}
                    onRefresh={undefined}
                    isRefreshing={isLoading}
                    statusDot={undefined}
                    showMonth={{ year: calendar.year, month: calendar.month }}
                    allowFutureDates={false}
                    compactMode={true}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
