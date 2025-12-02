'use client'

import { useRef } from 'react'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon } from 'lucide-react'
import { type DateStats } from './types'

interface DateTimelineProps {
  availableDates: DateStats[]
  selectedDate: string | null
  isLoadingDates: boolean
  isLoading: boolean
  onDateSelect: (date: string) => void
}

export function DateTimeline({ 
  availableDates, 
  selectedDate, 
  isLoadingDates, 
  isLoading,
  onDateSelect 
}: DateTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)

  const scrollTimeline = (direction: 'left' | 'right') => {
    if (timelineRef.current) {
      const scrollAmount = 200
      timelineRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  const selectedDateInfo = availableDates.find(d => d.date === selectedDate)

  return (
    <div className="w-full border-b border-foreground/10 bg-muted/20">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-2">
        <div className="flex items-center gap-3">
          {/* Calendar Icon & Label */}
          <div className="flex items-center gap-2 text-muted-foreground flex-shrink-0">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span className="text-[10px] font-headline uppercase tracking-wider hidden sm:inline">Ausgabe</span>
          </div>
          
          {/* Scroll Left Button */}
          <button 
            onClick={() => scrollTimeline('left')}
            className="p-1.5 hover:bg-muted rounded transition-colors flex-shrink-0 active:scale-95"
            aria-label="Scroll left"
          >
            <ChevronLeftIcon className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
          
          {/* Timeline */}
          <div 
            ref={timelineRef}
            className="flex gap-1 overflow-x-auto scrollbar-none flex-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {isLoadingDates ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <RefreshCwIcon className="h-3 w-3 animate-spin" />
                <span>Lade...</span>
              </div>
            ) : availableDates.length === 0 ? (
              <span className="text-xs text-muted-foreground py-1">Keine Daten</span>
            ) : (
              availableDates.map((dateStats, idx) => {
                const date = new Date(dateStats.date + 'T00:00:00')
                const isSelected = selectedDate === dateStats.date
                const isToday = idx === 0
                const dayName = date.toLocaleDateString('de-DE', { weekday: 'short' })
                const dayNum = date.getDate()
                const monthName = date.toLocaleDateString('de-DE', { month: 'short' })
                
                return (
                  <button
                    key={dateStats.date}
                    onClick={() => onDateSelect(dateStats.date)}
                    disabled={isLoading}
                    className={`
                      flex-shrink-0 px-2.5 py-1.5 rounded text-xs transition-all
                      ${isSelected 
                        ? 'bg-foreground text-background font-medium' 
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      }
                      ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex items-center gap-1.5">
                      {isToday && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-background' : 'bg-primary'}`}></span>
                      )}
                      <span>{dayName} {dayNum}.</span>
                      <span className="hidden sm:inline">{monthName}</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
          
          {/* Scroll Right Button */}
          <button 
            onClick={() => scrollTimeline('right')}
            className="p-1.5 hover:bg-muted rounded transition-colors flex-shrink-0 active:scale-95"
            aria-label="Scroll right"
          >
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
          
          {/* Selected Date Info */}
          {selectedDateInfo && (
            <div className="hidden lg:flex items-center gap-2 text-[10px] text-muted-foreground border-l border-foreground/10 pl-3 flex-shrink-0">
              <span>{selectedDateInfo.messageCount} Nachrichten</span>
              <span>•</span>
              <span>{selectedDateInfo.uniqueUsers} User</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

