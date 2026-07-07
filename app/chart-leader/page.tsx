'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  Trophy,
  Skull,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Database,
  Sparkles,
  Flame,
  Target,
  Clock,
  ChevronDown,
  ChevronUp,
  Brain,
  BarChart2,
} from 'lucide-react'
import Link from 'next/link'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import { UserAvatar } from './components/UserAvatar'

// ══════════════════════════════════════════════════════════════════════
// SCHEMA (must match API)
// ══════════════════════════════════════════════════════════════════════

const LeaderboardEntrySchema = z.object({
  rank: z.number(),
  username: z.string(),
  score: z.number().min(0).max(100),
  correctCalls: z.number(),
  wrongCalls: z.number(),
  totalCalls: z.number(),
  winRate: z.number().min(0).max(100).transform(v => v <= 1 ? Math.round(v * 100) : v),
  bestCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    priceTarget: z.number().nullable(),
    direction: z.enum(['bullish', 'bearish']),
    outcome: z.string(),
    timestamp: z.string(),
  }),
  // Server emits null (OpenAI forbids optional), old caches may omit it
  worstCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    outcome: z.string(),
    timestamp: z.string(),
  }).nullish(),
  callHistory: z.array(z.object({
    quote: z.string(),
    direction: z.enum(['bullish', 'bearish', 'neutral']),
    wasCorrect: z.boolean(),
    priceAtCall: z.number(),
    timestamp: z.string(),
    priceContext: z.string(),
  })).max(5),
  badge: z.enum([
    'oracle', 'analyst', 'gambler', 'contrarian', 'degen',
    'diamond_hands', 'top_signal', 'bottom_feeder', 'newbie',
  ]),
  badgeReason: z.string(),
  commentaryText: z.string(),
})

const LeaderboardResponseSchema = z.object({
  weekSummary: z.object({
    headline: z.string(),
    subheadline: z.string(),
    startPrice: z.number(),
    endPrice: z.number(),
    changePercent: z.number(),
    topWinner: z.string(),
    topLoser: z.string(),
  }),
  leaderboard: z.array(LeaderboardEntrySchema).min(3).max(20),
  hallOfShame: z.array(z.object({
    username: z.string(),
    worstQuote: z.string(),
    priceAtCall: z.number(),
    outcome: z.string(),
    badge: z.string(),
  })).max(5),
  dataRange: z.object({
    from: z.string(),
    to: z.string(),
    totalMessages: z.number(),
    uniqueTraders: z.number(),
  }),
})

type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>
type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Nie'
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  if (diffMins < 1) return 'Gerade eben'
  if (diffMins < 60) return `vor ${diffMins} Min.`
  if (diffHours < 24) return `vor ${diffHours} Std.`
  return `vor ${Math.floor(diffHours / 24)} Tag${diffHours >= 48 ? 'en' : ''}`
}

