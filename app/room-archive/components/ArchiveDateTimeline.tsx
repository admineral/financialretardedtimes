'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  RefreshCwIcon
} from 'lucide-react'
import type { DateStats } from '@/app/newspaper/lib/types'
import { cn } from '@/lib/utils'

export type ArchiveTimeRange = '1w' | '1m' | '1y' | 'all'

const RANGE_OPTIONS: { id: ArchiveTimeRange; label: string; days: number | null }[] = [
  { id: '1w', label: '1W', days: 7 },
  { id: '1m', label: '1M', days: 30 },
  { id: '1y', label: '1J', days: 365 },
  { id: 'all', label: 'All', days: null }
]

const VISIBLE_DATES_MOBILE = 3
const VISIBLE_DATES_DESKTOP = 5

interface ArchiveDateTimelineProps {
  availableDates: DateStats[]
  selectedDate: string | null
  isLoadingDates: boolean
  timeRange: ArchiveTimeRange
  onTimeRangeChange: (range: ArchiveTimeRange) => void
  onDateSelect: (date: string) => void
  className?: string
}

export function filterDatesByRange(dates: DateStats[], range: ArchiveTimeRange): DateStats[] {
  const config = RANGE_OPTIONS.find(option => option.id === range)
  if (!config?.days) return dates
  return dates.slice(0, config.days)
}

export function ArchiveDateTimeline({
  availableDates,
  selectedDate,
  isLoadingDates,
  timeRange,
  onTimeRangeChange,
  onDateSelect,
  className
}: ArchiveDateTimelineProps) {
  const [scrollIndex, setScrollIndex] = useState(0)
  const [visibleCount, setVisibleCount] = useState(VISIBLE_DATES_DESKTOP)

  const filteredDates = useMemo(
    () => filterDatesByRange(availableDates, timeRange),
    [availableDates, timeRange]
  )

  const windowStats = useMemo(() => {
    const totalMessages = filteredDates.reduce((sum, day) => sum + day.messageCount, 0)
    const totalUsers = filteredDates.reduce((sum, day) => sum + day.uniqueUsers, 0)
    return {
      days: filteredDates.length,
      totalMessages,
      totalUsers
    }
  }, [filteredDates])

  const selectedDateInfo = filteredDates.find(day => day.date === selectedDate)

  useEffect(() => {
    const updateVisibleCount = () => {
      setVisibleCount(window.innerWidth < 640 ? VISIBLE_DATES_MOBILE : VISIBLE_DATES_DESKTOP)
    }
    updateVisibleCount()
    window.addEventListener('resize', updateVisibleCount)
    return () => window.removeEventListener('resize', updateVisibleCount)
  }, [])

  useEffect(() => {
    setScrollIndex(0)
  }, [timeRange, filteredDates.length])

  useEffect(() => {
    if (!selectedDate) return
    if (filteredDates.some(day => day.date === selectedDate)) return
    if (filteredDates[0]) onDateSelect(filteredDates[0].date)
  }, [filteredDates, selectedDate, onDateSelect])

  const canScrollLeft = scrollIndex > 0
  const canScrollRight = scrollIndex + visibleCount < filteredDates.length
  const visibleDates = filteredDates.slice(scrollIndex, scrollIndex + visibleCount)

  const handleRangeChange = (range: ArchiveTimeRange) => {
    onTimeRangeChange(range)
    setScrollIndex(0)
  }

  return (
    <div className={cn('w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8', className)}>
      <div className="py-3 flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-1 p-1 bg-card/80 border border-primary/20 rounded-full flex-shrink-0">
          {RANGE_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleRangeChange(option.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-mono font-semibold rounded-full transition-all duration-200',
                timeRange === option.id
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setScrollIndex(prev => Math.max(0, prev - 1))}
          disabled={!canScrollLeft}
          className={cn(
            'p-2 rounded-full transition-all duration-200 flex-shrink-0 hover:bg-primary/10 text-muted-foreground hover:text-primary',
            !canScrollLeft && 'opacity-30 pointer-events-none'
          )}
          aria-label="Frühere Daten"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        <div className="flex gap-2 overflow-hidden min-w-0 flex-1">
          {isLoadingDates ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <RefreshCwIcon className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Lade Daten...</span>
            </div>
          ) : filteredDates.length === 0 ? (
            <span className="text-xs text-muted-foreground py-2">Keine Daten in diesem Zeitraum</span>
          ) : (
            visibleDates.map((dateStats, idx) => {
              const date = new Date(`${dateStats.date}T00:00:00`)
              const isSelected = selectedDate === dateStats.date
              const isToday = filteredDates[0]?.date === dateStats.date
              const dayName = date.toLocaleDateString('de-DE', { weekday: 'short' })
              const dayNum = date.getDate()
              const month = date.toLocaleDateString('de-DE', { month: 'short' })

              return (
                <button
                  key={dateStats.date}
                  type="button"
                  onClick={() => onDateSelect(dateStats.date)}
                  style={{ animationDelay: `${idx * 30}ms` }}
                  className={cn(
                    'stagger-item flex-shrink-0 relative group px-4 py-2 rounded-sm transition-all duration-200',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                      : 'bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground border border-transparent hover:border-primary/20'
                  )}
                >
                  {isToday && (
                    <span
                      className={cn(
                        'absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse',
                        isSelected ? 'bg-background' : 'bg-primary'
                      )}
                    />
                  )}

                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wider',
                        isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground/60'
                      )}
                    >
                      {dayName}
                    </span>
                    <span className="text-lg font-bold font-mono leading-none mt-0.5">{dayNum}</span>
                    <span
                      className={cn(
                        'text-[9px] uppercase',
                        isSelected ? 'text-primary-foreground/60' : 'text-muted-foreground/50'
                      )}
                    >
                      {month}
                    </span>
                  </div>

                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <span className="text-[10px] font-mono bg-card border border-primary/20 px-2 py-0.5 rounded whitespace-nowrap">
                      {dateStats.messageCount.toLocaleString('de-DE')} msgs · {dateStats.uniqueUsers} user
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            setScrollIndex(prev =>
              Math.min(Math.max(0, filteredDates.length - visibleCount), prev + 1)
            )
          }
          disabled={!canScrollRight}
          className={cn(
            'p-2 rounded-full transition-all duration-200 flex-shrink-0 hover:bg-primary/10 text-muted-foreground hover:text-primary',
            !canScrollRight && 'opacity-30 pointer-events-none'
          )}
          aria-label="Spätere Daten"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>

        <div className="hidden md:flex items-center gap-3 border-l border-primary/20 pl-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-primary font-bold font-mono uppercase">{timeRange}</span>
            <span className="text-muted-foreground/40">|</span>
            <span className="font-mono text-muted-foreground">
              {windowStats.totalMessages.toLocaleString('de-DE')}
              <span className="text-muted-foreground/60 ml-1 hidden lg:inline">Nachrichten</span>
            </span>
            <span className="text-muted-foreground/40">|</span>
            <span className="font-mono text-muted-foreground">
              {windowStats.days}
              <span className="text-muted-foreground/60 ml-1 hidden lg:inline">Tage</span>
            </span>
            {selectedDateInfo && (
              <>
                <span className="text-muted-foreground/40">|</span>
                <span className="font-mono text-muted-foreground">
                  {selectedDateInfo.messageCount.toLocaleString('de-DE')}
                  <span className="text-muted-foreground/60 ml-1 hidden lg:inline">am Tag</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
