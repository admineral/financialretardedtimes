'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { TrendingUpIcon, ClockIcon, MessageCircleIcon } from 'lucide-react'

interface ActivityStatsProps {
  totalMessages: number
  averagePerDay?: number
  topHours?: Array<{ hour: number; count: number; percentage: number }>
  className?: string
  layout?: 'horizontal' | 'vertical' | 'compact' | 'grid'
  showIcons?: boolean
  maxTopHours?: number
}

export function ActivityStats({ 
  totalMessages, 
  averagePerDay,
  topHours = [],
  className,
  layout = 'horizontal',
  showIcons = true,
  maxTopHours = 3
}: ActivityStatsProps) {
  
  // Calculate average per day if not provided (assuming 28 days for 4 weeks)
  const effectiveAveragePerDay = averagePerDay || Math.round(totalMessages / 28)
  
  // Get top hours to display
  const displayTopHours = topHours.slice(0, maxTopHours)

  if (layout === 'compact') {
    return (
      <div className={cn(
        "flex items-center justify-center gap-3 px-6 py-4",
        "bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50",
        "dark:from-blue-950/20 dark:via-purple-950/20 dark:to-pink-950/20",
        "rounded-xl border border-blue-200/50 dark:border-blue-800/50 shadow-sm",
        "text-sm font-medium",
        className
      )}>
        {/* Total Messages */}
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            {totalMessages.toLocaleString()}
          </span>
          <span className="text-muted-foreground">Nachrichten</span>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Average per Day */}
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-purple-600 dark:text-purple-400">
            {effectiveAveragePerDay}
          </span>
          <span className="text-muted-foreground">pro Tag</span>
        </div>

        {displayTopHours.length > 0 && (
          <>
            <div className="h-6 w-px bg-border" />
            
            {/* Top Hours */}
            <div className="flex items-center gap-2">
              {displayTopHours.map((hourData, index) => (
                <div 
                  key={hourData.hour}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                    index === 0 && "bg-orange-100 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-800",
                    index === 1 && "bg-amber-100 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800",
                    index === 2 && "bg-yellow-100 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-800"
                  )}
                >
                  <span className="text-base">🕐</span>
                  <span className={cn(
                    "font-bold",
                    index === 0 && "text-orange-700 dark:text-orange-400",
                    index === 1 && "text-amber-700 dark:text-amber-400",
                    index === 2 && "text-yellow-700 dark:text-yellow-400"
                  )}>
                    {hourData.hour.toString().padStart(2, '0')}:00
                  </span>
                  <span className={cn(
                    "text-sm",
                    index === 0 && "text-orange-600 dark:text-orange-500",
                    index === 1 && "text-amber-600 dark:text-amber-500",
                    index === 2 && "text-yellow-600 dark:text-yellow-500"
                  )}>
                    ({hourData.count})
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  if (layout === 'grid') {
    return (
      <div className={cn("grid grid-cols-2 gap-3", className)}>
        {/* Total Messages */}
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
          {showIcons && <MessageCircleIcon className="h-4 w-4 text-blue-600" />}
          <div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-400">
              {totalMessages.toLocaleString()}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-500">Nachrichten</div>
          </div>
        </div>

        {/* Average per Day */}
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
          {showIcons && <TrendingUpIcon className="h-4 w-4 text-green-600" />}
          <div>
            <div className="text-lg font-bold text-green-700 dark:text-green-400">
              {effectiveAveragePerDay}
            </div>
            <div className="text-xs text-green-600 dark:text-green-500">pro Tag</div>
          </div>
        </div>

        {/* Top Hours */}
        {displayTopHours.length > 0 && (
          <div className="col-span-2 space-y-2">
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {showIcons && <ClockIcon className="h-4 w-4" />}
              Peak Zeiten
            </div>
            <div className="flex flex-wrap gap-2">
              {displayTopHours.map((hourData, index) => (
                <div 
                  key={hourData.hour}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border",
                    index === 0 
                      ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400" 
                      : index === 1
                      ? "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-800 dark:text-orange-400"
                      : "bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950/20 dark:border-yellow-800 dark:text-yellow-400"
                  )}
                >
                  <div className="text-sm font-bold">
                    {hourData.hour.toString().padStart(2, '0')}:00
                  </div>
                  <div className="text-xs opacity-80">
                    {hourData.count} ({hourData.percentage.toFixed(1)}%)
                  </div>
                  {index === 0 && <span className="text-xs">🔥</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (layout === 'vertical') {
    return (
      <div className={cn("space-y-3", className)}>
        {/* Total Messages */}
        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
          <div className="flex items-center gap-2">
            {showIcons && <MessageCircleIcon className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">Nachrichten</span>
          </div>
          <span className="font-bold">{totalMessages.toLocaleString()}</span>
        </div>

        {/* Average per Day */}
        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
          <div className="flex items-center gap-2">
            {showIcons && <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">Pro Tag</span>
          </div>
          <span className="font-bold">{effectiveAveragePerDay}</span>
        </div>

        {/* Top Hours */}
        {displayTopHours.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {showIcons && <ClockIcon className="h-4 w-4" />}
              Peak Zeiten
            </div>
            {displayTopHours.map((hourData, index) => (
              <div 
                key={hourData.hour}
                className="flex items-center justify-between p-2 bg-muted/30 rounded"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {hourData.hour.toString().padStart(2, '0')}:00
                  </span>
                  {index === 0 && <span className="text-xs">🔥</span>}
                </div>
                <span className="font-bold text-sm">
                  {hourData.count} <span className="text-xs text-muted-foreground">({hourData.percentage.toFixed(1)}%)</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Default horizontal layout
  return (
    <div className={cn("flex flex-wrap gap-3 text-sm justify-center", className)}>
      <div className="px-3 py-1 bg-muted/50 rounded-full border text-muted-foreground">
        {showIcons && <MessageCircleIcon className="inline h-3 w-3 mr-1" />}
        <span className="font-medium">{totalMessages.toLocaleString()}</span> Nachrichten
      </div>
      <div className="px-3 py-1 bg-muted/50 rounded-full border text-muted-foreground">
        {showIcons && <TrendingUpIcon className="inline h-3 w-3 mr-1" />}
        <span className="font-medium">{effectiveAveragePerDay}</span> pro Tag
      </div>
      
      {/* Peak Times Stats */}
      {displayTopHours.map((hourData, index) => (
        <div 
          key={hourData.hour}
          className={cn(
            "px-3 py-1 rounded-full border text-muted-foreground",
            index === 0 
              ? "bg-green-100 border-green-300 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400" 
              : "bg-muted/50"
          )}
        >
          {showIcons && <ClockIcon className="inline h-3 w-3 mr-1" />}
          <span className="font-medium">🕐 {hourData.hour.toString().padStart(2, '0')}:00</span> ({hourData.count})
        </div>
      ))}
    </div>
  )
}
