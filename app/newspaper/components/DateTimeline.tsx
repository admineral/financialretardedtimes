/**
 * DateTimeline.tsx
 * 
 * Horizontal scrollable date picker for selecting chat archive dates.
 * 
 * LOCAL: Renders a timeline of available dates with:
 * - Scroll buttons for navigation
 * - Date buttons showing day name and number
 * - Visual indicator for today's date
 * - Selected date info (message count, user count)
 * - Quick actions: Search, Refresh, Rate-Chart, Chat links
 * - Day range selector (1 day, 3 days, 7 days) for multi-day summaries
 * 
 * GLOBAL: Controls which date's content is displayed across all newspaper components.
 * Fetches available dates from /newspaper/api/available-dates on mount.
 * 
 * EXPORTS: DateTimeline (React component)
 * 
 * PROPS:
 * - availableDates: DateStats[] - Array of dates with statistics
 * - selectedDate: string | null - Currently selected date (YYYY-MM-DD)
 * - isLoadingDates: boolean - Whether dates are being fetched
 * - isLoading: boolean - Whether content is being generated
 * - onDateSelect: (date: string) => void - Callback when date is selected
 * - onDayRangeChange: (days: number, dates: string[]) => void - Callback when day range changes
 * - onRefresh: () => void - Callback to refresh/regenerate content
 */

'use client'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { track } from '@vercel/analytics'
import { 
  CalendarIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  RefreshCwIcon,
  SearchIcon,
  BarChart3Icon,
  MessageSquareIcon
} from 'lucide-react'
import type { DateStats } from '../lib/types'

export type DayRange = 1 | 3 | 7

// Visible dates configuration per breakpoint
const VISIBLE_DATES_MOBILE = 3  // Mobile: show 3 dates
const VISIBLE_DATES_DESKTOP = 7 // Desktop: show 7 dates

interface DateTimelineProps {
  availableDates: DateStats[]
  selectedDate: string | null
  isLoadingDates: boolean
  isLoading: boolean
  onDateSelect: (date: string) => void
  onDayRangeChange?: (days: DayRange, dates: string[]) => void
  onRefresh?: () => void
  cumulativeUsers?: Record<number, number> // Pre-calculated deduplicated user counts for 1d, 3d, 7d
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [dayRange, setDayRange] = useState<DayRange>(1)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [scrollIndex, setScrollIndex] = useState(0)
  const [visibleCount, setVisibleCount] = useState(VISIBLE_DATES_DESKTOP)

  /**
   * Update visible count based on screen size
   */
  useEffect(() => {
    const updateVisibleCount = () => {
      // Mobile: < 640px (sm breakpoint)
      const isMobile = window.innerWidth < 640
      setVisibleCount(isMobile ? VISIBLE_DATES_MOBILE : VISIBLE_DATES_DESKTOP)
    }
    
    updateVisibleCount()
    window.addEventListener('resize', updateVisibleCount)
    return () => window.removeEventListener('resize', updateVisibleCount)
  }, [])

  /**
   * Update scroll button states based on current index
   */
  const updateScrollButtons = () => {
    setCanScrollLeft(scrollIndex > 0)
    setCanScrollRight(scrollIndex + visibleCount < availableDates.length)
  }

  // Update scroll buttons when index, visible count, or dates change
  useEffect(() => {
    updateScrollButtons()
  }, [scrollIndex, visibleCount, availableDates.length])

