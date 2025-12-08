/**
 * DateTimeline.tsx
 * 
 * REDESIGNED: Premium ticker-tape style date navigator
 * 
 * Features:
 * - Horizontal scrollable date pills with gold accents
 * - Animated day range selector
 * - Minimalist iconography
 * - Glassmorphism effects
 */

'use client'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { track } from '@vercel/analytics'
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  RefreshCwIcon,
  BarChart3Icon
} from 'lucide-react'
import type { DateStats } from '../lib/types'

export type DayRange = 1 | 3 | 7

const VISIBLE_DATES_MOBILE = 3
const VISIBLE_DATES_DESKTOP = 4

interface DateTimelineProps {
  availableDates: DateStats[]
  selectedDate: string | null
  isLoadingDates: boolean
  isLoading: boolean
  onDateSelect: (date: string) => void
  onDayRangeChange?: (days: DayRange, dates: string[]) => void
  onRefresh?: () => void
  cumulativeUsers?: Record<number, number>
}

export function DateTimeline({ 
  availableDates, 
  selectedDate, 
  isLoadingDates, 
  isLoading,
  onDateSelect,
  onDayRangeChange,
  onRefresh,
  cumulativeUsers
}: DateTimelineProps) {
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
    setCanScrollRight(scrollIndex + visibleCount < availableDates.length)
  }

  useEffect(() => {
    updateScrollButtons()
  }, [scrollIndex, visibleCount, availableDates.length])

  const scrollTimeline = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      setScrollIndex(prev => Math.max(0, prev - 1))
    } else {
      setScrollIndex(prev => Math.min(Math.max(0, availableDates.length - visibleCount), prev + 1))
    }
    track('newspaper_timeline_scroll', { direction })
  }
  
  useEffect(() => {
    setScrollIndex(0)
  }, [availableDates.length])

  const handleDayRangeChange = (newRange: DayRange) => {
    setDayRange(newRange)
    setScrollIndex(0)
    
    if (availableDates.length > 0 && onDayRangeChange) {
      const mostRecentDate = availableDates[0].date
      
      if (newRange === 1) {
        onDateSelect(mostRecentDate)
        onDayRangeChange(newRange, [mostRecentDate])
      } else {
        const datesToInclude = availableDates.slice(0, newRange).map(d => d.date)
        onDateSelect(mostRecentDate)
        onDayRangeChange(newRange, datesToInclude)
      }
    }
  }
  
  const handleDateClick = (clickedDate: string) => {
    if (dayRange > 1) {
      const currentRangeDates = availableDates.slice(0, dayRange).map(d => d.date)
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

  const selectedDateInfo = availableDates.find(d => d.date === selectedDate)
  
  const getMultiDayStats = () => {
    if (dayRange === 1 || availableDates.length === 0) return null
    const datesInRange = availableDates.slice(0, dayRange)
    const totalMessages = datesInRange.reduce((sum, d) => sum + d.messageCount, 0)
    const totalUsers = cumulativeUsers?.[dayRange] ?? datesInRange.reduce((sum, d) => sum + d.uniqueUsers, 0)
    return { totalMessages, totalUsers, daysCount: dayRange, actualDays: datesInRange.length }
  }
  
  const multiDayStats = getMultiDayStats()
  const visibleDates = availableDates.slice(scrollIndex, scrollIndex + visibleCount)

  const getDatesInRange = () => {
    if (dayRange === 1) return [selectedDate]
    if (availableDates.length === 0) return [selectedDate]
    return availableDates.slice(0, dayRange).map(d => d.date)
  }
  const datesInRange = getDatesInRange()

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-3 flex items-center gap-3 sm:gap-4">
        
        {/* Day Range Selector - Pill style */}
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
          aria-label="Frühere Daten"
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
              <span>Lade Daten...</span>
            </div>
          ) : availableDates.length === 0 ? (
            <span className="text-xs text-muted-foreground py-2">
              Keine Daten verfügbar
            </span>
          ) : (
            visibleDates.map((dateStats, idx) => {
              const date = new Date(dateStats.date + 'T00:00:00')
              const isSelected = selectedDate === dateStats.date
              const isInRange = datesInRange.includes(dateStats.date)
              const isToday = availableDates.length > 0 && availableDates[0].date === dateStats.date
              const dayName = date.toLocaleDateString('de-DE', { weekday: 'short' })
              const dayNum = date.getDate()
              const month = date.toLocaleDateString('de-DE', { month: 'short' })
              
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
                  
                  {/* Message count tooltip on hover */}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <span className="text-[10px] font-mono bg-card border border-primary/20 px-2 py-0.5 rounded whitespace-nowrap">
                      {dateStats.messageCount.toLocaleString()} msgs
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
          aria-label="Spätere Daten"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>

        {/* Stats Display - right after timeline */}
        <div className="hidden md:flex items-center gap-3 border-l border-primary/20 pl-4 flex-shrink-0">
          {multiDayStats ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-primary font-bold font-mono">{multiDayStats.daysCount}D</span>
              <span className="text-muted-foreground/40">|</span>
              <span className="font-mono text-muted-foreground">
                {multiDayStats.totalMessages.toLocaleString('de-DE')}
                <span className="text-muted-foreground/60 ml-1 hidden lg:inline">Nachrichten</span>
              </span>
              <span className="text-muted-foreground/40">|</span>
              <span className="font-mono text-muted-foreground">
                {multiDayStats.totalUsers}
                <span className="text-muted-foreground/60 ml-1 hidden lg:inline">User</span>
              </span>
            </div>
          ) : selectedDateInfo && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-muted-foreground">
                {selectedDateInfo.messageCount.toLocaleString()}
                <span className="text-muted-foreground/60 ml-1 hidden lg:inline">Nachrichten</span>
              </span>
              <span className="text-muted-foreground/40">|</span>
              <span className="font-mono text-muted-foreground">
                {selectedDateInfo.uniqueUsers}
                <span className="text-muted-foreground/60 ml-1 hidden lg:inline">User</span>
              </span>
            </div>
          )}
        </div>

        {/* Spacer to push actions to the right */}
        <div className="flex-1" />
        
        {/* Divider */}
        <div className="w-px h-6 bg-primary/10 hidden sm:block flex-shrink-0" />
        
        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Rate-Chart - Always visible */}
          <Link 
            href="/Rate-Chart"
            onClick={() => track('newspaper_nav_link', { destination: 'rate-chart', source: 'timeline' })}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs rounded-sm transition-all border-2 border-[#D4AF37] text-[#D4AF37] hover:text-[#FFD700] hover:bg-[#D4AF37]/10 animate-golden-flash font-semibold"
          >
            <BarChart3Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rate-Chart</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
