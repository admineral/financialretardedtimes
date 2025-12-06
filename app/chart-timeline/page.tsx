'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { RefreshCw, TrendingUp, Sparkles, Quote, Trophy, Skull, Clock, Database, CandlestickChart } from 'lucide-react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import dynamic from 'next/dynamic'

// Dynamic import for Chart.js (SSR issues)
const ChartJSCandlestick = dynamic(
  () => import('./components/ChartJSCandlestick').then(mod => mod.ChartJSCandlestick),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

// Schema for AI analysis (must match API)
const ChartQuoteSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  username: z.string(),
  quote: z.string(), // Max 50 chars for chart labels
  priceContext: z.enum([
    'pump_call', 'dump_call', 'top_call', 'bottom_call',
    'fomo', 'panic', 'diamond_hands', 'reversal', 'sideways', 'analysis'
  ]),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  wasCorrect: z.boolean().optional(),
  priceAtQuote: z.number(),
})

const AnalysisResponseSchema = z.object({
  headline: z.string(), // Max 60 chars
  subheadline: z.string(), // Max 100 chars
  priceChange: z.object({
    startPrice: z.number(),
    endPrice: z.number(),
    changePercent: z.number(),
    trend: z.enum(['bullish', 'bearish', 'sideways'])
  }),
  quotes: z.array(ChartQuoteSchema), // 6-20 quality predictions
  bestCall: z.object({
    username: z.string(),
    quote: z.string(),
    context: z.string()
  }).optional(),
  worstCall: z.object({
    username: z.string(),
    quote: z.string(),
    context: z.string()
  }).optional(),
  dataRange: z.object({
    messagesFrom: z.string(),
    messagesTo: z.string(),
    messageCount: z.number()
  }).optional()
})

type ChartQuote = z.infer<typeof ChartQuoteSchema>
type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>

// Types
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

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

type Timeframe = '15m' | '1H' | '4H' | '1D' | '1W'

// Skeleton loader
function ChartSkeleton() {
  return (
    <div className="w-full h-[600px] bg-muted/20 rounded-lg animate-pulse flex items-center justify-center">
      <div className="text-muted-foreground text-sm">Chart lädt...</div>
    </div>
  )
}

