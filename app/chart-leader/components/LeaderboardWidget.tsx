'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Trophy,
  Skull,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import Link from 'next/link'
import { UserAvatar } from './UserAvatar'

interface CallHistoryItem {
  quote: string
  direction: 'bullish' | 'bearish' | 'neutral'
  wasCorrect: boolean
  priceAtCall: number
  timestamp: string
  priceContext: string
}

interface LeaderboardEntry {
  rank: number
  username: string
  score: number
  correctCalls: number
  wrongCalls: number
  totalCalls: number
  winRate: number
  bestCall: {
    quote: string
    priceAtCall: number
    priceTarget: number | null
    direction: 'bullish' | 'bearish'
    outcome: string
    timestamp: string
  }
  worstCall?: {
    quote: string
    priceAtCall: number
    outcome: string
    timestamp: string
  }
  callHistory: CallHistoryItem[]
  badge: string
  badgeReason: string
  commentaryText: string
}

interface WeekSummary {
  headline: string
  subheadline: string
  startPrice: number
  endPrice: number
  changePercent: number
  topWinner: string
  topLoser: string
}

interface DataRange {
  from: string
  to: string
  totalMessages: number
  uniqueTraders: number
}

interface HallOfShameEntry {
  username: string
  worstQuote: string
  priceAtCall: number
  outcome: string
  badge: string
}

