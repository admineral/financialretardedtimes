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
  Crown,
  Medal,
  Star,
  Flame,
  Target,
  Clock,
  ChevronDown,
  ChevronUp,
  Brain,
  BarChart2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'

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
  winRate: z.number().min(0).max(100),
  bestCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    priceTarget: z.number().nullable(),
    direction: z.enum(['bullish', 'bearish']),
    outcome: z.string(),
    timestamp: z.string(),
  }),
  worstCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    outcome: z.string(),
    timestamp: z.string(),
  }).optional(),
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

const BADGE_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  oracle: { icon: '🔮', label: 'Oracle', color: 'text-violet-400', bg: 'bg-violet-500/20 border-violet-500/40' },
  analyst: { icon: '📊', label: 'Analyst', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/40' },
  gambler: { icon: '🎰', label: 'Gambler', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40' },
  contrarian: { icon: '🔄', label: 'Contrarian', color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/40' },
  degen: { icon: '🦧', label: 'Degen', color: 'text-pink-400', bg: 'bg-pink-500/20 border-pink-500/40' },
  diamond_hands: { icon: '💎', label: 'Diamond Hands', color: 'text-cyan-400', bg: 'bg-cyan-500/20 border-cyan-500/40' },
  top_signal: { icon: '🔔', label: 'Top Signal', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/40' },
  bottom_feeder: { icon: '🦈', label: 'Bottom Feeder', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/40' },
  newbie: { icon: '🐣', label: 'Newbie', color: 'text-zinc-400', bg: 'bg-zinc-500/20 border-zinc-500/40' },
}

function getRankDisplay(rank: number) {
  if (rank === 1) return { icon: <Crown className="w-5 h-5 text-amber-400" />, bg: 'bg-amber-500/10 border-amber-500/30' }
  if (rank === 2) return { icon: <Medal className="w-5 h-5 text-zinc-300" />, bg: 'bg-zinc-500/10 border-zinc-500/30' }
  if (rank === 3) return { icon: <Medal className="w-5 h-5 text-amber-700" />, bg: 'bg-amber-900/20 border-amber-700/30' }
  return { icon: <span className="text-sm font-mono text-zinc-500">#{rank}</span>, bg: 'bg-zinc-900/50 border-zinc-800' }
}

function WinRateBar({ winRate, totalCalls }: { winRate: number; totalCalls: number }) {
  const correct = Math.round((winRate / 100) * totalCalls)
  const wrong = totalCalls - correct

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden flex">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${winRate}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-bold tabular-nums ${
        winRate >= 70 ? 'text-emerald-400' :
        winRate >= 50 ? 'text-amber-400' : 'text-red-400'
      }`}>
        {winRate.toFixed(0)}%
      </span>
      <span className="text-[10px] text-zinc-500 tabular-nums">{correct}✓/{wrong}✗</span>
    </div>
  )
}

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const circumference = 2 * Math.PI * 18
  const strokeDashoffset = circumference - (score / 100) * circumference

  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#27272a" strokeWidth="4" />
        <circle
          cx="22" cy="22" r="18" fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold font-mono" style={{ color }}>{score}</span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// LEADERBOARD ENTRY CARD
// ══════════════════════════════════════════════════════════════════════

function LeaderboardCard({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: LeaderboardEntry
  isExpanded: boolean
  onToggle: () => void
}) {
  const { icon: rankIcon, bg: rankBg } = getRankDisplay(entry.rank)
  const badge = BADGE_CONFIG[entry.badge] || BADGE_CONFIG.newbie

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all duration-200 ${rankBg} ${
        isExpanded ? 'shadow-lg' : 'hover:border-zinc-700'
      }`}
    >
      {/* Main Row */}
      <button
        className="w-full text-left p-4"
        onClick={onToggle}
      >
        <div className="flex items-start gap-4">
          {/* Rank + Score */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 flex items-center justify-center">
              {rankIcon}
            </div>
            <ScoreCircle score={entry.score} />
          </div>

          {/* User Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-base">@{entry.username}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${badge.bg} ${badge.color}`}>
                {badge.icon} {badge.label}
              </span>
            </div>

            {/* Win Rate Bar */}
            <WinRateBar winRate={entry.winRate} totalCalls={entry.totalCalls} />

            {/* Commentary */}
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              {entry.commentaryText}
            </p>
          </div>

          {/* Expand Icon */}
          <div className="flex-shrink-0 text-zinc-500">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* Expanded Detail */}
      {isExpanded && (
        <div className="border-t border-zinc-800 px-4 pb-4 pt-3 space-y-4">
          {/* Best Call */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Bester Call
              </span>
              <span className="text-[10px] text-zinc-500">
                {new Date(entry.bestCall.timestamp).toLocaleDateString('de-DE', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
              <p className="text-sm italic text-zinc-200">„{entry.bestCall.quote}"</p>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-zinc-500">BTC: <span className="font-mono text-amber-400">${entry.bestCall.priceAtCall.toLocaleString()}</span></span>
                {entry.bestCall.direction === 'bullish'
                  ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                  : <TrendingDown className="w-3 h-3 text-red-400" />}
                {entry.bestCall.priceTarget && (
                  <span className="text-zinc-500">Ziel: <span className="font-mono text-emerald-400">${entry.bestCall.priceTarget.toLocaleString()}</span></span>
                )}
              </div>
              <p className="text-xs text-emerald-400 font-medium">✓ {entry.bestCall.outcome}</p>
            </div>
          </div>

          {/* Call History */}
          {entry.callHistory && entry.callHistory.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Call History
                </span>
              </div>
              <div className="space-y-1.5">
                {entry.callHistory.filter(c => c !== undefined).map((call, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-zinc-900/50 border border-zinc-800">
                    <span className={`w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      call.wasCorrect ? 'bg-emerald-500/30 text-emerald-400' : 'bg-red-500/30 text-red-400'
                    }`}>
                      {call.wasCorrect ? '✓' : '✗'}
                    </span>
                    <span className="text-zinc-300 flex-1 truncate">„{call.quote}"</span>
                    <span className="font-mono text-zinc-500 flex-shrink-0">${call.priceAtCall.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Worst Call */}
          {entry.worstCall && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Skull className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-red-400">
                  Schlechtester Call
                </span>
              </div>
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 space-y-1.5">
                <p className="text-sm italic text-zinc-300">„{entry.worstCall.quote}"</p>
                <div className="text-xs text-zinc-500">
                  BTC: <span className="font-mono text-amber-400">${entry.worstCall.priceAtCall.toLocaleString()}</span>
                </div>
                <p className="text-xs text-red-400 font-medium">✗ {entry.worstCall.outcome}</p>
              </div>
            </div>
          )}

          {/* Badge Reason */}
          <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${badge.bg}`}>
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
// HALL OF SHAME CARD
// ══════════════════════════════════════════════════════════════════════

function ShameCard({ entry }: { entry: LeaderboardResponse['hallOfShame'][0] }) {
  return (
    <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm text-red-300">@{entry.username}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
          {entry.badge}
        </span>
      </div>
      <p className="text-xs italic text-zinc-300">„{entry.worstQuote}"</p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500">BTC: <span className="font-mono text-amber-400">${entry.priceAtCall.toLocaleString()}</span></span>
        <span className="text-red-400">{entry.outcome}</span>
      </div>
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

  // Streaming
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

  // Active data
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
      if (!res.ok) return
      const data = await res.json()
      if (data.cached && data.leaderboard?.length > 0) {
        setCachedData(data as LeaderboardResponse)
        setIsCached(true)
        setIsStale(data.stale ?? false)
        setFetchedAt(data.fetchedAt)
      }
    } catch { /* ignore */ }
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
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                  Trader Leaderboard
                </h1>
                <p className="text-[10px] text-zinc-500">Wer hatte Recht? 7-Tage-Ranking</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/chart-timeline"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
              >
                <TrendingUp className="w-3.5 h-3.5" /> Chart
              </Link>
              <Link
                href="/chart-timeline/sentiment"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors"
              >
                <BarChart2 className="w-3.5 h-3.5" /> Sentiment
              </Link>
              <Link
                href="/prediction"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 transition-colors"
              >
                <Brain className="w-3.5 h-3.5" /> Prediction
              </Link>
              <ThemeSwitcher />
            </div>
          </div>
        </header>

        {/* Controls */}
        <div className="border-b border-zinc-800 bg-zinc-900/50">
          <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
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
                  {activeData.dataRange.totalMessages?.toLocaleString()} Nachrichten •{' '}
                  {activeData.dataRange.uniqueTraders} Trader
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

        <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

          {/* Week Summary Banner */}
          {weekSummary && (
            <div className={`rounded-xl border p-5 ${
              trendUp
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-red-500/5 border-red-500/20'
            }`}>
              <div className="flex items-start gap-4">
                <Sparkles className={`w-6 h-6 flex-shrink-0 mt-0.5 ${trendUp ? 'text-emerald-400' : 'text-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-xl leading-tight">
                    {weekSummary.headline}
                  </h2>
                  <p className="text-sm text-zinc-400 mt-1">{weekSummary.subheadline}</p>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">BTC Woche:</span>
                      <span className="font-mono">
                        ${weekSummary.startPrice?.toLocaleString()}
                        {' → '}
                        ${weekSummary.endPrice?.toLocaleString()}
                      </span>
                      <span className={`font-bold font-mono ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(weekSummary.changePercent ?? 0) > 0 ? '+' : ''}
                        {weekSummary.changePercent?.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <Trophy className="w-3 h-3 text-emerald-400" />
                        <span className="text-zinc-400">Bester:</span>
                        <span className="font-medium text-emerald-400">@{weekSummary.topWinner}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Skull className="w-3 h-3 text-red-400" />
                        <span className="text-zinc-400">Worst:</span>
                        <span className="font-medium text-red-400">@{weekSummary.topLoser}</span>
                      </span>
                    </div>
                  </div>
                </div>
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
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  {validEntries.length}
                </span>
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
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                    {activeData.hallOfShame.length}
                  </span>
                ) : null}
              </button>
            </div>
          )}

          {/* Loading State */}
          {isInitialLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-zinc-900/50 border border-zinc-800 animate-pulse" />
              ))}
            </div>
          )}

          {/* Streaming / analyzing skeletons */}
          {isAnalyzing && validEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm text-zinc-400">KI wertet Calls aus...</p>
                <p className="text-xs text-zinc-600 mt-1">Prüft jeden Trade-Call gegen den Preisverlauf</p>
              </div>
            </div>
          )}

          {/* No data state */}
          {!isInitialLoading && !isAnalyzing && validEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 border border-dashed border-zinc-700 rounded-xl">
              <Trophy className="w-10 h-10 text-zinc-600" />
              <div className="text-center">
                <p className="text-sm text-zinc-400">Noch kein Leaderboard</p>
                <p className="text-xs text-zinc-600 mt-1">Klick auf „Neu analysieren" um zu starten</p>
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

          {/* Leaderboard Tab */}
          {activeTab === 'leaderboard' && validEntries.length > 0 && (
            <div className="space-y-3">
              {/* Top 3 podium stats */}
              {validEntries.length >= 3 && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[validEntries[1], validEntries[0], validEntries[2]].map((entry, idx) => {
                    if (!entry) return null
                    const podiumPos = [2, 1, 3][idx]
                    const heights = ['h-20', 'h-24', 'h-16']
                    const badge = BADGE_CONFIG[entry.badge] || BADGE_CONFIG.newbie
                    return (
                      <div key={entry.username} className={`flex flex-col items-center gap-2 ${idx === 1 ? 'order-2' : idx === 0 ? 'order-1' : 'order-3'}`}>
                        <div className="text-center">
                          <span className={`text-xs font-bold ${badge.color}`}>{badge.icon}</span>
                          <p className="text-xs font-bold truncate max-w-[80px]">@{entry.username}</p>
                          <p className={`text-lg font-bold font-mono ${
                            entry.score >= 75 ? 'text-emerald-400' :
                            entry.score >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>{entry.score}</p>
                        </div>
                        <div className={`w-full rounded-t-lg flex items-end justify-center pb-2 ${heights[idx]} ${
                          podiumPos === 1 ? 'bg-amber-500/20 border border-amber-500/30' :
                          podiumPos === 2 ? 'bg-zinc-500/20 border border-zinc-500/30' :
                          'bg-amber-800/20 border border-amber-800/30'
                        }`}>
                          <span className="text-2xl">
                            {podiumPos === 1 ? '🥇' : podiumPos === 2 ? '🥈' : '🥉'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Full List */}
              {validEntries.map((entry) => (
                <LeaderboardCard
                  key={entry.username}
                  entry={entry}
                  isExpanded={expandedId === entry.username}
                  onToggle={() => setExpandedId(expandedId === entry.username ? null : entry.username)}
                />
              ))}

              {/* Still streaming indicator */}
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

          {/* Hall of Shame Tab */}
          {activeTab === 'shame' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-red-400 font-bold mb-2">
                <Skull className="w-4 h-4" />
                Hall of Shame – Die spektakulärsten Fehlcalls
              </div>
              {activeData?.hallOfShame?.filter(e => e !== undefined).map((entry, i) => (
                <ShameCard key={i} entry={entry} />
              ))}
              {(!activeData?.hallOfShame || activeData.hallOfShame.length === 0) && (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  Keine Fehlcalls gefunden – alle lagen diese Woche richtig? 😅
                </div>
              )}
            </div>
          )}

          {/* Badge Legend */}
          {validEntries.length > 0 && (
            <div className="border border-zinc-800 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
                <Star className="w-3.5 h-3.5" /> Badge-Erklärungen
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(BADGE_CONFIG).map(([key, cfg]) => (
                  <div key={key} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${cfg.bg}`}>
                    <span>{cfg.icon}</span>
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-800 py-4 mt-8">
          <div className="max-w-5xl mx-auto px-4 text-center">
            <p className="text-[10px] text-zinc-600">
              Financial Retarded Times • Trader Leaderboard • Calls werden gegen BTC-Preisverlauf ausgewertet
            </p>
          </div>
        </footer>
      </div>
    </main>
  )
}
