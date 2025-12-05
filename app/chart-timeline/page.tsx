'use client'

import { useState, useEffect, useCallback } from 'react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { RefreshCw, TrendingUp, TrendingDown, Clock, Sparkles, Quote, Trophy, Skull } from 'lucide-react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import dynamic from 'next/dynamic'

// Dynamic import for ApexCharts (SSR issues)
const CandlestickChart = dynamic(
  () => import('./components/CandlestickChart').then(mod => mod.CandlestickChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

// Schema for AI analysis (must match API)
const ChartQuoteSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  username: z.string(),
  quote: z.string(),
  priceContext: z.enum([
    'pump_call', 'dump_call', 'top_call', 'bottom_call',
    'fomo', 'panic', 'diamond_hands', 'reversal', 'sideways', 'analysis'
  ]),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  wasCorrect: z.boolean().optional(),
  priceAtQuote: z.number(),
})

const AnalysisResponseSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  priceChange: z.object({
    startPrice: z.number(),
    endPrice: z.number(),
    changePercent: z.number(),
    trend: z.enum(['bullish', 'bearish', 'sideways'])
  }),
  quotes: z.array(ChartQuoteSchema),
  bestCall: z.object({
    username: z.string(),
    quote: z.string(),
    context: z.string()
  }).optional(),
  worstCall: z.object({
    username: z.string(),
    quote: z.string(),
    context: z.string()
  }).optional()
})

type ChartQuote = z.infer<typeof ChartQuoteSchema>

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

type Timeframe = '15m' | '1H' | '1D' | '1W' | '1M'

// Skeleton loader
function ChartSkeleton() {
  return (
    <div className="w-full h-[500px] bg-muted/20 rounded-lg animate-pulse flex items-center justify-center">
      <div className="text-muted-foreground text-sm">Chart lädt...</div>
    </div>
  )
}

// Timeframe selector
function TimeframeSelector({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
  const options: Timeframe[] = ['15m', '1H', '1D', '1W', '1M']
  
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
  const [timeframe, setTimeframe] = useState<Timeframe>('1H')
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // AI Analysis with streaming - default mode
  const { object: aiAnalysis, isLoading: isAnalyzing, submit: runAnalysis } = useObject({
    api: '/chart-timeline/api/analyze',
    schema: AnalysisResponseSchema,
  })

  // Convert AI quotes to TimelineEvents for chart
  const aiEvents: TimelineEvent[] = (aiAnalysis?.quotes || [])
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

  // Fetch OHLC data
  const fetchOHLC = useCallback(async (tf: Timeframe) => {
    try {
      const response = await fetch(`/chart-timeline/api/ohlc?timeframe=${tf}`)
      if (!response.ok) throw new Error('Failed to fetch OHLC data')
      const data = await response.json()
      return data.ohlc as OHLCData[]
    } catch (err) {
      console.error('[ChartTimeline] OHLC fetch error:', err)
      throw err
    }
  }, [])

  // Load data and auto-start AI analysis
  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true)
    else setIsLoading(true)
    setError(null)

    try {
      const ohlc = await fetchOHLC(timeframe)
      setOhlcData(ohlc)
      
      // Auto-start AI analysis if not already loaded
      if (!aiAnalysis?.headline && !isAnalyzing) {
        runAnalysis({})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [timeframe, fetchOHLC, aiAnalysis, isAnalyzing, runAnalysis])

  // Initial load
  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on timeframe change
  useEffect(() => {
    if (!isLoading) {
      fetchOHLC(timeframe).then(setOhlcData).catch(console.error)
    }
  }, [timeframe]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <TimeframeSelector value={timeframe} onChange={setTimeframe} />
            <span className="text-xs text-muted-foreground">
              {ohlcData.length} candles • {aiEvents.length} Zitate
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => runAnalysis({})}
              disabled={isAnalyzing}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded border transition-all
                bg-amber-500/20 border-amber-500/50 text-amber-500 hover:bg-amber-500/30 disabled:opacity-50`}
            >
              <Sparkles className={`w-3 h-3 ${isAnalyzing ? 'animate-pulse' : ''}`} />
              {isAnalyzing ? 'Analysiere...' : 'Neu analysieren'}
            </button>
            <button
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-foreground/20 hover:bg-muted/50 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
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
          <div className="border border-foreground/10 rounded-lg bg-card overflow-hidden">
            <CandlestickChart 
              ohlcData={ohlcData} 
              events={aiEvents}
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
