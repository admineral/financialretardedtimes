'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown,
  Flame, 
  ChartBar, 
  Crosshair,
  Sparkles,
  Coins,
  Trophy,
  Clock,
  AlertCircle
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { PredictionCard, type Prediction } from './components'

// Dynamic import for Chart.js (SSR issues)
const ChartJSCandlestick = dynamic(
  () => import('../chart-timeline/components/ChartJSCandlestick').then(mod => mod.ChartJSCandlestick),
  { ssr: false, loading: () => <ChartSkeleton /> }
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
  fullQuote: string
  story?: string
  description: string
  type: 'discussion' | 'prediction' | 'drama' | 'insight' | 'milestone' | 'humor'
  participants: string[]
  priceContext?: string
  sentiment?: string
  wasCorrect?: boolean
  priceAtQuote?: number
  hasTimeframe?: boolean
}

type Timeframe = '15m' | '1H' | '4H' | '1D'

function ChartSkeleton() {
  return (
    <div className="w-full h-[350px] bg-zinc-900/50 rounded-lg animate-pulse flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        <span className="text-muted-foreground text-sm">Chart lädt...</span>
      </div>
    </div>
  )
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Nie'
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffMins < 1) return 'Gerade eben'
  if (diffMins < 60) return `vor ${diffMins} Min.`
  if (diffHours < 24) return `vor ${diffHours} Std.`
  return `vor ${Math.floor(diffHours / 24)} Tag${diffHours >= 48 ? 'en' : ''}`
}

// Get stored credits
function getStoredCredits() {
  if (typeof window === 'undefined') return { available: 1000, total: 1000 }
  try {
    const stored = localStorage.getItem('prediction_credits')
    if (stored) return JSON.parse(stored)
  } catch { /* empty */ }
  return { available: 1000, total: 1000 }
}

