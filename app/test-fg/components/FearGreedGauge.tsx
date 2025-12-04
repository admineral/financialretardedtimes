'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, Minus, RefreshCw, Clock } from 'lucide-react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import { cn } from '@/lib/utils'

/**
 * Single period sentiment
 */
interface PeriodSentiment {
  index: number
  classification: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  classificationDE: 'Extreme Angst' | 'Angst' | 'Neutral' | 'Gier' | 'Extreme Gier'
}

/**
 * Fear & Greed Data Interface
 */
export interface FearGreedData {
  today: PeriodSentiment
  last3Days: PeriodSentiment
  last7Days: PeriodSentiment
  trend: 'rising' | 'falling' | 'stable'
  insight: string
  topDrivers: string[]
}

/**
 * Cache info for displaying date/time
 */
interface CacheInfo {
  updatedAt: string
  isFromToday: boolean
  isStale: boolean
  dateRange?: {
    oldestDate: string
    newestDate: string
    todayMessageCount: number
  }
}

// Schema for streaming validation
const PeriodSentimentSchema = z.object({
  index: z.number().min(0).max(100),
  classification: z.enum(['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed']),
  classificationDE: z.enum(['Extreme Angst', 'Angst', 'Neutral', 'Gier', 'Extreme Gier']),
})

const FearGreedSchema = z.object({
  today: PeriodSentimentSchema,
  last3Days: PeriodSentimentSchema,
  last7Days: PeriodSentimentSchema,
  trend: z.enum(['rising', 'falling', 'stable']),
  insight: z.string(),
  topDrivers: z.array(z.string()).min(2).max(3),
})

/**
 * Get color based on index value - Retro/muted tones
 */
function getIndexColor(index: number): string {
  if (index <= 20) return 'text-red-400/90'
  if (index <= 40) return 'text-amber-600/90'
  if (index <= 60) return 'text-yellow-600/80'
  if (index <= 80) return 'text-lime-600/80'
  return 'text-emerald-600/90'
}

/**
 * Mini Gauge Component - Newspaper Style
 */
function MiniGauge({ 
  index, 
  label, 
  classification,
}: { 
  index: number | undefined
  label: string
  classification?: string
}) {
  const rotation = useMemo(() => {
    if (index === undefined) return -90
    return (index / 100) * 180 - 90
  }, [index])

  return (
    <div className="flex flex-col items-center">
      {/* Mini gauge - Retro muted colors */}
      <div className="relative w-16 h-8 overflow-hidden mb-1">
        <div className="absolute inset-0 rounded-t-full overflow-hidden opacity-80">
          <div 
            className="absolute inset-0"
            style={{
              background: 'conic-gradient(from 180deg at 50% 100%, #b45454 0deg, #c4854a 45deg, #b8a44a 90deg, #7a9e5a 135deg, #5a8a6a 180deg)'
            }}
          />
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-5 bg-muted/50 rounded-t-full" />
        <div 
          className="absolute bottom-0 left-1/2 origin-bottom transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        >
          <div className="w-0.5 h-6 bg-foreground/80 rounded-full" />
          <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-foreground/80 rounded-full" />
        </div>
      </div>
      
      {/* Value */}
      <div className={cn(
        "text-lg font-bold font-headline tabular-nums",
        index !== undefined ? getIndexColor(index) : 'text-muted-foreground'
      )}>
        {index ?? '—'}
      </div>
      
      {/* Label */}
      <div className="text-[10px] text-muted-foreground font-body uppercase tracking-wider">{label}</div>
      
      {/* Classification */}
      {classification && (
        <div className="text-[9px] font-body text-muted-foreground/70">
          {classification}
        </div>
      )}
    </div>
  )
}

interface FearGreedWidgetProps {
  /** Auto-start analysis on mount (checks cache first) */
  autoStart?: boolean
  /** Custom className for the container */
  className?: string
}

/**
 * Fear & Greed Widget Component - Newspaper Style
 * 
 * Self-contained component that fetches and displays Fear & Greed indices
 * for Today, 3 Days, and 7 Days. Uses cache when available.
 */
/**
 * Format time ago in German
 */
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'gerade eben'
  if (diffMins < 60) return `vor ${diffMins}m`
  if (diffHours < 24) return `vor ${diffHours}h ${diffMins % 60}m`
  return `vor ${diffDays}d ${diffHours % 24}h`
}

/**
 * Check if date is from today
 */
