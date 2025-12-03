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
 * - onRefresh: () => void - Callback to refresh/regenerate content
 */

'use client'

import { useRef, useState } from 'react'
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

interface DateTimelineProps {
  availableDates: DateStats[]
  selectedDate: string | null
  isLoadingDates: boolean
  isLoading: boolean
  onDateSelect: (date: string) => void
  onRefresh?: () => void
}

export function DateTimeline({ 
  availableDates, 
  selectedDate, 
  isLoadingDates, 
  isLoading,
  onDateSelect,
  onRefresh
}: DateTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  /**
   * Scroll the timeline left or right by 200px
   */
  const scrollTimeline = (direction: 'left' | 'right') => {
    if (timelineRef.current) {
      const scrollAmount = 200
      timelineRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  // Get stats for the currently selected date
  const selectedDateInfo = availableDates.find(d => d.date === selectedDate)
  
  // Show only first 5 dates initially (most recent)
  const visibleDates = availableDates.slice(0, 7)

  return (
    <div className="w-full border-b border-foreground/10 bg-muted/20">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-2">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Left Section: Calendar Icon + Timeline */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Calendar Icon */}
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            
            {/* Scroll Left Button */}
            <button 
              onClick={() => scrollTimeline('left')}
              className="p-1 hover:bg-muted rounded transition-colors flex-shrink-0 active:scale-95"
              aria-label="Scroll left"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
            
            {/* Timeline Container */}
            <div 
              ref={timelineRef}
              className="flex gap-0.5 overflow-x-auto scrollbar-none"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
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
            
            {/* Scroll Right Button - closer to dates */}
            <button 
              onClick={() => scrollTimeline('right')}
              className="p-1 hover:bg-muted rounded transition-colors flex-shrink-0 active:scale-95"
              aria-label="Scroll right"
            >
              <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
            
            {/* Selected Date Stats */}
            {selectedDateInfo && (
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
