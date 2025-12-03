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

interface DateTimelineProps {
  availableDates: DateStats[]
  selectedDate: string | null
  isLoadingDates: boolean
  isLoading: boolean
  onDateSelect: (date: string) => void
  onDayRangeChange?: (days: DayRange, dates: string[]) => void
  onRefresh?: () => void
}

export function DateTimeline({ 
  availableDates, 
  selectedDate, 
  isLoadingDates, 
  isLoading,
  onDateSelect,
  onDayRangeChange,
  onRefresh
}: DateTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dayRange, setDayRange] = useState<DayRange>(1)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  /**
   * Check if timeline can scroll in either direction
   */
  const updateScrollButtons = () => {
    if (timelineRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = timelineRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1)
    }
  }

  // Update scroll buttons on mount and when dates change
  useEffect(() => {
    updateScrollButtons()
    // Also add resize observer to handle window resizing
    const handleResize = () => updateScrollButtons()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [availableDates])

  /**
   * Scroll the timeline left or right by 200px
   */
  const scrollTimeline = (direction: 'left' | 'right') => {
    if (timelineRef.current) {
      const scrollAmount = 200
      const newScrollLeft = direction === 'left' 
        ? timelineRef.current.scrollLeft - scrollAmount
        : timelineRef.current.scrollLeft + scrollAmount
      
      timelineRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      })
      
      // Update button states after scroll animation
      setTimeout(updateScrollButtons, 350)
    }
  }

  /**
   * Handle day range change - calculate dates to include
   * Always starts from the most recent date (index 0) when selecting multi-day
   */
  const handleDayRangeChange = (newRange: DayRange) => {
    setDayRange(newRange)
    
    if (availableDates.length > 0 && onDayRangeChange) {
      if (newRange === 1) {
        // For single day, keep current selection or use most recent
        const dateToUse = selectedDate || availableDates[0].date
        onDayRangeChange(newRange, [dateToUse])
        // Also update selected date if needed
        if (!selectedDate) {
          onDateSelect(availableDates[0].date)
        }
      } else {
        // For multi-day (3d, 7d), ALWAYS start from most recent date
        const mostRecentDate = availableDates[0].date
        const datesToInclude = availableDates
          .slice(0, newRange)
          .map(d => d.date)
        
        // Update selected date to most recent
        onDateSelect(mostRecentDate)
        onDayRangeChange(newRange, datesToInclude)
      }
    }
  }

  // Update day range dates when selected date changes (only for single day mode)
  // For multi-day mode, we always use the most recent date as starting point
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
    const totalUsers = datesInRange.reduce((sum, d) => sum + d.uniqueUsers, 0)
    
    // Show requested dayRange (e.g., "7d") even if fewer days of data exist
    return { totalMessages, totalUsers, daysCount: dayRange, actualDays: datesInRange.length }
  }
  
  const multiDayStats = getMultiDayStats()
  
  // Show all available dates for scrolling
  const visibleDates = availableDates

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
              className="flex gap-0.5 overflow-x-auto scrollbar-none"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              onScroll={updateScrollButtons}
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
                // Date buttons - show all but scroll starts at recent
                visibleDates.map((dateStats, idx) => {
                  const date = new Date(dateStats.date + 'T00:00:00')
                  const isSelected = selectedDate === dateStats.date
                  const isInRange = datesInRange.includes(dateStats.date)
                  const isToday = idx === 0
                  const dayName = date.toLocaleDateString('de-DE', { weekday: 'short' })
                  const dayNum = date.getDate()
                  
                  return (
                    <button
                      key={dateStats.date}
                      onClick={() => onDateSelect(dateStats.date)}
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
                  onClick={() => setSearchOpen(true)}
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
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-headline hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
            >
              <BarChart3Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Rate-Chart</span>
            </Link>
            
            {/* Chat Link */}
            <Link 
              href="/Test"
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