interface LeaderboardData {
  weekSummary?: WeekSummary
  leaderboard?: LeaderboardEntry[]
  hallOfShame?: HallOfShameEntry[]
  dataRange?: DataRange
  cached?: boolean
  fetchedAt?: string
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
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full border-2 font-black text-base tabular-nums ${color}`}>
      {score}
    </span>
  )
}

function ExpandableRow({
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

  return (
    <div>
      <div
        className={`group p-3 rounded-xl border transition-all cursor-pointer ${
          index === 0 ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/40' :
          index === 1 ? 'bg-gradient-to-r from-zinc-400/10 to-transparent border-zinc-500/40' :
          index === 2 ? 'bg-gradient-to-r from-orange-700/10 to-transparent border-orange-700/40' :
          'bg-card/40 border-primary/10 hover:border-primary/30'
        }`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 text-center flex-shrink-0">
            {index === 0 && <div className="text-xl">🥇</div>}
            {index === 1 && <div className="text-xl">🥈</div>}
            {index === 2 && <div className="text-xl">🥉</div>}
            {index > 2 && <div className="text-base font-black text-muted-foreground">#{index + 1}</div>}
          </div>

          <UserAvatar
            username={entry.username}
            size="md"
            className={`border-2 ring-2 flex-shrink-0 ${
              index === 0 ? 'border-amber-500/50 ring-amber-500/20' :
              index === 1 ? 'border-zinc-400/50 ring-zinc-400/20' :
              index === 2 ? 'border-orange-700/50 ring-orange-700/20' :
              'border-primary/20 ring-transparent'
            }`}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{entry.username}</span>
              <span className={`text-[10px] font-semibold ${badge.color}`}>{badge.icon} {badge.label}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{entry.correctCalls ?? 0}✓ / {entry.wrongCalls ?? 0}✗</span>
              <span>·</span>
              <span className="tabular-nums">{entry.totalCalls} Calls</span>
              {winRate > 0 && (
                <>
                  <span>·</span>
                  <span className={`font-semibold tabular-nums ${
                    winRate >= 70 ? 'text-emerald-400' : winRate >= 50 ? 'text-amber-400' : 'text-red-400'
                  }`}>{Math.round(winRate)}% Win</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <ScoreBadge score={entry.score} />
            <div className="text-muted-foreground">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2 ml-[76px] leading-relaxed line-clamp-1">
          {entry.commentaryText}
        </p>
      </div>

      {isExpanded && (
        <div className="mt-2 ml-12 mr-4 space-y-3">
          {/* Best Call */}
          <div className="p-3 bg-emerald-500/5 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Bester Call</span>
            </div>
            <p className="text-sm italic leading-snug mb-1.5">&bdquo;{entry.bestCall.quote}&ldquo;</p>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">BTC: <span className="font-mono font-bold text-amber-400">${entry.bestCall.priceAtCall.toLocaleString()}</span></span>
              {entry.bestCall.direction === 'bullish'
                ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                : <TrendingDown className="w-3 h-3 text-red-400" />}
              {entry.bestCall.priceTarget && (
                <span className="text-muted-foreground">Ziel: <span className="font-mono text-emerald-400">${entry.bestCall.priceTarget.toLocaleString()}</span></span>
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
                    : 'bg-card/60 border border-primary/10 opacity-70'
                }`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-[10px] font-bold ${call.wasCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                      {call.wasCorrect ? '✅' : '❌'}
                    </span>
                    <span className="text-xs truncate">&bdquo;{call.quote}&ldquo;</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground flex-shrink-0 ml-2">${call.priceAtCall.toLocaleString()}</span>
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
              <p className="text-sm italic leading-snug mb-1">&bdquo;{entry.worstCall.quote}&ldquo;</p>
              <div className="text-xs text-muted-foreground mb-1">
                BTC: <span className="font-mono font-bold text-amber-400">${entry.worstCall.priceAtCall.toLocaleString()}</span>
              </div>
              <p className="text-xs text-red-400 font-medium">✗ {entry.worstCall.outcome}</p>
            </div>
          )}

          {/* Badge reason */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-card/60 border border-primary/10">
            <span className="text-base">{badge.icon}</span>
            <p className={`text-xs leading-relaxed ${badge.color}`}>{entry.badgeReason}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function LeaderboardWidget() {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/chart-leader/api/leaderboard')
      if (res.ok) {
        const json = await res.json()
        if (json.leaderboard?.length > 0) {
          setData(json)
        }
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const entries = useMemo(() => {
    if (!data?.leaderboard) return []
    return data.leaderboard.filter(
      (e): e is LeaderboardEntry =>
        e !== undefined &&
        typeof e.rank === 'number' &&
        typeof e.username === 'string' &&
        typeof e.score === 'number'
    )
  }, [data])

  const visibleEntries = showAll ? entries : entries.slice(0, 5)
  const weekSummary = data?.weekSummary
  const trendUp = (weekSummary?.changePercent ?? 0) >= 0

  const timeAgo = data?.fetchedAt ? (() => {
    const diffMs = Date.now() - new Date(data.fetchedAt!).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    if (diffMins < 1) return 'gerade eben'
    if (diffMins < 60) return `vor ${diffMins}m`
    if (diffHours < 24) return `vor ${diffHours}h`
    return `vor ${Math.floor(diffHours / 24)}d`
  })() : null

  if (isLoading) {
    return (
      <section className="border-t border-primary/10 bg-card/20 relative z-10">
        <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-3 mb-5">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="font-headline text-lg uppercase tracking-wider text-foreground">Trader Leaderboard</h2>
            <div className="flex-1 h-px w-16 bg-gradient-to-r from-amber-400/40 to-transparent" />
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[72px] rounded-xl bg-muted/20 animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (entries.length === 0) return null

  return (
    <section className="border-t border-primary/10 bg-card/20 relative z-10">
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h2 className="font-headline text-lg uppercase tracking-wider text-foreground">
                Trader Leaderboard
              </h2>
            </div>
            <div className="flex-1 h-px w-16 bg-gradient-to-r from-amber-400/40 to-transparent" />
            {data?.dataRange && (
              <span className="text-xs text-muted-foreground/60 hidden sm:block">
                {data.dataRange.uniqueTraders} Trader · {data.dataRange.totalMessages?.toLocaleString()} Nachrichten
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {timeAgo && (
              <span className="text-xs text-muted-foreground/60 font-mono hidden sm:block">
                <Sparkles className="w-3 h-3 inline mr-1 text-amber-400" />
                {timeAgo}
              </span>
            )}
            <Link
              href="/chart-leader"
              className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 transition-colors border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 rounded px-2 py-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Vollbild</span>
            </Link>
          </div>
        </div>

        {/* Week Summary Banner */}
        {weekSummary && (
          <div className={`mb-5 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border ${
            trendUp ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-snug">{weekSummary.headline}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{weekSummary.subheadline}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-muted-foreground">${weekSummary.startPrice?.toLocaleString()}</span>
                <span className="text-muted-foreground/50">→</span>
                <span className="text-muted-foreground">${weekSummary.endPrice?.toLocaleString()}</span>
                <span className={`font-bold ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {trendUp ? '+' : ''}{weekSummary.changePercent?.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] border-l border-primary/10 pl-3">
                <span className="flex items-center gap-0.5">
                  <Trophy className="w-3 h-3 text-emerald-400" />
                  <span className="font-bold text-emerald-400">@{weekSummary.topWinner}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <Skull className="w-3 h-3 text-red-400" />
                  <span className="font-bold text-red-400">@{weekSummary.topLoser}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Podium — matching full page style */}
        {entries.length >= 3 && (
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card p-6 mb-5">
            <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="relative flex items-end justify-center gap-3 md:gap-6">
              {/* 2nd */}
              {entries[1] && (
                <div className="flex flex-col items-center gap-2 pb-2">
                  <UserAvatar
                    username={entries[1].username}
                    size="lg"
                    className="border-2 border-zinc-400/60 ring-2 ring-zinc-400/20 shadow-lg"
                  />
                  <div className="text-center">
                    <div className="text-2xl">🥈</div>
                    <div className="text-xs font-semibold text-muted-foreground max-w-[80px] truncate">{entries[1].username}</div>
                    <div className={`text-lg font-black tabular-nums ${
                      entries[1].score >= 75 ? 'text-emerald-400' : entries[1].score >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>{entries[1].score}</div>
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
                    username={entries[0].username}
                    size="xl"
                    className="relative border-2 border-amber-400/80 ring-2 ring-amber-400/30 shadow-xl shadow-amber-500/20"
                  />
                </div>
                <div className="text-center">
                  <div className="text-3xl">🥇</div>
                  <div className="text-sm font-black text-amber-400 dark:text-amber-300 max-w-[100px] truncate">{entries[0].username}</div>
                  <div className={`text-2xl font-black tabular-nums ${
                    entries[0].score >= 75 ? 'text-emerald-400' : entries[0].score >= 50 ? 'text-amber-400' : 'text-red-400'
                  }`}>{entries[0].score}</div>
                </div>
                <div className="h-24 w-14 md:w-20 bg-amber-500/10 border border-amber-500/30 rounded-t-lg flex items-center justify-center">
                  <span className="text-amber-400 font-black text-2xl">1</span>
                </div>
              </div>

              {/* 3rd */}
              {entries[2] && (
                <div className="flex flex-col items-center gap-2 pb-4">
                  <UserAvatar
                    username={entries[2].username}
                    size="lg"
                    className="border-2 border-orange-700/60 ring-2 ring-orange-700/20 shadow-lg"
                  />
                  <div className="text-center">
                    <div className="text-xl">🥉</div>
                    <div className="text-xs font-semibold text-orange-400/80 max-w-[80px] truncate">{entries[2].username}</div>
                    <div className={`text-lg font-black tabular-nums ${
                      entries[2].score >= 75 ? 'text-emerald-400' : entries[2].score >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>{entries[2].score}</div>
                  </div>
                  <div className="h-10 w-14 md:w-20 bg-orange-700/10 border border-orange-700/20 rounded-t-lg flex items-center justify-center">
                    <span className="text-orange-500/70 font-black text-lg">3</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Expandable Leaderboard rows */}
        <div className="space-y-2">
          {visibleEntries.map((entry, index) => (
            <ExpandableRow
              key={entry.username}
              entry={entry}
              index={index}
              isExpanded={expandedId === entry.username}
              onToggle={() => setExpandedId(expandedId === entry.username ? null : entry.username)}
            />
          ))}
        </div>

        {/* Show more / less */}
        {entries.length > 5 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-primary/10 rounded-lg px-3 py-1.5 bg-card/30 hover:bg-card/60"
            >
              {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showAll ? 'Weniger anzeigen' : `+ ${entries.length - 5} weitere Trader`}
            </button>
            <Link
              href="/chart-leader"
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 rounded-lg px-3 py-1.5"
            >
              <ExternalLink className="w-3 h-3" />
              Vollbild
            </Link>
          </div>
        )}

        {/* Hall of Shame teaser */}
        {data?.hallOfShame && data.hallOfShame.length > 0 && (
          <div className="mt-5 pt-4 border-t border-primary/10">
            <div className="flex items-center gap-2 mb-3">
              <Skull className="w-4 h-4 text-red-400" />
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Hall of Shame</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.hallOfShame.filter(e => e !== undefined).slice(0, 3).map((entry, i) => (
                <div key={i} className="p-2.5 rounded-lg border border-red-500/20 bg-red-500/5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <UserAvatar
                      username={entry.username}
                      size="sm"
                      className="border border-red-500/40"
                    />
                    <span className="font-bold text-xs text-red-300">{entry.username}</span>
                  </div>
                  <p className="text-[11px] italic text-muted-foreground line-clamp-2 mb-1">&bdquo;{entry.worstQuote}&ldquo;</p>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-amber-400">${entry.priceAtCall.toLocaleString()}</span>
                    <span className="text-red-400 font-medium">{entry.outcome}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
