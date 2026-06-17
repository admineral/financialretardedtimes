'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, RefreshCw, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFearGreed, FearGreedProvider, type FearGreedData } from './FearGreedContext'

// Re-export types for backwards compatibility
export type { FearGreedData }

/**
 * Get color based on index value - High contrast for accessibility
 */
function getIndexColor(index: number): string {
  if (index <= 20) return 'text-red-700 dark:text-red-400'
  if (index <= 40) return 'text-amber-700 dark:text-amber-400'
  if (index <= 60) return 'text-yellow-700 dark:text-yellow-400'
  if (index <= 80) return 'text-lime-700 dark:text-lime-400'
  return 'text-emerald-700 dark:text-emerald-400'
}

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
        <div className="text-[9px] font-body text-foreground/70 dark:text-foreground/80">
          {classification}
        </div>
      )}
    </div>
  )
}

interface FearGreedWidgetProps {
  /** Custom className for the container */
  className?: string
  /** Compact mode - minimal horizontal layout for inline display */
  compact?: boolean
}

/**
 * Fear & Greed Widget Component - Newspaper Style
 * 
 * Uses shared FearGreedContext for data. Must be wrapped in FearGreedProvider.
 * When refresh is called on any widget, all widgets update together.
 */
export function FearGreedWidget({ 
  className,
  compact = false,
}: FearGreedWidgetProps) {
  const { data, cacheInfo, isLoading, error, hasData, refresh } = useFearGreed()

  // Loading skeleton - newspaper style
  if (isLoading && !hasData) {
    if (compact) {
      return (
        <div className={cn("flex items-center gap-2 py-2 min-w-[140px]", className)}>
          <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground">Fear & Greed...</span>
        </div>
      )
    }
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
    if (compact) {
      return (
        <div className={cn("flex items-center gap-2 py-2 min-w-[140px]", className)}>
          <span className="text-[9px] text-red-500">F&G Fehler</span>
          <button onClick={refresh} className="text-[9px] text-primary hover:underline">↻</button>
        </div>
      )
    }
    return (
      <div className={cn("", className)}>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-foreground/20">
          <h4 className="font-headline text-sm font-bold uppercase tracking-wider">
            Fear & Greed
          </h4>
          <button onClick={refresh} className="text-xs text-primary hover:underline">
            Retry
          </button>
        </div>
        <p className="text-xs text-red-500 text-center">Fehler beim Laden</p>
      </div>
    )
  }

  // Initial state (no data yet, not loading)
  if (!hasData && !isLoading) {
    return (
      <div className={cn("", className)}>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-foreground/20">
          <h4 className="font-headline text-sm font-bold uppercase tracking-wider">
            Fear & Greed
          </h4>
        </div>
        <button
          onClick={refresh}
          className="w-full py-2 text-xs font-headline text-primary hover:underline"
        >
          📊 Analyse starten
        </button>
      </div>
    )
  }

  // ========== COMPACT MODE ==========
  if (compact) {
    return (
      <div className={cn("flex flex-col items-center gap-1 py-2 min-w-[140px]", className)}>
        {/* Header */}
        <div className="flex items-center gap-1.5">
          <h4 className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Fear & Greed
          </h4>
          {cacheInfo && !isLoading && (
            <span className="text-[8px] text-muted-foreground/60">
              {formatTimeAgo(cacheInfo.updatedAt)}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-0.5 rounded hover:bg-muted/50 transition-colors disabled:opacity-50"
            title="Aktualisieren"
          >
            <RefreshCw className={cn("w-2.5 h-2.5 text-muted-foreground", isLoading && "animate-spin")} />
          </button>
        </div>
        
        {/* Compact gauges - 3 in a row */}
        <div className="flex items-center gap-3">
          {/* Today */}
          <div className="flex flex-col items-center">
            <div className={cn(
              "text-lg font-bold font-mono tabular-nums leading-none",
              data?.today?.index !== undefined ? getIndexColor(data.today.index) : 'text-muted-foreground'
            )}>
              {data?.today?.index ?? '—'}
            </div>
            <div className="text-[8px] text-muted-foreground uppercase">Heute</div>
          </div>
          
          {/* 3 Days */}
          <div className="flex flex-col items-center">
            <div className={cn(
              "text-sm font-semibold font-mono tabular-nums leading-none text-muted-foreground/80",
              data?.last3Days?.index !== undefined ? getIndexColor(data.last3Days.index) : ''
            )}>
              {data?.last3Days?.index ?? '—'}
            </div>
            <div className="text-[8px] text-muted-foreground/60 uppercase">3 Tage</div>
          </div>
          
          {/* 7 Days */}
          <div className="flex flex-col items-center">
            <div className={cn(
              "text-sm font-semibold font-mono tabular-nums leading-none text-muted-foreground/80",
              data?.last7Days?.index !== undefined ? getIndexColor(data.last7Days.index) : ''
            )}>
              {data?.last7Days?.index ?? '—'}
            </div>
            <div className="text-[8px] text-muted-foreground/60 uppercase">7 Tage</div>
          </div>
        </div>
        
        {/* Trend */}
        {data?.trend && (
          <div className="flex items-center gap-1 text-[9px]">
            {data.trend === 'rising' && (
              <>
                <TrendingUp className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">steigend</span>
              </>
            )}
            {data.trend === 'falling' && (
              <>
                <TrendingDown className="w-2.5 h-2.5 text-red-600 dark:text-red-400" />
                <span className="text-red-600 dark:text-red-400">fallend</span>
              </>
            )}
            {data.trend === 'stable' && (
              <>
                <Minus className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                <span className="text-amber-600 dark:text-amber-400">stabil</span>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // ========== FULL MODE ==========
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
            <span className="flex items-center gap-1 text-[9px] text-foreground/70 dark:text-foreground/80">
              <Clock className="w-2.5 h-2.5" />
              <span className={cn(
                cacheInfo.isStale && "text-amber-700 dark:text-amber-400",
                !cacheInfo.isFromToday && "text-red-700 dark:text-red-400"
              )}>
                {formatTimeAgo(cacheInfo.updatedAt)}
              </span>
            </span>
          )}
          <button
            onClick={refresh}
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

      {/* Trend Indicator - high contrast newspaper style */}
      {data?.trend && (
        <div className="flex items-center justify-center gap-1.5 mt-3 pt-2 border-t border-foreground/20 text-xs">
          {data.trend === 'rising' && (
            <>
              <TrendingUp className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
              <span className="text-emerald-700 dark:text-emerald-400 font-body">steigend</span>
            </>
          )}
          {data.trend === 'falling' && (
            <>
              <TrendingDown className="w-3 h-3 text-red-700 dark:text-red-400" />
              <span className="text-red-700 dark:text-red-400 font-body">fallend</span>
            </>
          )}
          {data.trend === 'stable' && (
            <>
              <Minus className="w-3 h-3 text-amber-700 dark:text-amber-400" />
              <span className="text-amber-700 dark:text-amber-400 font-body">stabil</span>
            </>
          )}
        </div>
      )}

      {/* Insight Text */}
      {data?.insight && (
        <p className="mt-3 text-[11px] text-muted-foreground font-body leading-relaxed text-center italic">
          „{data.insight}“
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
        <div className="mt-3 pt-2 border-t border-foreground/20 text-center">
          <span className="text-[9px] text-foreground/60 dark:text-foreground/70">
            Daten: {cacheInfo.dateRange.oldestDate} → {cacheInfo.dateRange.newestDate}
          </span>
          {cacheInfo.dateRange.todayMessageCount === 0 && (
            <span className="block text-[9px] text-amber-700 dark:text-amber-400 mt-0.5">
              ⚠️ Keine Nachrichten von heute
            </span>
          )}
        </div>
      )}
    </div>
  )
}

interface StandaloneFearGreedWidgetProps extends FearGreedWidgetProps {
  /** Auto-start analysis on mount (checks cache first) */
  autoStart?: boolean
}

/**
 * Standalone Fear & Greed Widget - includes its own provider
 * 
 * Use this when you only have ONE widget on the page and don't want to 
 * manually add FearGreedProvider. For multiple widgets that should sync,
 * use FearGreedProvider + FearGreedWidget instead.
 */
export function StandaloneFearGreedWidget({ 
  autoStart = false,
  ...props 
}: StandaloneFearGreedWidgetProps) {
  return (
    <FearGreedProvider autoStart={autoStart}>
      <FearGreedWidget {...props} />
    </FearGreedProvider>
  )
}
