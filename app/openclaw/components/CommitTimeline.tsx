/**
 * CommitTimeline.tsx
 * 
 * Date navigator for OpenClaw showing commit activity by day.
 * Similar to the main newspaper's DateTimeline but for GitHub commits.
 * 
 * Features:
 * - Horizontal scrollable date pills
 * - Shows commits per day with activity indicator
 * - Day range selector (1D, 3D, 7D)
 * - Timezone display
 */

'use client'

import { useRef, useState, useEffect } from 'react'
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  RefreshCwIcon,
  GitCommit,
  GitMerge,
} from 'lucide-react'
import type { DailyStats } from '../actions/cache'

export type DayRange = 1 | 3 | 7

const VISIBLE_DATES_MOBILE = 3
const VISIBLE_DATES_DESKTOP = 5

interface CommitTimelineProps {
  dailyStats: DailyStats[]
  selectedDate: string | null
  isLoadingDates: boolean
  isLoading: boolean
  onDateSelect: (date: string) => void
  onDayRangeChange?: (days: DayRange, dates: string[]) => void
  onRefresh?: () => void
  timezone?: string
}

export function CommitTimeline({ 
  dailyStats, 
  selectedDate, 
  isLoadingDates, 
  isLoading,
  onDateSelect,
  onDayRangeChange,
  onRefresh,
  timezone = 'UTC',
}: CommitTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [dayRange, setDayRange] = useState<DayRange>(1)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [scrollIndex, setScrollIndex] = useState(0)
  const [visibleCount, setVisibleCount] = useState(VISIBLE_DATES_DESKTOP)

  useEffect(() => {
    const updateVisibleCount = () => {
      const isMobile = window.innerWidth < 640
      setVisibleCount(isMobile ? VISIBLE_DATES_MOBILE : VISIBLE_DATES_DESKTOP)
    }
    updateVisibleCount()
    window.addEventListener('resize', updateVisibleCount)
    return () => window.removeEventListener('resize', updateVisibleCount)
  }, [])

  const updateScrollButtons = () => {
    setCanScrollLeft(scrollIndex > 0)
    setCanScrollRight(scrollIndex + visibleCount < dailyStats.length)
  }

  useEffect(() => {
    updateScrollButtons()
  }, [scrollIndex, visibleCount, dailyStats.length])

  const scrollTimeline = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      setScrollIndex(prev => Math.max(0, prev - 1))
    } else {
      setScrollIndex(prev => Math.min(Math.max(0, dailyStats.length - visibleCount), prev + 1))
    }
  }
  
  useEffect(() => {
    setScrollIndex(0)
  }, [dailyStats.length])

  const handleDayRangeChange = (newRange: DayRange) => {
    setDayRange(newRange)
    setScrollIndex(0)
    
    if (dailyStats.length > 0 && onDayRangeChange) {
      const mostRecentDate = dailyStats[0].date
      
      if (newRange === 1) {
        onDateSelect(mostRecentDate)
        onDayRangeChange(newRange, [mostRecentDate])
      } else {
        const datesToInclude = dailyStats.slice(0, newRange).map(d => d.date)
        onDateSelect(mostRecentDate)
        onDayRangeChange(newRange, datesToInclude)
      }
    }
  }
  
  const handleDateClick = (clickedDate: string) => {
    if (dayRange > 1) {
      const currentRangeDates = dailyStats.slice(0, dayRange).map(d => d.date)
      const isInCurrentRange = currentRangeDates.includes(clickedDate)
      
      if (!isInCurrentRange) {
        setDayRange(1)
        onDateSelect(clickedDate)
        if (onDayRangeChange) onDayRangeChange(1, [clickedDate])
        return
      }
    }
    onDateSelect(clickedDate)
  }

  useEffect(() => {
    if (selectedDate && dayRange === 1 && onDayRangeChange) {
      onDayRangeChange(dayRange, [selectedDate])
    }
  }, [selectedDate, dayRange, onDayRangeChange])

  const visibleDates = dailyStats.slice(scrollIndex, scrollIndex + visibleCount)

  const getDatesInRange = () => {
    if (dayRange === 1) return [selectedDate]
    if (dailyStats.length === 0) return [selectedDate]
    return dailyStats.slice(0, dayRange).map(d => d.date)
  }
  const datesInRange = getDatesInRange()

  const getActivityLevel = (commitCount: number): string => {
    if (commitCount >= 20) return 'bg-primary'
    if (commitCount >= 10) return 'bg-primary/70'
    if (commitCount >= 5) return 'bg-primary/50'
    return 'bg-primary/30'
  }

  const formatRelativeDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T12:00:00')
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    
    const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return ''
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-3 flex items-center gap-3 sm:gap-4">
        
        {/* Day Range Selector */}
        <div className="flex items-center gap-1 p-1 bg-card/80 border border-primary/20 rounded-full flex-shrink-0">
          {([1, 3, 7] as DayRange[]).map((range) => (
            <button
              key={range}
              onClick={() => handleDayRangeChange(range)}
              disabled={isLoading}
              className={`
                px-3 py-1.5 text-xs font-mono font-semibold rounded-full transition-all duration-200
                ${dayRange === range 
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }
                ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {range}D
            </button>
          ))}
        </div>

        {/* Scroll Left */}
        <button 
          onClick={() => scrollTimeline('left')}
          className={`
            p-2 rounded-full transition-all duration-200 flex-shrink-0
            hover:bg-primary/10 text-muted-foreground hover:text-primary
            ${!canScrollLeft ? 'opacity-30 pointer-events-none' : ''}
          `}
          aria-label="Earlier dates"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        
        {/* Timeline Container */}
        <div 
          ref={timelineRef}
          className="flex gap-2 overflow-hidden"
        >
          {isLoadingDates ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <RefreshCwIcon className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Loading commits...</span>
            </div>
          ) : dailyStats.length === 0 ? (
            <span className="text-xs text-muted-foreground py-2">
              No commits cached yet
            </span>
          ) : (
            visibleDates.map((dateStats, idx) => {
              const date = new Date(dateStats.date + 'T00:00:00')
              const isSelected = selectedDate === dateStats.date
              const isInRange = datesInRange.includes(dateStats.date)
              const isToday = dailyStats.length > 0 && dailyStats[0].date === dateStats.date
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
              const dayNum = date.getDate()
              const month = date.toLocaleDateString('en-US', { month: 'short' })
              const relativeDate = formatRelativeDate(dateStats.date)
              
              return (
                <button
                  key={dateStats.date}
                  onClick={() => handleDateClick(dateStats.date)}
                  disabled={isLoading}
                  style={{ animationDelay: `${idx * 30}ms` }}
                  className={`
                    stagger-item flex-shrink-0 relative group
                    px-4 py-2 rounded-sm transition-all duration-200
                    ${isSelected 
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' 
                      : isInRange && dayRange > 1
                        ? 'bg-primary/20 text-primary border border-primary/40'
                        : 'bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground border border-transparent hover:border-primary/20'
                    }
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {/* Today indicator */}
                  {isToday && (
                    <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                      isSelected ? 'bg-background' : 'bg-primary'
                    } animate-pulse`} />
                  )}
                  
                  {/* Activity indicator bar */}
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${getActivityLevel(dateStats.commitCount)} rounded-b-sm`} />
                  
                  <div className="flex flex-col items-center">
                    <span className={`text-[10px] uppercase tracking-wider ${
                      isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground/60'
                    }`}>
                      {dayName}
                    </span>
                    <span className="text-lg font-bold font-mono leading-none mt-0.5">
                      {dayNum}
                    </span>
                    <span className={`text-[9px] uppercase ${
                      isSelected ? 'text-primary-foreground/60' : 'text-muted-foreground/50'
                    }`}>
                      {month}
                    </span>
                  </div>
                  
                  {/* Commit count tooltip on hover */}
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <span className="text-[10px] font-mono bg-card border border-primary/20 px-2 py-1 rounded whitespace-nowrap flex items-center gap-1">
                      <GitCommit className="w-3 h-3" />
                      {dateStats.commitCount}
                      {dateStats.mergeCount > 0 && (
                        <>
                          <GitMerge className="w-3 h-3 ml-1 text-purple-400" />
                          {dateStats.mergeCount}
                        </>
                      )}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
        
        {/* Scroll Right */}
        <button 
          onClick={() => scrollTimeline('right')}
          className={`
            p-2 rounded-full transition-all duration-200 flex-shrink-0
            hover:bg-primary/10 text-muted-foreground hover:text-primary
            ${!canScrollRight ? 'opacity-30 pointer-events-none' : ''}
          `}
          aria-label="Later dates"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />
      </div>
    </div>
  )
}
