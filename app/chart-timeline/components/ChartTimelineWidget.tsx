'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, RefreshCw, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

// Dynamic import for Chart.js
const ChartJSCandlestick = dynamic(
  () => import('./ChartJSCandlestick').then(mod => mod.ChartJSCandlestick),
  { ssr: false, loading: () => <div className="w-full h-[600px] bg-muted/20 animate-pulse rounded-lg" /> }
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
    quote: string
    priceContext: string
    sentiment: string
    wasCorrect?: boolean
    priceAtQuote: number
  }>
}

interface ChartTimelineWidgetProps {
  autoStart?: boolean
}

export function ChartTimelineWidget({ autoStart = true }: ChartTimelineWidgetProps) {
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Fetch OHLC and analysis in parallel
      const [ohlcRes, analysisRes] = await Promise.all([
        fetch('/chart-timeline/api/ohlc?timeframe=15m'),
        fetch('/chart-timeline/api/analyze')
      ])

      if (ohlcRes.ok) {
        const ohlcJson = await ohlcRes.json()
        setOhlcData(ohlcJson.ohlc || [])
        setFetchedAt(ohlcJson.fetchedAt)
      }

      if (analysisRes.ok) {
        const analysisJson = await analysisRes.json()
        if (analysisJson.cached && analysisJson.analysis) {
          setAnalysis(analysisJson.analysis)
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
  const events: TimelineEvent[] = (analysis?.quotes || [])
    .filter(q => q && q.id && q.quote && q.username && q.timestamp)
    .map(q => ({
      id: q.id,
      date: q.timestamp.split('T')[0] || new Date().toISOString().split('T')[0],
      time: q.timestamp.split('T')[1]?.slice(0, 5) || '12:00',
      title: q.quote,
      description: `@${q.username}`,
      type: 'prediction' as const,
      participants: [q.username],
      priceContext: q.priceContext,
      sentiment: q.sentiment,
      wasCorrect: q.wasCorrect,
      priceAtQuote: q.priceAtQuote
    }))

  const priceChange = analysis?.priceChange
  const trendColor = priceChange?.trend === 'bullish' 
    ? 'text-emerald-500' 
    : priceChange?.trend === 'bearish' 
      ? 'text-red-500' 
      : 'text-amber-500'

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
            {analysis?.headline && (
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md truncate">
                {analysis.headline}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {priceChange && (
            <span className={`text-xs font-mono ${trendColor}`}>
              {priceChange.changePercent > 0 ? '+' : ''}{priceChange.changePercent?.toFixed(1)}%
            </span>
          )}
          <button
            onClick={fetchData}
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

      {/* Chart */}
      <div className="rounded-lg overflow-hidden border border-primary/10 bg-card">
        {isLoading && ohlcData.length === 0 ? (
          <div className="w-full h-[600px] bg-muted/20 animate-pulse flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Chart lädt...</span>
          </div>
        ) : ohlcData.length === 0 ? (
          <div className="w-full h-[600px] flex items-center justify-center text-muted-foreground">
            Keine Daten verfügbar
          </div>
        ) : (
          <div style={{ height: 600 }}>
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
          <span>{events.length} Zitate auf dem Chart</span>
          {fetchedAt && (
            <span>Aktualisiert: {new Date(fetchedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
      )}
    </div>
  )
}