const BADGE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  oracle: { icon: '🔮', label: 'Oracle', color: 'text-violet-400' },
  analyst: { icon: '📊', label: 'Analyst', color: 'text-blue-400' },
  gambler: { icon: '🎰', label: 'Gambler', color: 'text-amber-400' },
  contrarian: { icon: '🔄', label: 'Contrarian', color: 'text-orange-400' },
  degen: { icon: '🦧', label: 'Degen', color: 'text-pink-400' },
  diamond_hands: { icon: '💎', label: 'Diamond Hands', color: 'text-cyan-400' },
  top_signal: { icon: '🔔', label: 'Top Signal', color: 'text-red-400' },
  bottom_feeder: { icon: '🦈', label: 'Bottom Feeder', color: 'text-emerald-400' },
  newbie: { icon: '🐣', label: 'Newbie', color: 'text-zinc-400' },
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    : score >= 50 ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
    : 'bg-red-500/20 text-red-400 border-red-500/40'
  return (
    <span className={`inline-flex items-center justify-center w-11 h-11 rounded-full border-2 font-black text-lg tabular-nums ${color}`}>
      {score}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════════════
// LEADERBOARD ROW (Rate-Chart style)
// ══════════════════════════════════════════════════════════════════════

function LeaderboardRow({
  entry,
  index,
  isExpanded,
  onToggle,
}: {
  entry: LeaderboardEntry
  index: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const badge = BADGE_CONFIG[entry.badge] || BADGE_CONFIG.newbie
  const winRate = entry.winRate ?? 0
  const totalCalls = entry.totalCalls ?? 0

  return (
    <div>
      <div
        className={`group p-3 rounded-xl border transition-all cursor-pointer ${
          index === 0 ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/50' :
          index === 1 ? 'bg-gradient-to-r from-zinc-400/10 to-transparent border-zinc-500/50' :
          index === 2 ? 'bg-gradient-to-r from-orange-700/10 to-transparent border-orange-700/50' :
          'bg-zinc-800/40 border-zinc-700 hover:border-zinc-600'
        }`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {/* Rank */}
          <div className="w-10 text-center flex-shrink-0">
            {index === 0 && <div className="text-2xl">🥇</div>}
            {index === 1 && <div className="text-2xl">🥈</div>}
            {index === 2 && <div className="text-2xl">🥉</div>}
            {index > 2 && <div className="text-lg font-black text-zinc-600">#{index + 1}</div>}
          </div>

          {/* Profile picture */}
          <UserAvatar
            username={entry.username}
            size="md"
            className={`border-2 ring-1 flex-shrink-0 ${
              index === 0 ? 'border-amber-500/60 ring-amber-500/20' :
              index === 1 ? 'border-zinc-400/60 ring-zinc-400/20' :
              index === 2 ? 'border-orange-700/60 ring-orange-700/20' :
              'border-zinc-600/60 ring-zinc-600/20'
            }`}
          />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{entry.username}</span>
              <span className={`text-[10px] font-semibold ${badge.color}`}>
                {badge.label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="tabular-nums">{entry.correctCalls ?? 0}✓ / {entry.wrongCalls ?? 0}✗</span>
              <span>•</span>
              <span className="tabular-nums">{totalCalls} Calls</span>
              {winRate > 0 && (
                <>
                  <span>•</span>
                  <span className={`font-semibold tabular-nums ${
                    winRate >= 70 ? 'text-emerald-400' :
                    winRate >= 50 ? 'text-amber-400' : 'text-red-400'
                  }`}>{Math.round(winRate)}% Win</span>
                </>
              )}
            </div>
          </div>

          {/* Score + expand */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <ScoreBadge score={entry.score} />
            <div className="text-zinc-600">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Commentary below */}
        <p className="text-xs text-zinc-500 mt-2 ml-[52px] leading-relaxed line-clamp-1">
          {entry.commentaryText}
        </p>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="mt-2 ml-12 mr-4 space-y-3">
          {/* Best Call */}
          <div className="p-3 bg-emerald-500/5 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Bester Call</span>
            </div>
            <p className="text-sm italic text-zinc-200 mb-1.5">&bdquo;{entry.bestCall.quote}&ldquo;</p>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-zinc-500">BTC: <span className="font-mono font-bold text-amber-400">${entry.bestCall.priceAtCall.toLocaleString()}</span></span>
              {entry.bestCall.direction === 'bullish'
                ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                : <TrendingDown className="w-3 h-3 text-red-400" />}
              {entry.bestCall.priceTarget && (
                <span className="text-zinc-500">Ziel: <span className="font-mono text-emerald-400">${entry.bestCall.priceTarget.toLocaleString()}</span></span>
              )}
            </div>
            <p className="text-xs text-emerald-400 font-medium mt-1">✓ {entry.bestCall.outcome}</p>
          </div>

          {/* Call History */}
          {entry.callHistory && entry.callHistory.filter(c => c !== undefined).length > 0 && (
            <div className="space-y-1.5">
              {entry.callHistory.filter(c => c !== undefined).map((call, i) => (
                <div key={i} className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                  call.wasCorrect
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-zinc-800/60 border border-zinc-700 opacity-70'
                }`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-[10px] font-bold ${call.wasCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                      {call.wasCorrect ? '✅' : '❌'}
                    </span>
                    <span className="text-xs text-zinc-300 truncate">&bdquo;{call.quote}&ldquo;</span>
                  </div>
                  <span className="font-mono text-xs text-zinc-500 flex-shrink-0 ml-2">${call.priceAtCall.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Worst Call */}
          {entry.worstCall && (
            <div className="p-3 bg-red-500/5 border border-red-500/30 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Skull className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Schlechtester Call</span>
              </div>
              <p className="text-sm italic text-zinc-300 mb-1">&bdquo;{entry.worstCall.quote}&ldquo;</p>
              <div className="text-xs text-zinc-500 mb-1">
                BTC: <span className="font-mono font-bold text-amber-400">${entry.worstCall.priceAtCall.toLocaleString()}</span>
              </div>
              <p className="text-xs text-red-400 font-medium">✗ {entry.worstCall.outcome}</p>
            </div>
          )}

          {/* Badge reason */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700">
            <span className="text-base">{badge.icon}</span>
            <p className={`text-xs leading-relaxed ${badge.color}`}>{entry.badgeReason}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// STREAMING PROGRESS
// ══════════════════════════════════════════════════════════════════════

function StreamingDots({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-amber-400">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full bg-amber-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span>KI analysiert... {count > 0 ? `${count} Einträge` : ''}</span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════════

export default function ChartLeaderPage() {
  const [cachedData, setCachedData] = useState<LeaderboardResponse | null>(null)
  const [lastStreamData, setLastStreamData] = useState<LeaderboardResponse | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'shame'>('leaderboard')

  const { object: streamingData, isLoading: isAnalyzing, submit: runAnalysis } = useObject({
    api: '/chart-leader/api/leaderboard',
    schema: LeaderboardResponseSchema,
  })

  useEffect(() => {
    if (streamingData?.leaderboard && streamingData.leaderboard.length > 0) {
      setLastStreamData(streamingData as LeaderboardResponse)
    }
  }, [streamingData])

  useEffect(() => {
    if (!isAnalyzing && lastStreamData?.leaderboard?.length) {
      setFetchedAt(new Date().toISOString())
      setIsCached(false)
      setIsStale(false)
    }
  }, [isAnalyzing, lastStreamData])

  const activeData: LeaderboardResponse | null = useMemo(() => {
    return lastStreamData ?? cachedData
  }, [lastStreamData, cachedData])

  const validEntries = useMemo(() => {
    if (!activeData?.leaderboard) return []
    return activeData.leaderboard.filter(
      (e): e is LeaderboardEntry =>
        e !== undefined &&
        typeof e.rank === 'number' &&
        typeof e.username === 'string' &&
        typeof e.score === 'number'
    )
  }, [activeData])

  const loadCache = useCallback(async () => {
    setIsInitialLoading(true)
    try {
      const res = await fetch('/chart-leader/api/leaderboard')
      console.log('[LEADERBOARD UI] GET status:', res.status)
      if (!res.ok) return
      const data = await res.json()
      console.log('[LEADERBOARD UI] Response keys:', Object.keys(data), 'cached:', data.cached, 'leaderboard length:', data.leaderboard?.length ?? 'null')
      const { cached: isCachedResult, stale: isStaleResult, fetchedAt: ft, ...leaderboardData } = data
      if (leaderboardData.leaderboard?.length > 0) {
        console.log('[LEADERBOARD UI] Loading cached data with', leaderboardData.leaderboard.length, 'entries')
        setCachedData(leaderboardData as LeaderboardResponse)
        setIsCached(!!isCachedResult)
        setIsStale(isStaleResult ?? false)
        setFetchedAt(ft ?? null)
      } else {
        console.warn('[LEADERBOARD UI] No leaderboard in response. leaderboardData keys:', Object.keys(leaderboardData))
      }
    } catch (err) {
      console.error('[LEADERBOARD UI] loadCache error:', err)
    }
    finally {
      setIsInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCache()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    setLastStreamData(null)
    runAnalysis({})
  }

  const streamingCount = streamingData?.leaderboard?.length ?? 0
  const weekSummary = activeData?.weekSummary
  const trendUp = (weekSummary?.changePercent ?? 0) >= 0

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="fixed inset-0 bg-gradient-to-br from-amber-900/5 via-zinc-950 to-zinc-950 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-black text-lg bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                  Trader Leaderboard
                </h1>
                <p className="text-[10px] text-zinc-500">Wer hatte Recht? 7-Tage-Ranking</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/chart-timeline" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors">
                <TrendingUp className="w-3.5 h-3.5" /> Chart
              </Link>
              <Link href="/chart-timeline/sentiment" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors">
                <BarChart2 className="w-3.5 h-3.5" /> Sentiment
              </Link>
              <Link href="/prediction" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 transition-colors">
                <Brain className="w-3.5 h-3.5" /> Prediction
              </Link>
              <ThemeSwitcher />
            </div>
          </div>
        </header>

        {/* Controls strip */}
        <div className="border-b border-zinc-800 bg-zinc-900/50">
          <div className="max-w-3xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              {isCached && !isAnalyzing && (
                <span className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                  <Database className="w-3 h-3" />
                  {isStale ? 'Veraltet' : 'Cached'}
                </span>
              )}
              {fetchedAt && !isAnalyzing && (
                <span className="flex items-center gap-1 text-zinc-500">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(fetchedAt)}
                </span>
              )}
              {activeData?.dataRange && (
                <span className="hidden sm:flex items-center gap-1 text-zinc-500">
                  <Target className="w-3 h-3" />
                  {activeData.dataRange.totalMessages?.toLocaleString()} Nachrichten • {activeData.dataRange.uniqueTraders} Trader
                </span>
              )}
              {activeData?.dataRange?.from && activeData?.dataRange?.to && (
                <span className="hidden sm:flex items-center gap-1 text-zinc-500">
                  <Clock className="w-3 h-3" />
                  {new Date(activeData.dataRange.from).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                  {' – '}
                  {new Date(activeData.dataRange.to).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                </span>
              )}
              {isAnalyzing && <StreamingDots count={streamingCount} />}
            </div>

            <button
              onClick={handleRefresh}
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-600/20 text-amber-400 border border-amber-600/30 hover:bg-amber-600/30 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
              {isAnalyzing ? 'Analysiere...' : 'Neu analysieren'}
            </button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

          {/* Week Summary Banner */}
          {weekSummary && (
            <div className={`relative overflow-hidden rounded-2xl border p-5 md:p-6 ${
              trendUp ? 'bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-900 border-emerald-500/30' : 'bg-gradient-to-br from-red-500/10 via-zinc-900 to-zinc-900 border-red-500/30'
            }`}>
              <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: trendUp ? '#10b981' : '#ef4444' }} />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border ${
                    trendUp ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-red-500/20 border-red-500/40 text-red-400'
                  }`}>
                    <Sparkles className="w-3 h-3" />
                    7-Tage Zusammenfassung
                  </span>
                </div>
                <h2 className="font-black text-xl md:text-2xl leading-tight mb-1">{weekSummary.headline}</h2>
                <p className="text-sm text-zinc-400 mb-4">{weekSummary.subheadline}</p>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50">
                    <span className="text-zinc-500 text-xs">BTC:</span>
                    <span className="font-mono font-bold">${weekSummary.startPrice?.toLocaleString()}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="font-mono font-bold">${weekSummary.endPrice?.toLocaleString()}</span>
                    <span className={`font-black font-mono ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(weekSummary.changePercent ?? 0) > 0 ? '+' : ''}{weekSummary.changePercent?.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-emerald-400" />
                      <span className="font-bold text-emerald-400">@{weekSummary.topWinner}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Skull className="w-3 h-3 text-red-400" />
                      <span className="font-bold text-red-400">@{weekSummary.topLoser}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Podium (Rate-Chart style) */}
          {validEntries.length >= 3 && activeTab === 'leaderboard' && (
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-zinc-900 to-zinc-900 p-6">
              <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />
              <div className="relative flex items-end justify-center gap-3 md:gap-6">
                {/* 2nd */}
                {validEntries[1] && (
                  <div className="flex flex-col items-center gap-2 pb-2">
                    <UserAvatar
                      username={validEntries[1].username}
                      size="lg"
                      className="border-2 border-zinc-400/60 ring-2 ring-zinc-400/20 shadow-lg"
                    />
                    <div className="text-center">
                      <div className="text-2xl">🥈</div>
                      <div className="text-xs font-semibold text-zinc-300 max-w-[80px] truncate">{validEntries[1].username}</div>
                      <div className={`text-lg font-black tabular-nums ${
                        validEntries[1].score >= 75 ? 'text-emerald-400' : validEntries[1].score >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>{validEntries[1].score}</div>
                    </div>
                    <div className="h-16 w-14 md:w-20 bg-zinc-400/10 border border-zinc-400/20 rounded-t-lg flex items-center justify-center">
                      <span className="text-zinc-400 font-black text-xl">2</span>
                    </div>
                  </div>
                )}

                {/* 1st */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <div className="absolute -inset-1 rounded-full bg-amber-500/30 blur-md animate-pulse" />
                    <UserAvatar
                      username={validEntries[0].username}
                      size="xl"
                      className="relative border-2 border-amber-400/80 ring-2 ring-amber-400/30 shadow-xl shadow-amber-500/20"
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-3xl">🥇</div>
                    <div className="text-sm font-black text-amber-300 max-w-[100px] truncate">{validEntries[0].username}</div>
                    <div className={`text-2xl font-black tabular-nums ${
                      validEntries[0].score >= 75 ? 'text-emerald-400' : validEntries[0].score >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>{validEntries[0].score}</div>
                  </div>
                  <div className="h-24 w-14 md:w-20 bg-amber-500/10 border border-amber-500/30 rounded-t-lg flex items-center justify-center">
                    <span className="text-amber-400 font-black text-2xl">1</span>
                  </div>
                </div>

                {/* 3rd */}
                {validEntries[2] && (
                  <div className="flex flex-col items-center gap-2 pb-4">
                    <UserAvatar
                      username={validEntries[2].username}
                      size="lg"
                      className="border-2 border-orange-700/60 ring-2 ring-orange-700/20 shadow-lg"
                    />
                    <div className="text-center">
                      <div className="text-xl">🥉</div>
                      <div className="text-xs font-semibold text-orange-300/80 max-w-[80px] truncate">{validEntries[2].username}</div>
                      <div className={`text-lg font-black tabular-nums ${
                        validEntries[2].score >= 75 ? 'text-emerald-400' : validEntries[2].score >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>{validEntries[2].score}</div>
                    </div>
                    <div className="h-10 w-14 md:w-20 bg-orange-700/10 border border-orange-700/20 rounded-t-lg flex items-center justify-center">
                      <span className="text-orange-500/70 font-black text-lg">3</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          {validEntries.length > 0 && (
            <div className="flex items-center gap-1 bg-zinc-900/60 rounded-lg p-1 border border-zinc-800 w-fit">
              <button
                onClick={() => setActiveTab('leaderboard')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded transition-all ${
                  activeTab === 'leaderboard'
                    ? 'bg-amber-600/20 text-amber-400 border border-amber-600/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Trophy className="w-4 h-4" />
                Leaderboard
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{validEntries.length}</span>
              </button>
              <button
                onClick={() => setActiveTab('shame')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded transition-all ${
                  activeTab === 'shame'
                    ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Skull className="w-4 h-4" />
                Hall of Shame
                {activeData?.hallOfShame?.length ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{activeData.hallOfShame.length}</span>
                ) : null}
              </button>
            </div>
          )}

          {/* Loading */}
          {isInitialLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[72px] rounded-xl bg-zinc-900/50 border border-zinc-800 animate-pulse" />
              ))}
            </div>
          )}

          {/* Analyzing spinner */}
          {isAnalyzing && validEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm text-zinc-400">KI wertet Calls aus...</p>
                <p className="text-xs text-zinc-600 mt-1">Prüft jeden Trade-Call gegen den Preisverlauf</p>
              </div>
            </div>
          )}

          {/* No data */}
          {!isInitialLoading && !isAnalyzing && validEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 border border-dashed border-zinc-700 rounded-2xl bg-zinc-800/20">
              <div className="text-6xl mb-2">📊</div>
              <div className="text-center">
                <p className="text-xl font-bold mb-1">Noch kein Leaderboard</p>
                <p className="text-sm text-zinc-500">Klick unten um die KI-Analyse zu starten</p>
              </div>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 text-sm rounded-lg bg-amber-600/20 text-amber-400 border border-amber-600/30 hover:bg-amber-600/30 transition-all"
              >
                <Flame className="w-4 h-4 inline mr-1" />
                Leaderboard generieren
              </button>
            </div>
          )}

          {/* Leaderboard list */}
          {activeTab === 'leaderboard' && validEntries.length > 0 && (
            <div className="space-y-2">
              {validEntries.map((entry, index) => (
                <LeaderboardRow
                  key={entry.username}
                  entry={entry}
                  index={index}
                  isExpanded={expandedId === entry.username}
                  onToggle={() => setExpandedId(expandedId === entry.username ? null : entry.username)}
                />
              ))}

              {isAnalyzing && validEntries.length > 0 && (
                <div className="h-16 rounded-xl bg-zinc-900/30 border border-dashed border-zinc-700 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    Weitere Einträge werden analysiert...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hall of Shame */}
          {activeTab === 'shame' && (
            <div className="space-y-2">
              {activeData?.hallOfShame?.filter(e => e !== undefined).map((entry, i) => (
                <div key={i} className="p-3 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/5 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="w-10 text-center flex-shrink-0">
                      <Skull className="w-5 h-5 text-red-400 mx-auto" />
                    </div>
                    <UserAvatar
                      username={entry.username}
                      size="md"
                      className="border-2 border-red-500/40 ring-1 ring-red-500/20 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm text-red-300">{entry.username}</span>
                      <p className="text-xs italic text-zinc-400 truncate">&bdquo;{entry.worstQuote}&ldquo;</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono font-bold text-sm text-amber-400">${entry.priceAtCall.toLocaleString()}</div>
                      <div className="text-xs text-red-400">{entry.outcome}</div>
                    </div>
                  </div>
                </div>
              ))}
              {(!activeData?.hallOfShame || activeData.hallOfShame.length === 0) && (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  Keine Fehlcalls gefunden
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-800 py-4 mt-8">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <p className="text-[10px] text-zinc-600">
              Financial Retarded Times • Trader Leaderboard • Calls werden gegen BTC-Preisverlauf ausgewertet
            </p>
          </div>
        </footer>
      </div>
    </main>
  )
}
