'use client'

import React from 'react'
import { format, subDays, isSameDay, addDays, getDay, endOfMonth, isBefore, isAfter } from 'date-fns'
import { de } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { RefreshCwIcon } from 'lucide-react'
import { createPortal } from 'react-dom'

interface ActivityData {
  date: string // YYYY-MM-DD format
  count: number
  messages?: Array<{
    id: string
    text: string
    time: string
  }>
}

interface WeeklyActivityGridProps {
  data: ActivityData[]
  className?: string
  onDateClick?: (date: Date) => void
  selectedDate?: Date
  weeks?: number
  exactDays?: number // Show exactly N days instead of full weeks
  isLoading?: boolean
  progress?: { current: number; total: number }
  onRefresh?: () => void
  isRefreshing?: boolean
  statusDot?: {
    status: 'loading' | 'loaded' | 'error'
    syncTime?: Date
  }
  showMonth?: { year: number; month: number } // Add option to show specific month (1-12)
  allowFutureDates?: boolean // Allow showing future dates (for streaming)
  compactMode?: boolean // Compact mode for year view (smaller squares, no labels)
  minimal?: boolean // Minimal mode - no container, no header, just the grid
}

export function WeeklyActivityGrid({ 
  data, 
  className, 
  onDateClick, 
  selectedDate,
  weeks = 4,
  exactDays,
  isLoading = false,
  progress,
  onRefresh,
  isRefreshing = false,
  statusDot,
  showMonth,
  allowFutureDates = false,
  compactMode = false,
  minimal = false
}: WeeklyActivityGridProps) {
  const [hoveredSquare, setHoveredSquare] = React.useState<{ date: string; count: number; x: number; y: number } | null>(null)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  // German day labels starting with Saturday
  const dayLabels = ['Sa', 'So', 'Mo', 'Di', 'Mi', 'Do', 'Fr']

  // Generate weeks data
  const generateWeeksData = () => {
    const today = new Date()
    const weeksData = []
    
    if (showMonth) {
      // Show specific month - ONLY dates that belong to this month
      const monthStart = new Date(showMonth.year, showMonth.month - 1, 1) // month is 0-indexed
      const monthEnd = endOfMonth(monthStart)
      const endDate = allowFutureDates ? monthEnd : (isBefore(today, monthEnd) ? today : monthEnd)
      
      // Find the Saturday before or on the month start
      const firstSaturday = addDays(monthStart, (6 - getDay(monthStart)) % 7 - 6)
      
      // Calculate how many weeks we need to cover the month
      let currentWeekStart = firstSaturday
      while (isBefore(currentWeekStart, endDate) || isSameDay(currentWeekStart, endDate)) {
        const weekDays = []
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const date = addDays(currentWeekStart, dayIndex)
          
          // ONLY include dates that are:
          // 1. Within the current month (same month and year)
          // 2. Not in the future (if allowFutureDates is false)
          const isInCurrentMonth = date.getMonth() === showMonth.month - 1 && date.getFullYear() === showMonth.year
          const isNotInFuture = allowFutureDates || !isAfter(date, today)
          
          if (isInCurrentMonth && isNotInFuture) {
            weekDays.push(date)
          }
        }
        
        // Only add the week if it has at least one day in this month
        if (weekDays.length > 0) {
          weeksData.push({
            weekStart: currentWeekStart,
            days: weekDays
          })
        }
        
        currentWeekStart = addDays(currentWeekStart, 7)
      }
    } else if (exactDays) {
      // Show exactly N days ending today (no week alignment)
      const startDate = subDays(today, exactDays - 1)
      
      // Find the Saturday on or before the start date
      const firstSaturday = addDays(startDate, -((getDay(startDate) + 1) % 7))
      
      // Generate weeks from that Saturday
      let currentWeekStart = firstSaturday
      const endDate = today
      
      while (isBefore(currentWeekStart, endDate) || isSameDay(currentWeekStart, endDate)) {
        const weekDays = []
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const date = addDays(currentWeekStart, dayIndex)
          // Only include dates up to today and within our exact range
          if (!isAfter(date, today) && !isBefore(date, startDate)) {
            weekDays.push(date)
          }
        }
        
        if (weekDays.length > 0) {
          weeksData.push({
            weekStart: currentWeekStart,
            days: weekDays
          })
        }
        
        currentWeekStart = addDays(currentWeekStart, 7)
      }
    } else {
      // Show last N weeks ending today (rolling window)
      // Calculate the total number of days to show
      const totalDays = weeks * 7
      const startDate = subDays(today, totalDays - 1)
      
      // Find the Saturday on or before the start date
      const firstSaturday = addDays(startDate, -((getDay(startDate) + 1) % 7))
      
      // Generate weeks from that Saturday until today
      let currentWeekStart = firstSaturday
      const endDate = today
      
      while (isBefore(currentWeekStart, endDate) || isSameDay(currentWeekStart, endDate)) {
        const weekDays = []
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const date = addDays(currentWeekStart, dayIndex)
          // Only include dates up to today and within our range
          if (!isAfter(date, today) && !isBefore(date, startDate)) {
            weekDays.push(date)
          }
        }
        
        if (weekDays.length > 0) {
          weeksData.push({
            weekStart: currentWeekStart,
            days: weekDays
          })
        }
        
        currentWeekStart = addDays(currentWeekStart, 7)
      }
    }
    
    return weeksData
  }

  const weeksData = generateWeeksData()

  // Get current month name for header
  const getCurrentMonthHeader = () => {
    if (showMonth) {
      const monthDate = new Date(showMonth.year, showMonth.month - 1, 1)
      // For compact mode (year view), only show month name
      if (compactMode) {
        return format(monthDate, 'MMMM', { locale: de })
      }
      // For regular mode, show month and year
      return format(monthDate, 'MMMM yyyy', { locale: de })
    }
    // For rolling window, show "Last N Days"
    const totalDays = exactDays || (weeks * 7)
    return `Last ${totalDays} Days`
  }

  // Get activity count for a specific date
  const getActivityCount = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const activity = data.find(d => d.date === dateStr)
    return activity?.count || 0
  }

  // Calculate maximum message count for dynamic scaling
  const maxCount = React.useMemo(() => {
    return Math.max(...data.map(d => d.count), 1) // Ensure minimum of 1 to avoid division by zero
  }, [data])

  // Get intensity class based on message count (dynamic scale)
  const getIntensityClass = (count: number, hasData: boolean = true) => {
    if (!hasData) return 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700 animate-pulse'
    if (count === 0) return 'bg-gray-100 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
    
    // Calculate intensity as percentage of max count
    const intensity = count / maxCount
    
    if (intensity <= 0.2) return 'bg-green-100 border-green-200 dark:bg-green-950/30 dark:border-green-800'
    if (intensity <= 0.4) return 'bg-green-200 border-green-300 dark:bg-green-900/50 dark:border-green-700'
    if (intensity <= 0.6) return 'bg-green-300 border-green-400 dark:bg-green-800/70 dark:border-green-600'
    if (intensity <= 0.8) return 'bg-green-400 border-green-500 dark:bg-green-700/80 dark:border-green-500'
    return 'bg-green-500 border-green-600 dark:bg-green-600 dark:border-green-400'
  }

  // Check if we have data for a specific date
  const hasDataForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return data.some(d => d.date === dateStr)
  }

  // Handle square click
  const handleSquareClick = (date: Date) => {
    if (onDateClick) {
      onDateClick(date)
    }
  }

  // Handle mouse enter for tooltip
  const handleMouseEnter = (event: React.MouseEvent, date: Date, count: number) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setHoveredSquare({
      date: format(date, 'yyyy-MM-dd'),
      count,
      x: rect.left + rect.width / 2,
      y: rect.top - 8 // Position above the square
    })
  }

  // Handle mouse leave
  const handleMouseLeave = () => {
    setHoveredSquare(null)
  }

  // Tooltip component that uses portal
  const TooltipPortal = () => {
    if (!hoveredSquare || !isMounted) return null

    const tooltipContent = (
      <div
        className="fixed z-[9999] px-3 py-2 text-xs bg-popover text-popover-foreground border rounded-lg shadow-xl pointer-events-none whitespace-nowrap"
        style={{
          left: `${hoveredSquare.x}px`,
          top: `${hoveredSquare.y}px`,
          transform: 'translateX(-50%) translateY(-100%)'
        }}
      >
        <div className="font-medium">
          {format(new Date(hoveredSquare.date), 'EEEE, do MMMM yyyy', { locale: de })}
        </div>
        <div className="text-muted-foreground">
          {hoveredSquare.count} {hoveredSquare.count === 1 ? 'Nachricht' : 'Nachrichten'}
        </div>
        
        {/* Speech bubble arrow pointing down */}
        <div 
          className="absolute left-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-popover"
          style={{ transform: 'translateX(-50%)' }}
        />
      </div>
    )

    return createPortal(tooltipContent, document.body)
  }

  // Compact mode: smaller, no padding, minimal UI
  if (compactMode) {
    return (
      <div className={cn("relative", className)}>
        {/* Light container around each month */}
        <div className="p-3 bg-background/50 dark:bg-background/30 border border-border/40 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 h-full flex flex-col">
          <div className="space-y-2 flex-1 flex flex-col">
            {/* Compact Month Header */}
            <div className="text-center text-xs font-semibold text-foreground/80">
              {getCurrentMonthHeader()}
            </div>
            
            {/* Day labels for compact mode */}
            <div className="grid grid-cols-7 gap-1 text-[0.5rem] text-muted-foreground/60 font-medium text-center">
              {dayLabels.map((day, idx) => (
                <div key={idx}>{day.charAt(0)}</div>
              ))}
            </div>
            
            {/* Compact Grid - fixed 7 columns with proper alignment */}
            <div className="grid grid-cols-7 gap-1 flex-1 content-start">
              {weeksData.map((week, weekIndex) => {
                // Calculate how many empty cells we need at the start of first week
                // Day 0 = Sunday, 1 = Monday, etc.
                // We want Saturday (6) to be first column
                const startPadding = []
                if (showMonth && weekIndex === 0 && week.days.length > 0) {
                  const firstDayOfWeek = week.days[0].getDay()
                  // Convert to our Saturday-first layout: Sat=0, Sun=1, Mon=2, etc.
                  const padding = (firstDayOfWeek === 6) ? 0 : (firstDayOfWeek + 1)
                  for (let i = 0; i < padding; i++) {
                    startPadding.push(
                      <div key={`week-${weekIndex}-placeholder-start-${i}`} className="w-4 h-4" />
                    )
                  }
                }
                
                // Calculate end padding for last week
                const endPadding = []
                if (showMonth && weekIndex === weeksData.length - 1 && week.days.length > 0) {
                  const lastDayOfWeek = week.days[week.days.length - 1].getDay()
                  // Convert to our Saturday-first layout
                  const lastDayPosition = (lastDayOfWeek === 6) ? 0 : (lastDayOfWeek + 1)
                  const padding = 6 - lastDayPosition
                  for (let i = 0; i < padding; i++) {
                    endPadding.push(
                      <div key={`week-${weekIndex}-placeholder-end-${i}`} className="w-4 h-4" />
                    )
                  }
                }
                
                return (
                  <React.Fragment key={weekIndex}>
                    {/* Add placeholder divs for days before the first day of month */}
                    {startPadding}
                    
                    {week.days.map((date, dayIndex) => {
                      const count = getActivityCount(date)
                      const hasData = hasDataForDate(date)
                      const isSelected = selectedDate && isSameDay(date, selectedDate)
                      const isToday = isSameDay(date, new Date())
                      
                      return (
                        <div
                          key={`week-${weekIndex}-day-${dayIndex}`}
                          className={cn(
                            "w-4 h-4 border cursor-pointer transition-all duration-200 hover:scale-150 hover:z-10 rounded-sm",
                            getIntensityClass(count, hasData),
                            isSelected && "ring-1 ring-blue-500 ring-offset-1 scale-110",
                            isToday && "ring-1 ring-orange-400 ring-offset-[0.5px]",
                            "hover:shadow-md"
                          )}
                          onClick={() => handleSquareClick(date)}
                          onMouseEnter={(e) => handleMouseEnter(e, date, count)}
                          onMouseLeave={handleMouseLeave}
                        />
                      )
                    })}
                    
                    {/* Add placeholder divs for days after the last day of month */}
                    {endPadding}
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        </div>

        {/* Tooltip via Portal */}
        <TooltipPortal />
      </div>
    )
  }

  // Minimal mode: just the grid, no container
  if (minimal) {
    return (
      <div className={cn("relative", className)}>
        {/* Day Labels Header */}
        <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground font-semibold justify-center mb-2">
          {dayLabels.map((day, index) => (
            <div key={index} className="text-center w-6">
              {day}
            </div>
          ))}
        </div>

        {/* Weekly Grid */}
        <div className="space-y-2">
          {weeksData.map((week, weekIndex) => {
            // Create an array of 7 slots for proper grid alignment
            const gridSlots = Array(7).fill(null)
            
            // Fill in the actual days in their correct positions
            week.days.forEach(date => {
              // Calculate position: Saturday=0, Sunday=1, Monday=2, etc.
              const dayOfWeek = date.getDay()
              const position = dayOfWeek === 6 ? 0 : dayOfWeek + 1
              gridSlots[position] = date
            })
            
            return (
              <div key={weekIndex} className="grid grid-cols-7 gap-2 items-center justify-center">
                {gridSlots.map((date, slotIndex) => {
                  if (!date) {
                    // Empty slot for alignment
                    return <div key={`empty-${slotIndex}`} className="w-6 h-6" />
                  }
                  
                  const count = getActivityCount(date)
                  const hasData = hasDataForDate(date)
                  const isSelected = selectedDate && isSameDay(date, selectedDate)
                  const isToday = isSameDay(date, new Date())
                  
                  return (
                    <div
                      key={slotIndex}
                      className={cn(
                        "w-6 h-6 border cursor-pointer transition-all duration-500 hover:scale-125 hover:z-10 rounded-md relative shadow-sm",
                        getIntensityClass(count, hasData),
                        isSelected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-background scale-110 shadow-md",
                        isToday && "ring-2 ring-orange-400 ring-offset-1",
                        "hover:shadow-lg hover:border-primary/50",
                        hasData && "animate-in fade-in-0 zoom-in-95 duration-300"
                      )}
                      onClick={() => handleSquareClick(date)}
                      onMouseEnter={(e) => handleMouseEnter(e, date, count)}
                      onMouseLeave={handleMouseLeave}
                    >
                      {/* Today indicator */}
                      {isToday && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full border border-white shadow-sm animate-pulse"></div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Tooltip via Portal */}
        <TooltipPortal />
      </div>
    )
  }

  // Regular mode: full-featured calendar
  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-col items-center space-y-6">
        {/* Compact Activity Grid Container */}
        <div className="inline-flex flex-col space-y-3 p-6 bg-gradient-to-br from-muted/30 to-muted/10 rounded-xl border shadow-sm relative overflow-hidden">
          {/* Top Progress Bar */}
          {isLoading && progress && progress.total > 0 && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-muted/50 z-10">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
          
          {/* Month Header with Status Dot and Refresh Button */}
          <div className="relative mb-2">
            <div className="text-center text-sm font-semibold text-muted-foreground">
              {getCurrentMonthHeader()}
            </div>
            
            {/* Status Dot */}
            {statusDot && (
              <HoverCard openDelay={100} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <div className="absolute -top-0.5 -left-0.5 cursor-help">
                    <div className={cn(
                      "w-3 h-3 rounded-full transition-all duration-200 opacity-50",
                      statusDot.status === 'loading' && "bg-blue-500 animate-pulse",
                      statusDot.status === 'loaded' && "bg-green-500",
                      statusDot.status === 'error' && "bg-red-500"
                    )} />
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-auto p-2 text-xs" side="bottom" align="start">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {statusDot.status === 'loading' && "Loading activity data..."}
                      {statusDot.status === 'loaded' && "Activity data synced"}
                      {statusDot.status === 'error' && "Failed to load data"}
                    </div>
                    {statusDot.syncTime && statusDot.status === 'loaded' && (
                      <div className="text-muted-foreground">
                        {format(statusDot.syncTime, 'MMM d, HH:mm:ss')}
                      </div>
                    )}
                  </div>
                </HoverCardContent>
              </HoverCard>
            )}
            
            {/* Refresh Button */}
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="absolute -top-0.5 -right-0.5 h-3 w-3 p-0 hover:bg-muted/20 rounded-full opacity-50 hover:opacity-80 transition-opacity"
                title="Refresh activity data"
              >
                <RefreshCwIcon className={cn("h-2 w-2 stroke-[1.5]", isRefreshing && "animate-spin")} />
              </Button>
            )}
          </div>
          
          {/* Day Labels Header */}
          <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground font-semibold justify-center">
            {dayLabels.map((day, index) => (
              <div key={index} className="text-center w-6">
                {day}
              </div>
            ))}
          </div>

          {/* Weekly Grid */}
          <div className="space-y-2">
            {weeksData.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-2 items-center justify-center">
                {/* Days in Week */}
                {week.days.map((date, dayIndex) => {
                  const count = getActivityCount(date)
                  const hasData = hasDataForDate(date)
                  const isSelected = selectedDate && isSameDay(date, selectedDate)
                  const isToday = isSameDay(date, new Date())
                  
                  return (
                    <div
                      key={dayIndex}
                      className={cn(
                        "w-6 h-6 border cursor-pointer transition-all duration-500 hover:scale-125 hover:z-10 rounded-md relative shadow-sm",
                        getIntensityClass(count, hasData),
                        isSelected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-background scale-110 shadow-md",
                        isToday && "ring-2 ring-orange-400 ring-offset-1",
                        "hover:shadow-lg hover:border-primary/50",
                        hasData && "animate-in fade-in-0 zoom-in-95 duration-300"
                      )}
                      onClick={() => handleSquareClick(date)}
                      onMouseEnter={(e) => handleMouseEnter(e, date, count)}
                      onMouseLeave={handleMouseLeave}
                    >
                      {/* Loading indicator for squares without data */}
                      {!hasData && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                        </div>
                      )}

                      {/* Today indicator */}
                      {isToday && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full border border-white shadow-sm animate-pulse"></div>
                      )}
                      

                    </div>
                  )
                })}
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Tooltip via Portal */}
      <TooltipPortal />
    </div>
  )
}