// Timeline Track Component - Shows predictions in a horizontal scrollable row
function TimelineTrack({ 
  predictions, 
  label, 
  icon: Icon, 
  color,
  onSelect,
  selectedId 
}: { 
  predictions: Prediction[]
  label: string
  icon: React.ElementType
  color: string
  onSelect: (p: Prediction) => void
  selectedId: string | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  if (predictions.length === 0) return null
  
  return (
    <div className="flex items-stretch gap-2 min-h-[80px]">
      {/* Track Label */}
      <div className={`w-28 flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-l-lg border-r-2 ${color}`}>
        <Icon className="w-4 h-4" />
        <div>
          <div className="text-xs font-semibold">{label}</div>
          <div className="text-[10px] opacity-70">{predictions.length} Wetten</div>
        </div>
      </div>
      
      {/* Track Items - Horizontal Scroll */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-x-auto flex items-center gap-2 py-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-700"
      >
        {predictions.map(p => {
          const isSelected = selectedId === p.id
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={`
                flex-shrink-0 px-3 py-2 rounded-lg border transition-all duration-200
                ${isSelected 
                  ? `${color} scale-105 shadow-lg` 
                  : 'bg-card/50 border-zinc-700 hover:border-zinc-600 hover:bg-card'
                }
              `}
              style={{ minWidth: 160, maxWidth: 200 }}
            >
              <div className="flex items-center gap-2 mb-1">
                {p.direction === 'bullish' ? (
                  <TrendingUp className="w-3 h-3 text-green-400" />
                ) : p.direction === 'bearish' ? (
                  <TrendingDown className="w-3 h-3 text-red-400" />
                ) : null}
                <span className="text-xs font-medium truncate">@{p.username}</span>
              </div>
              <div className="text-[11px] text-left line-clamp-2 text-muted-foreground">
                {p.prediction}
              </div>
              {p.targetPrice && (
                <div className="text-xs font-mono mt-1 text-amber-400">
                  ${(p.targetPrice / 1000).toFixed(1)}k
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function PredictionMarketPage() {
  const [isMounted, setIsMounted] = useState(false)
  const [timeframe, setTimeframe] = useState<Timeframe>('15m')
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [summary, setSummary] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [currentPrice, setCurrentPrice] = useState(0)
  const [credits, setCredits] = useState({ available: 1000, total: 1000 })
  const [userBets, setUserBets] = useState<Record<string, 'yes' | 'no'>>({})
  const [pools, setPools] = useState<Record<string, { yes: number; no: number }>>({})
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null)

  // Client-side initialization
  useEffect(() => {
    setIsMounted(true)
    setCredits(getStoredCredits())
    
    // Load bets from localStorage
    try {
      const storedBets = localStorage.getItem('prediction_bets')
      if (storedBets) setUserBets(JSON.parse(storedBets))
      const storedPools = localStorage.getItem('prediction_pools')
      if (storedPools) setPools(JSON.parse(storedPools))
    } catch { /* empty */ }
  }, [])

  // Fetch OHLC data
  const fetchOHLC = useCallback(async (tf: Timeframe) => {
    try {
      const res = await fetch(`/chart-timeline/api/ohlc?timeframe=${tf}`)
      if (!res.ok) throw new Error('OHLC fetch failed')
      const data = await res.json()
      
      // Set current price from latest candle
      if (data.ohlc?.length > 0) {
        const latest = data.ohlc[data.ohlc.length - 1]
        setCurrentPrice(latest.close)
      }
      
      return data.ohlc || []
    } catch (err) {
      console.error('[PREDICTION] OHLC error:', err)
      return []
    }
  }, [])

  // Fetch predictions
  const fetchPredictions = useCallback(async (force = false) => {
    setIsLoadingPredictions(true)
    setError(null)
    
    try {
      const url = `/prediction/api/extract${force ? '?force=true' : ''}`
      const res = await fetch(url)
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to fetch predictions')
      }
      
      const data = await res.json()
      setPredictions(data.predictions || [])
      setSummary(data.summary || '')
      setFetchedAt(data.fetchedAt)
      
      return data.predictions || []
    } catch (err) {
      console.error('[PREDICTION] Error:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
      return []
    } finally {
      setIsLoadingPredictions(false)
    }
  }, [])

  // Initial load - only OHLC, predictions load separately
  useEffect(() => {
    async function init() {
      setIsLoading(true)
      const ohlc = await fetchOHLC(timeframe)
      setOhlcData(ohlc)
      setIsLoading(false)
      
      // Then fetch predictions (non-blocking)
      fetchPredictions()
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload OHLC on timeframe change
  useEffect(() => {
    if (isMounted && !isLoading) {
      fetchOHLC(timeframe).then(setOhlcData)
    }
  }, [timeframe, isMounted]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh handler
  const handleRefresh = async () => {
    await Promise.all([
      fetchOHLC(timeframe).then(setOhlcData),
      fetchPredictions(true)
    ])
  }

  // Handle betting
  const handleBet = (prediction: Prediction, type: 'yes' | 'no') => {
    const betAmount = 10
    
    if (credits.available < betAmount) {
      alert('Nicht genug Credits!')
      return
    }
    
    if (userBets[prediction.id]) {
      alert('Du hast bereits gewettet!')
      return
    }

    const newCredits = { ...credits, available: credits.available - betAmount }
    setCredits(newCredits)
    localStorage.setItem('prediction_credits', JSON.stringify(newCredits))

    const newBets = { ...userBets, [prediction.id]: type }
    setUserBets(newBets)
    localStorage.setItem('prediction_bets', JSON.stringify(newBets))

    const currentPool = pools[prediction.id] || { yes: 50, no: 50 }
    const newPool = { ...currentPool, [type]: currentPool[type] + betAmount }
    const newPools = { ...pools, [prediction.id]: newPool }
    setPools(newPools)
    localStorage.setItem('prediction_pools', JSON.stringify(newPools))
  }

  // Convert predictions to chart events for display
  // Only show predictions that fall within the OHLC data range
  const chartEvents: TimelineEvent[] = useMemo(() => {
    if (ohlcData.length === 0) return []
    
    const chartStartTime = ohlcData[0]?.timestamp || 0
    const chartEndTime = ohlcData[ohlcData.length - 1]?.timestamp || Date.now()
    
    return predictions
      .filter(p => {
        // Only include predictions whose timestamp falls within chart range
        const predTime = new Date(p.timestamp).getTime()
        return predTime >= chartStartTime && predTime <= chartEndTime
      })
      .slice(0, 25) // Limit to 25 predictions on chart
      .map(p => {
        const date = p.timestamp.split('T')[0]
        const time = p.timestamp.split('T')[1]?.slice(0, 5) || '12:00'
        return {
          id: p.id,
          date,
          time,
          title: p.prediction.slice(0, 35) + (p.prediction.length > 35 ? '...' : ''),
          fullQuote: p.prediction,
          description: `@${p.username}`,
          type: 'prediction' as const,
          participants: [p.username],
          priceContext: p.direction === 'bullish' ? 'pump_call' : p.direction === 'bearish' ? 'dump_call' : 'analysis',
          sentiment: p.direction,
          priceAtQuote: p.priceAtPrediction
        }
      })
  }, [predictions, ohlcData])

  // Group predictions by timeframe
  const grouped = useMemo(() => ({
    short: predictions.filter(p => p.timeframe === 'short'),
    mid: predictions.filter(p => p.timeframe === 'mid'),
    long: predictions.filter(p => p.timeframe === 'long'),
  }), [predictions])

  const timeframeOptions: Timeframe[] = ['15m', '1H', '4H', '1D']

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-900/10 via-zinc-950 to-zinc-950 pointer-events-none" />

      <div className="relative z-10">
        {/* Compact Header */}
        <header className="sticky top-0 z-50 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800">
          <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Prediction Market
                </h1>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Price */}
              {isMounted && currentPrice > 0 && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800">
                  <span className="text-xs text-zinc-500">BTC</span>
                  <span className="font-mono font-bold text-amber-400">
                    ${currentPrice.toLocaleString()}
                  </span>
                </div>
              )}
              
              {/* Credits */}
              {isMounted && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-amber-400 tabular-nums">{credits.available}</span>
                </div>
              )}
              
              <ThemeSwitcher />
            </div>
          </div>
        </header>

        {/* Controls Bar */}
        <div className="border-b border-zinc-800 bg-zinc-900/50">
          <div className="max-w-[1600px] mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              {/* Timeframe */}
              <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5">
                {timeframeOptions.map(tf => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 text-xs font-mono rounded transition-all ${
                      timeframe === tf 
                        ? 'bg-purple-600 text-white' 
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              
              {/* Stats */}
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-orange-400">
                  <Flame className="w-3 h-3" />
                  {grouped.short.length}
                </span>
                <span className="flex items-center gap-1 text-blue-400">
                  <ChartBar className="w-3 h-3" />
                  {grouped.mid.length}
                </span>
                <span className="flex items-center gap-1 text-purple-400">
                  <Crosshair className="w-3 h-3" />
                  {grouped.long.length}
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <Trophy className="w-3 h-3" />
                  {Object.keys(userBets).length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(fetchedAt)}
              </span>
              
              <button
                onClick={handleRefresh}
                disabled={isLoadingPredictions}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-purple-600/20 text-purple-400 border border-purple-600/30 hover:bg-purple-600/30 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingPredictions ? 'animate-spin' : ''}`} />
                {isLoadingPredictions ? 'Lädt...' : 'Neu laden'}
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-[1600px] mx-auto p-4 space-y-4">
          
          {/* Summary Banner */}
          {summary && (
            <div className="p-3 rounded-lg bg-purple-900/20 border border-purple-800/30">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-purple-200">{summary}</p>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50" style={{ height: 350 }}>
            {isLoading ? (
              <ChartSkeleton />
            ) : ohlcData.length > 0 ? (
              <ChartJSCandlestick 
                ohlcData={ohlcData} 
                events={chartEvents}
                timeframe={timeframe}
                disableZoom={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500">
                Keine Chart-Daten
              </div>
            )}
          </div>

          {/* Timeline Tracks - iMovie Style */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/30">
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-300">📽️ Prediction Timeline</h2>
              <span className="text-[10px] text-zinc-500">← Scroll horizontal →</span>
            </div>
            
            {isLoadingPredictions ? (
              <div className="p-8 flex items-center justify-center">
                <div className="flex items-center gap-3 text-zinc-500">
                  <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                  <span className="text-sm">Vorhersagen werden geladen...</span>
                </div>
              </div>
            ) : error ? (
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                <p className="text-sm text-red-400 mb-2">{error}</p>
                <button
                  onClick={() => fetchPredictions(true)}
                  className="text-xs text-purple-400 hover:underline"
                >
                  Erneut versuchen
                </button>
              </div>
            ) : predictions.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <Sparkles className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500 mb-2">Keine Vorhersagen gefunden</p>
                <button
                  onClick={() => fetchPredictions(true)}
                  className="text-xs px-3 py-1.5 bg-purple-600/20 text-purple-400 rounded border border-purple-600/30 hover:bg-purple-600/30"
                >
                  Vorhersagen generieren
                </button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                <TimelineTrack
                  predictions={grouped.short}
                  label="Kurzfristig"
                  icon={Flame}
                  color="bg-orange-900/30 border-orange-500 text-orange-400"
                  onSelect={setSelectedPrediction}
                  selectedId={selectedPrediction?.id || null}
                />
                <TimelineTrack
                  predictions={grouped.mid}
                  label="Mittelfristig"
                  icon={ChartBar}
                  color="bg-blue-900/30 border-blue-500 text-blue-400"
                  onSelect={setSelectedPrediction}
                  selectedId={selectedPrediction?.id || null}
                />
                <TimelineTrack
                  predictions={grouped.long}
                  label="Langfristig"
                  icon={Crosshair}
                  color="bg-purple-900/30 border-purple-500 text-purple-400"
                  onSelect={setSelectedPrediction}
                  selectedId={selectedPrediction?.id || null}
                />
              </div>
            )}
          </div>

          {/* Selected Prediction Detail */}
          {selectedPrediction && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PredictionCard
                prediction={selectedPrediction}
                currentPrice={currentPrice}
                onBetYes={(p) => handleBet(p, 'yes')}
                onBetNo={(p) => handleBet(p, 'no')}
                yesPool={pools[selectedPrediction.id]?.yes || 50}
                noPool={pools[selectedPrediction.id]?.no || 50}
                userBet={userBets[selectedPrediction.id] || null}
              />
              
              {/* Quick stats */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 text-zinc-300">Wett-Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Preis bei Vorhersage:</span>
                    <span className="font-mono text-zinc-300">
                      ${selectedPrediction.priceAtPrediction.toLocaleString()}
                    </span>
                  </div>
                  {selectedPrediction.targetPrice && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Zielpreis:</span>
                      <span className="font-mono text-amber-400">
                        ${selectedPrediction.targetPrice.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Deadline:</span>
                    <span className="text-zinc-300">{selectedPrediction.targetDateText}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Richtung:</span>
                    <span className={
                      selectedPrediction.direction === 'bullish' ? 'text-green-400' :
                      selectedPrediction.direction === 'bearish' ? 'text-red-400' : 'text-zinc-400'
                    }>
                      {selectedPrediction.direction === 'bullish' ? '📈 Bullish' :
                       selectedPrediction.direction === 'bearish' ? '📉 Bearish' : '➡️ Neutral'}
                    </span>
                  </div>
                  {currentPrice > 0 && selectedPrediction.targetPrice && (
                    <div className="flex justify-between pt-2 border-t border-zinc-800">
                      <span className="text-zinc-500">Differenz zu Ziel:</span>
                      <span className={
                        selectedPrediction.targetPrice > currentPrice ? 'text-green-400' : 'text-red-400'
                      }>
                        {selectedPrediction.targetPrice > currentPrice ? '+' : ''}
                        {((selectedPrediction.targetPrice - currentPrice) / currentPrice * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* All Predictions Grid - Only show if none selected */}
          {!selectedPrediction && predictions.length > 0 && (
            <div className="space-y-6">
              {/* Short-term */}
              {grouped.short.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-bold mb-3">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span className="text-orange-400">Kurzfristig</span>
                    <span className="text-[10px] text-zinc-500 font-normal">(Tage)</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {grouped.short.slice(0, 6).map(p => (
                      <PredictionCard
                        key={p.id}
                        prediction={p}
                        currentPrice={currentPrice}
                        onBetYes={(pred) => handleBet(pred, 'yes')}
                        onBetNo={(pred) => handleBet(pred, 'no')}
                        yesPool={pools[p.id]?.yes || 50}
                        noPool={pools[p.id]?.no || 50}
                        userBet={userBets[p.id] || null}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Mid-term */}
              {grouped.mid.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-bold mb-3">
                    <ChartBar className="w-4 h-4 text-blue-400" />
                    <span className="text-blue-400">Mittelfristig</span>
                    <span className="text-[10px] text-zinc-500 font-normal">(Wochen)</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {grouped.mid.slice(0, 6).map(p => (
                      <PredictionCard
                        key={p.id}
                        prediction={p}
                        currentPrice={currentPrice}
                        onBetYes={(pred) => handleBet(pred, 'yes')}
                        onBetNo={(pred) => handleBet(pred, 'no')}
                        yesPool={pools[p.id]?.yes || 50}
                        noPool={pools[p.id]?.no || 50}
                        userBet={userBets[p.id] || null}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Long-term */}
              {grouped.long.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-bold mb-3">
                    <Crosshair className="w-4 h-4 text-purple-400" />
                    <span className="text-purple-400">Langfristig</span>
                    <span className="text-[10px] text-zinc-500 font-normal">(Monate)</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {grouped.long.slice(0, 6).map(p => (
                      <PredictionCard
                        key={p.id}
                        prediction={p}
                        currentPrice={currentPrice}
                        onBetYes={(pred) => handleBet(pred, 'yes')}
                        onBetNo={(pred) => handleBet(pred, 'no')}
                        yesPool={pools[p.id]?.yes || 50}
                        noPool={pools[p.id]?.no || 50}
                        userBet={userBets[p.id] || null}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-zinc-800 py-4 mt-8">
          <div className="max-w-[1600px] mx-auto px-4 text-center">
            <p className="text-[10px] text-zinc-600">
              Financial Retarded Times • Prediction Market Prototype • Credits sind nur zum Spaß
            </p>
          </div>
        </footer>
      </div>
    </main>
  )
}