// Timeframe selector
function TimeframeSelector({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
  const options: Timeframe[] = ['15m', '1H', '4H', '1D', '1W']
  
  return (
    <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
      {options.map(tf => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
            value === tf 
              ? 'bg-primary text-primary-foreground' 
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  )
}

// Relative time display
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Nie'
  
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffMins < 1) return 'Gerade eben'
  if (diffMins < 60) return `vor ${diffMins} Min.`
  if (diffHours < 24) return `vor ${diffHours} Std.`
  return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`
}

// Get style for price context
function getContextStyle(context: string) {
  switch (context) {
    case 'pump_call':
    case 'bottom_call':
      return { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', label: '📈 Pump Call' }
    case 'dump_call':
    case 'top_call':
      return { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', label: '📉 Dump Call' }
    case 'fomo':
      return { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-400', label: '🚀 FOMO' }
    case 'panic':
      return { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', label: '😱 Panik' }
    case 'diamond_hands':
      return { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', label: '💎 Diamond Hands' }
    case 'reversal':
      return { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', label: '🔄 Reversal' }
    case 'analysis':
      return { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400', label: '📊 Analyse' }
    default:
      return { bg: 'bg-gray-500/20', border: 'border-gray-500/50', text: 'text-gray-400', label: '💬 Quote' }
  }
}

export default function ChartTimelinePage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('15m')
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRefreshingOhlc, setIsRefreshingOhlc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Cache timestamps
  const [ohlcFetchedAt, setOhlcFetchedAt] = useState<string | null>(null)
  const [analysisFetchedAt, setAnalysisFetchedAt] = useState<string | null>(null)
  const [isCached, setIsCached] = useState<boolean>(false)
  
  // Data range info (what dates were sent to AI)
  const [dataRange, setDataRange] = useState<{ messagesFrom: string; messagesTo: string; messageCount: number } | null>(null)
  
  // Cached analysis (loaded on mount)
  const [cachedAnalysis, setCachedAnalysis] = useState<AnalysisResponse | null>(null)
  
  // Last known streaming data (persists after streaming completes)
  const [lastStreamingData, setLastStreamingData] = useState<AnalysisResponse | null>(null)
  
  // AI Analysis with streaming - for fresh generation
  const { object: streamingAnalysis, isLoading: isAnalyzing, submit: runAnalysis } = useObject({
    api: '/chart-timeline/api/analyze?force=true',
    schema: AnalysisResponseSchema,
  })
  
  // Use streaming analysis for UI display, fallback to lastStreamingData, then cachedAnalysis
  const aiAnalysis = streamingAnalysis || lastStreamingData || cachedAnalysis

  // Convert AI quotes to TimelineEvents - shows streaming progress live
  const aiEvents: TimelineEvent[] = useMemo(() => {
    const analysis = aiAnalysis
    if (!analysis?.quotes) return []
    
    return analysis.quotes
      .filter((q): q is ChartQuote => 
        q !== undefined && 
        typeof q.id === 'string' && 
        typeof q.quote === 'string' &&
        typeof q.username === 'string' &&
        typeof q.timestamp === 'string'
      )
      .map((q) => {
        const date = q.timestamp.split('T')[0] || new Date().toISOString().split('T')[0]
        const time = q.timestamp.split('T')[1]?.slice(0, 5) || '12:00'
        return {
          id: q.id,
          date,
          time,
          title: q.quote,
          description: `@${q.username} • $${q.priceAtQuote?.toLocaleString() || '?'}`,
          type: mapContextToType(q.priceContext),
          participants: [q.username],
          priceContext: q.priceContext,
          sentiment: q.sentiment,
          wasCorrect: q.wasCorrect,
          priceAtQuote: q.priceAtQuote
        }
      })
  }, [aiAnalysis])

  function mapContextToType(context: string): TimelineEvent['type'] {
    switch (context) {
      case 'pump_call':
      case 'bottom_call':
        return 'prediction'
      case 'dump_call':
      case 'top_call':
      case 'panic':
        return 'drama'
      case 'fomo':
      case 'diamond_hands':
        return 'milestone'
      case 'analysis':
      case 'reversal':
        return 'insight'
      default:
        return 'discussion'
    }
  }

  // Fetch OHLC data (uses cache by default)
  const fetchOHLC = useCallback(async (tf: Timeframe, force: boolean = false) => {
    try {
      const url = `/chart-timeline/api/ohlc?timeframe=${tf}${force ? '&force=true' : ''}`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch OHLC data')
      const data = await response.json()
      setOhlcFetchedAt(data.fetchedAt)
      setIsCached(data.cached || false)
      return data.ohlc as OHLCData[]
    } catch (err) {
      console.error('[ChartTimeline] OHLC fetch error:', err)
      throw err
    }
  }, [])

  // Fetch cached analysis
  const fetchCachedAnalysis = useCallback(async () => {
    try {
      const response = await fetch('/chart-timeline/api/analyze')
      if (!response.ok) return null
      const data = await response.json()
      if (data.cached && data.analysis) {
        setCachedAnalysis(data.analysis)
        setAnalysisFetchedAt(data.fetchedAt)
        if (data.dataRange) {
          setDataRange(data.dataRange)
          console.log('[ChartTimeline] Data range loaded:', data.dataRange)
        }
        return data.analysis
      }
      return null
    } catch (err) {
      console.error('[ChartTimeline] Cached analysis fetch error:', err)
      return null
    }
  }, [])

  // Initial load - fetch from cache
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Fetch OHLC and cached analysis in parallel
      const [ohlc] = await Promise.all([
        fetchOHLC(timeframe, false),
        fetchCachedAnalysis()
      ])
      setOhlcData(ohlc)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [timeframe, fetchOHLC, fetchCachedAnalysis])

  // Force refresh - fetches fresh data from all sources
  const forceRefresh = useCallback(async () => {
    console.log('[ChartTimeline] 🔄 Force refresh triggered')
    console.log('[ChartTimeline] Timeframe:', timeframe)
    setIsRefreshing(true)
    setError(null)

    try {
      // Fetch fresh OHLC data
      console.log('[ChartTimeline] Fetching fresh OHLC...')
      const ohlc = await fetchOHLC(timeframe, true)
      console.log('[ChartTimeline] OHLC received:', ohlc.length, 'candles')
      console.log('[ChartTimeline] OHLC range:', {
        first: new Date(ohlc[0]?.timestamp).toISOString(),
        last: new Date(ohlc[ohlc.length - 1]?.timestamp).toISOString()
      })
      setOhlcData(ohlc)
      
      // Set data range for UI (7 days ago to now)
      const now = new Date()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      setDataRange({
        messagesFrom: sevenDaysAgo.toISOString(),
        messagesTo: now.toISOString(),
        messageCount: 800  // Approximate, will be updated when streaming completes
      })
      
      // Trigger fresh AI analysis
      console.log('[ChartTimeline] Starting AI analysis stream...')
      runAnalysis({})
      setAnalysisFetchedAt(new Date().toISOString())
    } catch (err) {
      console.error('[ChartTimeline] Force refresh error:', err)
      setError(err instanceof Error ? err.message : 'Failed to refresh data')
    } finally {
      setIsRefreshing(false)
    }
  }, [timeframe, fetchOHLC, runAnalysis])

  // Refresh only OHLC data (without AI analysis)
  const refreshOhlc = useCallback(async () => {
    console.log('[ChartTimeline] 🕯️ Refreshing OHLC only...')
    setIsRefreshingOhlc(true)
    try {
      const ohlc = await fetchOHLC(timeframe, true)
      console.log('[ChartTimeline] OHLC refreshed:', ohlc.length, 'candles')
      setOhlcData(ohlc)
    } catch (err) {
      console.error('[ChartTimeline] OHLC refresh error:', err)
    } finally {
      setIsRefreshingOhlc(false)
    }
  }, [timeframe, fetchOHLC])

  // Initial load
  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload OHLC on timeframe change
  useEffect(() => {
    if (!isLoading) {
      fetchOHLC(timeframe, false).then(setOhlcData).catch(console.error)
    }
  }, [timeframe]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save streaming data as it comes in
  useEffect(() => {
    if (streamingAnalysis && streamingAnalysis.quotes && streamingAnalysis.quotes.length > 0) {
      setLastStreamingData(streamingAnalysis as AnalysisResponse)
    }
  }, [streamingAnalysis])
  
  // When streaming completes, save to cachedAnalysis
  useEffect(() => {
    if (!isAnalyzing && lastStreamingData && lastStreamingData.quotes && lastStreamingData.quotes.length > 0) {
      console.log('[ChartTimeline] ✅ Streaming complete! Saving', lastStreamingData.quotes.length, 'quotes')
      setCachedAnalysis(lastStreamingData)
      setAnalysisFetchedAt(new Date().toISOString())
    }
  }, [isAnalyzing, lastStreamingData])

  const priceChange = aiAnalysis?.priceChange
  const trendColor = priceChange?.trend === 'bullish' ? 'text-emerald-500' : priceChange?.trend === 'bearish' ? 'text-red-500' : 'text-amber-500'

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="w-full border-b border-foreground/10 py-3">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-amber-500" />
            <h1 className="font-headline text-lg font-bold tracking-wide">
              BTC Chart Timeline
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <ThemeSwitcher />
          </div>
        </div>
      </div>

      {/* AI Headline Banner */}
      {(aiAnalysis?.headline || isAnalyzing) && (
        <div className={`w-full py-4 border-b ${priceChange?.trend === 'bullish' ? 'bg-emerald-500/5 border-emerald-500/20' : priceChange?.trend === 'bearish' ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-start gap-4">
              <Sparkles className={`w-6 h-6 ${trendColor} flex-shrink-0 mt-1`} />
              <div className="flex-1">
                {isAnalyzing && !aiAnalysis?.headline ? (
                  <div className="animate-pulse">
                    <div className="h-6 bg-muted/30 rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted/20 rounded w-1/2" />
                  </div>
                ) : (
                  <>
                    <h2 className="font-headline text-xl font-bold">
                      {aiAnalysis?.headline}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {aiAnalysis?.subheadline}
                    </p>
                    {priceChange && (
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="text-muted-foreground">
                          ${priceChange.startPrice?.toLocaleString()} → ${priceChange.endPrice?.toLocaleString()}
                        </span>
                        <span className={`font-mono font-bold ${trendColor}`}>
                          {(priceChange.changePercent ?? 0) > 0 ? '+' : ''}{priceChange.changePercent?.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="w-full border-b border-foreground/10 py-3 bg-muted/10">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <TimeframeSelector value={timeframe} onChange={setTimeframe} />
            <span className="text-xs text-muted-foreground">
              {ohlcData.length} candles • {aiEvents.length} Zitate
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Cache Status */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isCached && (
                <span className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded">
                  <Database className="w-3 h-3" />
                  Cached
                </span>
              )}
              <button
                onClick={refreshOhlc}
                disabled={isRefreshingOhlc}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 transition-colors disabled:opacity-50"
                title="OHLC Daten aktualisieren"
              >
                <CandlestickChart className={`w-3 h-3 ${isRefreshingOhlc ? 'animate-pulse' : ''}`} />
                <span>OHLC: {formatRelativeTime(ohlcFetchedAt)}</span>
                {isRefreshingOhlc && <RefreshCw className="w-3 h-3 animate-spin" />}
              </button>
              {analysisFetchedAt && (
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Analyse: {formatRelativeTime(analysisFetchedAt)}
                </span>
              )}
              {dataRange && (
                <span className="flex items-center gap-1 text-muted-foreground border-l border-foreground/20 pl-3 ml-1">
                  📊 AI-Daten: {new Date(dataRange.messagesFrom).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} 
                  {' → '} 
                  {new Date(dataRange.messagesTo).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {' '}({dataRange.messageCount} Nachrichten)
                </span>
              )}
            </div>
            
            {/* Force Refresh Button */}
            <button
              onClick={forceRefresh}
              disabled={isRefreshing || isAnalyzing}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded border transition-all
                ${isRefreshing || isAnalyzing 
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-500/70' 
                  : 'border-amber-500/50 bg-amber-500/20 text-amber-500 hover:bg-amber-500/30'
                } disabled:cursor-not-allowed`}
            >
              <RefreshCw className={`w-3 h-3 ${(isRefreshing || isAnalyzing) ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Lädt...' : isAnalyzing ? 'Analysiere...' : 'Neu laden'}
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {error ? (
          <div className="w-full h-[500px] flex flex-col items-center justify-center bg-muted/10 rounded-lg border border-red-500/30">
            <p className="text-red-400 mb-3">{error}</p>
            <button onClick={() => loadData()} className="text-sm text-primary hover:underline">
              Erneut versuchen
            </button>
          </div>
        ) : isLoading ? (
          <ChartSkeleton />
        ) : (
          <div className="border border-foreground/10 rounded-lg bg-card overflow-hidden" style={{ height: 600 }}>
            <ChartJSCandlestick 
              ohlcData={ohlcData} 
              events={aiEvents}  // Live streaming - shows quotes as they arrive
              timeframe={timeframe}
            />
          </div>
        )}
      </div>

      {/* Best & Worst Calls */}
      {(aiAnalysis?.bestCall || aiAnalysis?.worstCall) && (
        <div className="max-w-7xl mx-auto px-4 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Best Call */}
            {aiAnalysis.bestCall && (
              <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                    Bester Call der Woche
                  </span>
                </div>
                <p className="font-medium">„{aiAnalysis.bestCall.quote}"</p>
                <p className="text-sm text-muted-foreground mt-1">
                  — @{aiAnalysis.bestCall.username}
                </p>
                <p className="text-xs text-emerald-400 mt-2">
                  {aiAnalysis.bestCall.context}
                </p>
              </div>
            )}
            
            {/* Worst Call */}
            {aiAnalysis.worstCall && (
              <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Skull className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-red-500">
                    Schlechtester Call
                  </span>
                </div>
                <p className="font-medium">„{aiAnalysis.worstCall.quote}"</p>
                <p className="text-sm text-muted-foreground mt-1">
                  — @{aiAnalysis.worstCall.username}
                </p>
                <p className="text-xs text-red-400 mt-2">
                  {aiAnalysis.worstCall.context}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quotes Grid */}
      {aiEvents.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pb-8">
          <div className="flex items-center gap-2 mb-4">
            <Quote className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
              Zitate auf dem Chart ({aiEvents.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {aiEvents.map(event => {
              const style = getContextStyle(event.priceContext || '')
              return (
                <div 
                  key={event.id}
                  className={`p-3 rounded-lg border ${style.bg} ${style.border} backdrop-blur-sm`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${style.text}`}>
                      {style.label}
                    </span>
                    {event.wasCorrect !== undefined && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        event.wasCorrect ? 'bg-emerald-500/30 text-emerald-400' : 'bg-red-500/30 text-red-400'
                      }`}>
                        {event.wasCorrect ? '✓ Richtig' : '✗ Falsch'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-snug">„{event.title}"</p>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                    <span>@{event.participants[0]}</span>
                    <span className="font-mono">${event.priceAtQuote?.toLocaleString()}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* No Analysis Prompt */}
      {!aiAnalysis && !isAnalyzing && !isLoading && (
        <div className="max-w-7xl mx-auto px-4 pb-8">
          <div className="p-6 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/5 text-center">
            <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium mb-2">Keine Analyse verfügbar</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Klicke auf „Neu laden" um eine frische AI-Analyse zu generieren.
            </p>
            <button
              onClick={forceRefresh}
              className="px-4 py-2 text-sm rounded bg-amber-500/20 text-amber-500 border border-amber-500/50 hover:bg-amber-500/30 transition-all"
            >
              Analyse starten
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        <div className="flex flex-wrap justify-center gap-4 text-xs">
          {['pump_call', 'dump_call', 'fomo', 'panic', 'diamond_hands', 'analysis'].map(ctx => {
            const style = getContextStyle(ctx)
            return (
              <div key={ctx} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${style.bg} border ${style.border}`} />
                <span className="text-muted-foreground">{style.label}</span>
              </div>
            )
          })}
        </div>
        <div className="text-center text-xs text-muted-foreground/60 mt-4">
          <p>KI-analysierte Zitate aus dem TradingView Bitcoin-Chat • Preis-Daten von CoinGecko</p>
        </div>
      </div>
    </main>
  )
}
