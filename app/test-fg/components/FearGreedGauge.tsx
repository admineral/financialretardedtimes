'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
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
export function FearGreedWidget({ 
  autoStart = false, 
  className,
}: FearGreedWidgetProps) {
  const [cachedData, setCachedData] = useState<FearGreedData | null>(null)
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

  // Save to cache when streaming completes
  useEffect(() => {
    if (streamingData?.today && streamingData?.last3Days && streamingData?.last7Days && 
        streamingData?.trend && streamingData?.insight && streamingData?.topDrivers && !isLoadingAI) {
      fetch('/test-fg/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: streamingData })
      }).catch(console.error)
    }
  }, [streamingData, isLoadingAI])

  // Check cache on mount
  const checkCache = useCallback(async () => {
    setIsLoadingCache(true)
    try {
      const response = await fetch('/test-fg/api/cache')
      if (response.ok) {
        const result = await response.json()
        if (result.cached && result.data) {
          setCachedData(result.data as FearGreedData)
          setHasFetched(true)
          return true
        }
      }
    } catch (err) {
      console.error('[FearGreedWidget] Cache check failed:', err)
    } finally {
      setIsLoadingCache(false)
    }
    return false
  }, [])

  // Generate new data
  const generate = useCallback(() => {
    setCachedData(null)
    setHasFetched(true)
    submit({})
  }, [submit])

  // Auto-start: check cache first, then generate if needed
  useEffect(() => {
    if (autoStart && !hasFetched && !isLoading) {
      checkCache().then(cached => {
        if (!cached) {
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
        <button
          onClick={generate}
          disabled={isLoading}
          className="p-1 rounded hover:bg-muted/50 transition-colors disabled:opacity-50"
          title="Neu analysieren"
        >
          <RefreshCw className={cn("w-3 h-3 text-muted-foreground", isLoading && "animate-spin")} />
        </button>
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
    </div>
  )
}