function isFromToday(dateString: string): boolean {
  const date = new Date(dateString)
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

/**
 * Check if cache is stale (older than 4 hours)
 */
function isCacheStale(dateString: string): boolean {
  const cacheTime = new Date(dateString).getTime()
  const now = Date.now()
  const fourHoursMs = 4 * 60 * 60 * 1000
  return (now - cacheTime) >= fourHoursMs
}

export function FearGreedWidget({ 
  autoStart = false, 
  className,
}: FearGreedWidgetProps) {
  const [cachedData, setCachedData] = useState<FearGreedData | null>(null)
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null)
  const [isLoadingCache, setIsLoadingCache] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  
  const { object, isLoading: isLoadingAI, error, submit } = useObject({
    api: '/test-fg/api/analyze',
    schema: FearGreedSchema,
  })

  const streamingData = object as Partial<FearGreedData> | undefined
  const data = cachedData || streamingData
  const isLoading = isLoadingCache || isLoadingAI
  const hasData = data?.today || data?.last3Days || data?.last7Days

  // Update cache info when streaming completes (cache is auto-saved by analyze route)
  useEffect(() => {
    if (streamingData?.today && streamingData?.last3Days && streamingData?.last7Days && 
        streamingData?.trend && streamingData?.insight && streamingData?.topDrivers && !isLoadingAI) {
      const now = new Date().toISOString()
      // Update local cache info - actual cache is saved by analyze route
      setCacheInfo({
        updatedAt: now,
        isFromToday: true,
        isStale: false,
        // dateRange will be available on next cache fetch
      })
      
      // Fetch updated cache to get dateRange info
      setTimeout(() => {
        fetch('/test-fg/api/cache')
          .then(res => res.json())
          .then(result => {
            if (result.cached && result.dateRange) {
              setCacheInfo(prev => prev ? { ...prev, dateRange: result.dateRange } : null)
            }
          })
          .catch(console.error)
      }, 500) // Small delay to ensure cache is written
    }
  }, [streamingData, isLoadingAI])

  // Check cache on mount
  const checkCache = useCallback(async (): Promise<{ cached: boolean; needsRefresh: boolean }> => {
    setIsLoadingCache(true)
    try {
      const response = await fetch('/test-fg/api/cache')
      if (response.ok) {
        const result = await response.json()
        if (result.cached && result.data && result.updatedAt) {
          const updatedAt = result.updatedAt
          const fromToday = isFromToday(updatedAt)
          const stale = isCacheStale(updatedAt)
          
          setCachedData(result.data as FearGreedData)
          setCacheInfo({
            updatedAt,
            isFromToday: fromToday,
            isStale: stale,
            dateRange: result.dateRange || undefined
          })
          setHasFetched(true)
          
          // Need refresh if not from today OR stale (older than 4 hours)
          const needsRefresh = !fromToday || stale
          
          console.log(`[FearGreedWidget] Cache loaded:`, {
            updatedAt,
            fromToday,
            stale,
            needsRefresh,
            dateRange: result.dateRange
          })
          
          return { cached: true, needsRefresh }
        }
      }
    } catch (err) {
      console.error('[FearGreedWidget] Cache check failed:', err)
    } finally {
      setIsLoadingCache(false)
    }
    return { cached: false, needsRefresh: true }
  }, [])

  // Generate new data
  const generate = useCallback(() => {
    setCachedData(null)
    setCacheInfo(null)
    setHasFetched(true)
    submit({})
  }, [submit])

  // Auto-start: check cache first, then generate if needed or stale
  useEffect(() => {
    if (autoStart && !hasFetched && !isLoading) {
      checkCache().then(({ cached, needsRefresh }) => {
        if (!cached || needsRefresh) {
          // If we have stale cached data, show it while refreshing
          if (cached && needsRefresh) {
            console.log('[FearGreedWidget] Cache is stale or not from today, refreshing...')
          }
          generate()
        }
      })
    }
  }, [autoStart, hasFetched, isLoading, checkCache, generate])

  // Loading skeleton - newspaper style
  if (isLoading && !hasData) {
    return (
      <div className={cn("", className)}>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-foreground/20">
          <h4 className="font-headline text-sm font-bold uppercase tracking-wider">
            Fear & Greed
          </h4>
          <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
        </div>
        <div className="grid grid-cols-3 gap-2 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex flex-col items-center">
              <div className="w-16 h-8 bg-muted/40 rounded-t-full mb-1" />
              <div className="w-8 h-5 bg-muted/40 rounded" />
              <div className="w-10 h-2 bg-muted/40 rounded mt-1" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn("", className)}>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-foreground/20">
          <h4 className="font-headline text-sm font-bold uppercase tracking-wider">
            Fear & Greed
          </h4>
          <button onClick={generate} className="text-xs text-primary hover:underline">
            Retry
          </button>
        </div>
        <p className="text-xs text-red-500 text-center">Fehler beim Laden</p>
      </div>
    )
  }

  // Initial state (no data yet, not loading, not auto-start)
  if (!hasData && !isLoading && !autoStart) {
    return (
      <div className={cn("", className)}>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-foreground/20">
          <h4 className="font-headline text-sm font-bold uppercase tracking-wider">
            Fear & Greed
          </h4>
        </div>
        <button
          onClick={generate}
          className="w-full py-2 text-xs font-headline text-primary hover:underline"
        >
          📊 Analyse starten
        </button>
      </div>
    )
  }

  return (
    <div className={cn("", className)}>
      {/* Header with refresh - newspaper style */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-foreground/20">
        <h4 className="font-headline text-sm font-bold uppercase tracking-wider">
          Fear & Greed
        </h4>
        <div className="flex items-center gap-2">
          {/* Cache info display */}
          {cacheInfo && !isLoading && (
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground/70">
              <Clock className="w-2.5 h-2.5" />
              <span className={cn(
                cacheInfo.isStale && "text-amber-600",
                !cacheInfo.isFromToday && "text-red-400"
              )}>
                {formatTimeAgo(cacheInfo.updatedAt)}
              </span>
            </span>
          )}
          <button
            onClick={generate}
            disabled={isLoading}
            className="p-1 rounded hover:bg-muted/50 transition-colors disabled:opacity-50"
            title="Neu analysieren"
          >
            <RefreshCw className={cn("w-3 h-3 text-muted-foreground", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* 3 Gauges */}
      <div className="grid grid-cols-3 gap-1">
        <MiniGauge 
          index={data?.today?.index}
          label="Heute"
          classification={data?.today?.classificationDE}
        />
        <MiniGauge 
          index={data?.last3Days?.index}
          label="3 Tage"
          classification={data?.last3Days?.classificationDE}
        />
        <MiniGauge 
          index={data?.last7Days?.index}
          label="7 Tage"
          classification={data?.last7Days?.classificationDE}
        />
      </div>

      {/* Trend Indicator - retro newspaper style */}
      {data?.trend && (
        <div className="flex items-center justify-center gap-1.5 mt-3 pt-2 border-t border-foreground/10 text-xs">
          {data.trend === 'rising' && (
            <>
              <TrendingUp className="w-3 h-3 text-emerald-700/80" />
              <span className="text-emerald-700/80 font-body">steigend</span>
            </>
          )}
          {data.trend === 'falling' && (
            <>
              <TrendingDown className="w-3 h-3 text-red-400/80" />
              <span className="text-red-400/80 font-body">fallend</span>
            </>
          )}
          {data.trend === 'stable' && (
            <>
              <Minus className="w-3 h-3 text-amber-600/80" />
              <span className="text-amber-600/80 font-body">stabil</span>
            </>
          )}
        </div>
      )}

      {/* Insight Text */}
      {data?.insight && (
        <p className="mt-3 text-[11px] text-muted-foreground font-body leading-relaxed text-center italic">
          „{data.insight}"
        </p>
      )}

      {/* Top Drivers as Tags */}
      {data?.topDrivers && data.topDrivers.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-2">
          {data.topDrivers.map((driver, i) => (
            <span 
              key={i}
              className="px-1.5 py-0.5 text-[9px] font-body bg-muted/50 text-muted-foreground rounded border border-foreground/10"
            >
              {driver}
            </span>
          ))}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && hasData && (
        <div className="text-center text-[10px] text-muted-foreground mt-2">
          Aktualisiere...
        </div>
      )}

      {/* Date range info */}
      {cacheInfo?.dateRange && !isLoading && (
        <div className="mt-3 pt-2 border-t border-foreground/10 text-center">
          <span className="text-[9px] text-muted-foreground/60">
            Daten: {cacheInfo.dateRange.oldestDate} → {cacheInfo.dateRange.newestDate}
          </span>
          {cacheInfo.dateRange.todayMessageCount === 0 && (
            <span className="block text-[9px] text-amber-600 mt-0.5">
              ⚠️ Keine Nachrichten von heute
            </span>
          )}
        </div>
      )}
    </div>
  )
}