  /**
   * Scroll the timeline left or right by one date at a time
   */
  const scrollTimeline = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      setScrollIndex(prev => Math.max(0, prev - 1))
    } else {
      setScrollIndex(prev => Math.min(Math.max(0, availableDates.length - visibleCount), prev + 1))
    }
    // Track timeline navigation
    track('newspaper_timeline_scroll', { direction })
  }
  
  // Reset scroll index when dates change significantly
  useEffect(() => {
    setScrollIndex(0)
  }, [availableDates.length])

  /**
   * Handle day range change - calculate dates to include
   * 
   * Behavior:
   * - 1d: Always jumps to most recent date (today)
   * - 3d: Always shows last 3 days from most recent date
   * - 7d: Always shows last 7 days from most recent date
   */
  const handleDayRangeChange = (newRange: DayRange) => {
    setDayRange(newRange)
    
    // Reset scroll to show most recent dates
    setScrollIndex(0)
    
    if (availableDates.length > 0 && onDayRangeChange) {
      // ALL ranges start from the most recent date
      const mostRecentDate = availableDates[0].date
      
      if (newRange === 1) {
        // Single day: select most recent date
        onDateSelect(mostRecentDate)
        onDayRangeChange(newRange, [mostRecentDate])
      } else {
        // Multi-day (3d, 7d): select range from most recent date
        const datesToInclude = availableDates
          .slice(0, newRange)
          .map(d => d.date)
        
        onDateSelect(mostRecentDate)
        onDayRangeChange(newRange, datesToInclude)
      }
    }
  }
  
  /**
   * Handle date click in timeline
   * 
   * Behavior:
   * - If in multi-day mode (3d/7d) and clicking a date outside the current range:
   *   → Switch to 1d mode and select that date
   * - If in 1d mode: just select the date
   */
  const handleDateClick = (clickedDate: string) => {
    if (dayRange > 1) {
      // Check if clicked date is in the current multi-day range
      const currentRangeDates = availableDates.slice(0, dayRange).map(d => d.date)
      const isInCurrentRange = currentRangeDates.includes(clickedDate)
      
      if (!isInCurrentRange) {
        // Clicked outside range → switch to 1d mode with this date
        setDayRange(1)
        onDateSelect(clickedDate)
        if (onDayRangeChange) {
          onDayRangeChange(1, [clickedDate])
        }
        return
      }
    }
    
    // Normal case: just select the date
    onDateSelect(clickedDate)
  }

  // Update day range dates when selected date changes (only for single day mode)
  useEffect(() => {
    if (selectedDate && dayRange === 1 && onDayRangeChange) {
      onDayRangeChange(dayRange, [selectedDate])
    }
  }, [selectedDate, dayRange, onDayRangeChange])

  // Get stats for the currently selected date(s)
  const selectedDateInfo = availableDates.find(d => d.date === selectedDate)
  
  // Calculate total stats for multi-day range
  // Always calculates from most recent date (index 0) for multi-day modes
  const getMultiDayStats = () => {
    if (dayRange === 1 || availableDates.length === 0) return null
    
    // Always start from most recent date for multi-day
    const datesInRange = availableDates.slice(0, dayRange)
    const totalMessages = datesInRange.reduce((sum, d) => sum + d.messageCount, 0)
    
    // Use pre-calculated deduplicated user count if available
    const totalUsers = cumulativeUsers?.[dayRange] ?? 
      datesInRange.reduce((sum, d) => sum + d.uniqueUsers, 0)
    
    // Show requested dayRange (e.g., "7d") even if fewer days of data exist
    return { totalMessages, totalUsers, daysCount: dayRange, actualDays: datesInRange.length }
  }
  
  const multiDayStats = getMultiDayStats()
  
  // Show only the visible slice of dates based on scroll index
  const visibleDates = availableDates.slice(scrollIndex, scrollIndex + visibleCount)

  // Determine which dates are in the current range for visual highlighting
  // For multi-day modes, always highlight from most recent date
  const getDatesInRange = () => {
    if (dayRange === 1) return [selectedDate]
    if (availableDates.length === 0) return [selectedDate]
    // For multi-day, always start from most recent (index 0)
    return availableDates.slice(0, dayRange).map(d => d.date)
  }
  const datesInRange = getDatesInRange()

  return (
    <div className="w-full border-b border-foreground/10 bg-muted/20">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-2">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Left Section: Calendar Icon + Timeline */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Calendar Icon */}
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            
            {/* Day Range Selector */}
            <div className="flex items-center gap-0.5 border border-foreground/20 rounded-sm p-0.5 flex-shrink-0">
              {([1, 3, 7] as DayRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => handleDayRangeChange(range)}
                  disabled={isLoading}
                  className={`
                    px-1.5 py-0.5 text-[10px] rounded-sm transition-all font-medium
                    ${dayRange === range 
                      ? 'bg-primary text-primary-foreground' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {range}d
                </button>
              ))}
            </div>
            
            {/* Scroll Left Button - always enabled for consistent UX */}
            <button 
              onClick={() => scrollTimeline('left')}
              className={`
                p-1 rounded transition-colors flex-shrink-0 active:scale-95
                hover:bg-muted text-muted-foreground hover:text-foreground
                ${!canScrollLeft ? 'opacity-40' : ''}
              `}
              aria-label="Scroll left"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5 transition-colors" />
            </button>
            
            {/* Timeline Container */}
            <div 
              ref={timelineRef}
              className="flex gap-0.5 overflow-hidden"
            >
              {isLoadingDates ? (
                // Loading state
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <RefreshCwIcon className="h-3 w-3 animate-spin" />
                  <span>Lade...</span>
                </div>
              ) : availableDates.length === 0 ? (
                // Empty state
                <span className="text-xs text-muted-foreground py-1">
                  Keine Daten
                </span>
              ) : (
                // Date buttons - show visible slice
                visibleDates.map((dateStats) => {
                  const date = new Date(dateStats.date + 'T00:00:00')
                  const isSelected = selectedDate === dateStats.date
                  const isInRange = datesInRange.includes(dateStats.date)
                  // Check if this is the most recent date (first in full array)
                  const isToday = availableDates.length > 0 && availableDates[0].date === dateStats.date
                  const dayName = date.toLocaleDateString('de-DE', { weekday: 'short' })
                  const dayNum = date.getDate()
                  
                  return (
                    <button
                      key={dateStats.date}
                      onClick={() => handleDateClick(dateStats.date)}
                      disabled={isLoading}
                      className={`
                        flex-shrink-0 px-2 py-1 rounded text-[11px] transition-all
                        ${isSelected 
                          ? 'bg-foreground text-background font-medium' 
                          : isInRange && dayRange > 1
                            ? 'bg-primary/20 text-primary font-medium border border-primary/30'
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        }
                        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      <div className="flex items-center gap-1">
                        {isToday && (
                          <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-background' : 'bg-primary'}`} />
                        )}
                        <span>{dayName} {dayNum}.</span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
            
            {/* Scroll Right Button - always enabled for consistent UX */}
            <button 
              onClick={() => scrollTimeline('right')}
              className={`
                p-1 rounded transition-colors flex-shrink-0 active:scale-95
                hover:bg-muted text-muted-foreground hover:text-foreground
                ${!canScrollRight ? 'opacity-40' : ''}
              `}
              aria-label="Scroll right"
            >
              <ChevronRightIcon className="h-3.5 w-3.5 transition-colors" />
            </button>
            
            {/* Selected Date Stats - shows multi-day stats when range > 1 */}
            {multiDayStats ? (
              <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground border-l border-foreground/10 pl-2 flex-shrink-0">
                <span className="text-primary font-medium">{multiDayStats.daysCount}d</span>
                {multiDayStats.actualDays < multiDayStats.daysCount && (
                  <span className="text-muted-foreground/60">({multiDayStats.actualDays} verfügbar)</span>
                )}
                <span>•</span>
                <span>{multiDayStats.totalMessages.toLocaleString('de-DE')}</span>
                <span className="hidden lg:inline">Nachrichten</span>
                <span>•</span>
                <span>{multiDayStats.totalUsers}</span>
                <span className="hidden lg:inline">User</span>
              </div>
            ) : selectedDateInfo && (
              <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground border-l border-foreground/10 pl-2 flex-shrink-0">
                <span>{selectedDateInfo.messageCount}</span>
                <span className="hidden lg:inline">Nachrichten</span>
                <span>•</span>
                <span>{selectedDateInfo.uniqueUsers}</span>
                <span className="hidden lg:inline">User</span>
              </div>
            )}
          </div>
          
          {/* Right Section: Actions */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 border-l border-foreground/10 pl-2 sm:pl-3">
            {/* Search */}
            <div className="relative">
              {searchOpen ? (
                <input 
                  type="text" 
                  placeholder="Suchen..." 
                  autoFocus
                  onBlur={() => setSearchOpen(false)}
                  className="w-32 px-2 py-1 text-xs border border-foreground/20 bg-background rounded-sm font-body focus:outline-none focus:border-primary/50"
                />
              ) : (
                <button 
                  onClick={() => {
                    setSearchOpen(true)
                    track('newspaper_search_open')
                  }}
                  className="p-1.5 hover:bg-muted rounded transition-colors"
                  aria-label="Search"
                >
                  <SearchIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                </button>
              )}
            </div>
            
            {/* Refresh Button */}
            <button 
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 hover:bg-muted rounded transition-colors disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCwIcon className={`h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            
            {/* Divider */}
            <div className="w-px h-4 bg-foreground/10 hidden sm:block" />
            
            {/* Rate-Chart Link */}
            <Link 
              href="/Rate-Chart"
              onClick={() => track('newspaper_nav_link', { destination: 'rate-chart', source: 'timeline' })}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-headline hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
            >
              <BarChart3Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Rate-Chart</span>
            </Link>
            
            {/* Chat Link */}
            <Link 
              href="/Test"
              onClick={() => track('newspaper_nav_link', { destination: 'chat', source: 'timeline' })}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-headline hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
            >
              <MessageSquareIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Chat</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
