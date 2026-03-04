'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { TrendingUp, RefreshCw, ExternalLink, Sparkles, Clock, Database, Quote } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

// Dynamic import for Chart.js
const ChartJSCandlestick = dynamic(
  () => import('./ChartJSCandlestick').then(mod => mod.ChartJSCandlestick),
  { ssr: false, loading: () => <div className="w-full h-[500px] bg-muted/20 animate-pulse rounded-lg" /> }
)

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

interface TimelineEvent {
  id: string
  date: string
  time: string
  title: string
  description: string
  type: 'discussion' | 'prediction' | 'drama' | 'insight' | 'milestone' | 'humor'
  participants: string[]
  priceContext?: string
  sentiment?: string
  wasCorrect?: boolean
  priceAtQuote?: number
}

interface AnalysisResponse {
  headline?: string
  subheadline?: string
  priceChange?: {
    startPrice: number
    endPrice: number
    changePercent: number
    trend: 'bullish' | 'bearish' | 'sideways'
  }
  quotes?: Array<{
    id: string
    timestamp: string
    username: string
    title: string
    fullQuote: string
    priceContext: string
    sentiment: string
    wasCorrect?: boolean
    priceAtQuote: number
  }>
  dataRange?: {
    messagesFrom: string
    messagesTo: string
    messageCount: number
  }
}

interface ChartTimelineWidgetProps {
  autoStart?: boolean
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Nie'
  
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffMins < 1) return 'gerade eben'
  if (diffMins < 60) return `vor ${diffMins}m`
  if (diffHours < 24) return `vor ${diffHours}h`
  return `vor ${diffDays}d`
}

export function ChartTimelineWidget({ autoStart = true }: ChartTimelineWidgetProps) {
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [ohlcFetchedAt, setOhlcFetchedAt] = useState<string | null>(null)
  const [analysisFetchedAt, setAnalysisFetchedAt] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)

  const fetchData = useCallback(async (force: boolean = false) => {
    setIsLoading(true)
    try {
      // Fetch OHLC and analysis in parallel
      const [ohlcRes, analysisRes] = await Promise.all([
        fetch(`/chart-timeline/api/ohlc?timeframe=15m${force ? '&force=true' : ''}`),
        fetch('/chart-timeline/api/analyze')
      ])

      if (ohlcRes.ok) {
        const ohlcJson = await ohlcRes.json()
        setOhlcData(ohlcJson.ohlc || [])
        setOhlcFetchedAt(ohlcJson.fetchedAt)
        setIsCached(ohlcJson.cached || false)
      }

      if (analysisRes.ok) {
        const analysisJson = await analysisRes.json()
        if (analysisJson.cached && analysisJson.analysis) {
          setAnalysis(analysisJson.analysis)
          setAnalysisFetchedAt(analysisJson.fetchedAt)
        }
      }
    } catch (err) {
      console.error('[ChartTimelineWidget] Error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoStart) {
      fetchData()
    }
  }, [autoStart, fetchData])

  // Convert quotes to timeline events
  const events: TimelineEvent[] = useMemo(() => {
    return (analysis?.quotes || [])
      .filter(q => q && q.id && q.title && q.username && q.timestamp)
      .map(q => ({
        id: q.id,
        date: q.timestamp.split('T')[0] || new Date().toISOString().split('T')[0],
        time: q.timestamp.split('T')[1]?.slice(0, 5) || '12:00',
        title: q.title,
        description: `@${q.username}`,
        type: 'prediction' as const,
        participants: [q.username],
        priceContext: q.priceContext,
        sentiment: q.sentiment,
        wasCorrect: q.wasCorrect,
        priceAtQuote: q.priceAtQuote
      }))
  }, [analysis])

  const priceChange = analysis?.priceChange
  const trendColor = priceChange?.trend === 'bullish' 
    ? 'text-emerald-500' 
    : priceChange?.trend === 'bearish' 
      ? 'text-red-500' 
      : 'text-amber-500'
  
  const trendBg = priceChange?.trend === 'bullish'
    ? 'bg-emerald-500/5 border-emerald-500/20'
    : priceChange?.trend === 'bearish'
      ? 'bg-red-500/5 border-red-500/20'
      : 'bg-amber-500/5 border-amber-500/20'

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
              BTC Chart Timeline
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              {isCached && (
                <span className="flex items-center gap-1 text-emerald-500">
                  <Database className="w-3 h-3" />
                  Cached
                </span>
              )}
              {ohlcFetchedAt && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(ohlcFetchedAt)}
                </span>
              )}
              {analysis?.dataRange && (
                <span className="text-muted-foreground/70 border-l border-foreground/10 pl-2">
                  {new Date(analysis.dataRange.messagesFrom).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                  {' → '}
                  {new Date(analysis.dataRange.messagesTo).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {priceChange && (
            <span className={`text-xs font-mono ${trendColor}`}>
              {priceChange.changePercent > 0 ? '+' : ''}{priceChange.changePercent?.toFixed(1)}%
            </span>
          )}
          <button
            onClick={() => fetchData(false)}
            disabled={isLoading}
            className="p-1.5 hover:bg-muted/50 rounded transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <Link 
            href="/chart-timeline" 
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <span className="hidden sm:inline">Vollbild</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Headline Banner (if available) */}
      {analysis?.headline && (
        <div className={`rounded-lg border ${trendBg} p-4 mb-4`}>
          <div className="flex items-start gap-3">
            <Sparkles className={`w-5 h-5 ${trendColor} flex-shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <h4 className="font-headline text-base font-bold leading-tight">
                {analysis.headline}
              </h4>
              {analysis.subheadline && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                  {analysis.subheadline}
                </p>
              )}
              {priceChange && (
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className="text-muted-foreground font-mono">
                    ${priceChange.startPrice?.toLocaleString()} → ${priceChange.endPrice?.toLocaleString()}
                  </span>
                  <span className={`font-mono font-bold ${trendColor}`}>
                    {priceChange.changePercent > 0 ? '+' : ''}{priceChange.changePercent?.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="rounded-lg overflow-hidden border border-primary/10 bg-card">
        {isLoading && ohlcData.length === 0 ? (
          <div className="w-full h-[500px] bg-muted/20 animate-pulse flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Chart lädt...</span>
          </div>
        ) : ohlcData.length === 0 ? (
          <div className="w-full h-[500px] flex items-center justify-center text-muted-foreground">
            Keine Daten verfügbar
          </div>
        ) : (
          <div style={{ height: 500 }}>
            <ChartJSCandlestick
              ohlcData={ohlcData}
              events={events}
              timeframe="15m"
              disableZoom
            />
          </div>
        )}
      </div>

      {/* Footer stats */}
      {events.length > 0 && (
        <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Quote className="w-3 h-3" />
            <span>{events.length} Zitate auf dem Chart</span>
          </div>
          <div className="flex items-center gap-3">
            {analysisFetchedAt && (
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Analyse: {formatRelativeTime(analysisFetchedAt)}
              </span>
            )}
            <Link 
              href="/chart-timeline" 
              className="text-primary hover:underline"
            >
              Mehr Details →
            </Link>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 mt-4 text-[10px] text-muted-foreground/60">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500/30 border border-emerald-500/50" />
          <span>Pump Call</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500/30 border border-red-500/50" />
          <span>Dump Call</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500/30 border border-amber-500/50" />
          <span>FOMO</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500/30 border border-cyan-500/50" />
          <span>Analyse</span>
        </div>
      </div>
    </div>
  )
}
