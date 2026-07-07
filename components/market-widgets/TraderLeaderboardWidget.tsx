'use client'

/**
 * TraderLeaderboardWidget — the full trader leaderboard as a reusable,
 * newspaper-styled widget: podium, expandable rows, hall of shame and a
 * live streaming regenerate (same endpoint as /chart-leader).
 */

import { experimental_useObject as useObject } from '@ai-sdk/react'
import { Trophy } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { LeaderboardWidget } from '@/app/chart-leader/components'
import { LeaderboardResponseSchema } from '@/app/chart-leader/lib/schema'
import { isOlderThanHours } from './lib'
import { WidgetEmptyState, WidgetFrame } from './WidgetFrame'

type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>

interface LeaderboardState extends Partial<LeaderboardResponse> {
  fetchedAt?: string
}

export function TraderLeaderboardWidget() {
  const [cached, setCached] = useState<LeaderboardState | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [serverStale, setServerStale] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const { object: streaming, isLoading: isGenerating, submit: runAnalysis } = useObject({
    api: '/chart-leader/api/leaderboard',
    schema: LeaderboardResponseSchema
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await fetch('/chart-leader/api/leaderboard')
        if (res.ok) {
          const json = await res.json()
          if (json.cached && Array.isArray(json.leaderboard) && !cancelled) {
            setCached(json as LeaderboardState)
            setFetchedAt(typeof json.fetchedAt === 'string' ? json.fetchedAt : null)
            setServerStale(Boolean(json.stale))
          }
        }
      } catch {
        // leaderboard is optional — empty state renders
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const regenerate = useCallback(() => {
    runAnalysis({})
  }, [runAnalysis])

  // Persist finished stream as the new "cached" state
  useEffect(() => {
    if (!isGenerating && streaming?.leaderboard && streaming.leaderboard.length > 0) {
      setCached(streaming as LeaderboardState)
      setFetchedAt(new Date().toISOString())
      setServerStale(false)
    }
  }, [isGenerating, streaming])

  const active: LeaderboardState | null = useMemo(() => {
    if (isGenerating && streaming?.leaderboard && streaming.leaderboard.length > 0) {
      return streaming as LeaderboardState
    }
    return cached
  }, [isGenerating, streaming, cached])

  // The inner widget expects worstCall as object | null | undefined and
  // fully-formed entries — filter streaming partials defensively.
  type LeaderboardWidgetData = NonNullable<React.ComponentProps<typeof LeaderboardWidget>>['dataOverride']
  const dataOverride: LeaderboardWidgetData = useMemo(() => {
    if (!active?.leaderboard) return null
    return {
      ...active,
      fetchedAt: fetchedAt ?? undefined,
      leaderboard: active.leaderboard.filter(entry =>
        entry && typeof entry.rank === 'number' && typeof entry.username === 'string'
          && typeof entry.score === 'number' && entry.bestCall && typeof entry.bestCall.quote === 'string'
      )
    } as LeaderboardWidgetData
  }, [active, fetchedAt])

  const hasEntries = Boolean(active?.leaderboard && active.leaderboard.length > 0)
  const stale = serverStale || isOlderThanHours(fetchedAt, 24)

  return (
    <WidgetFrame
      icon={Trophy}
      kicker="Ruhmeshalle"
      title="Trader Leaderboard"
      fetchedAt={fetchedAt}
      stale={stale}
      fullscreenHref="/chart-leader"
      onRegenerate={regenerate}
      isGenerating={isGenerating}
      regenerateLabel="Neu bewerten"
      statusText={active?.dataRange
        ? `${active.dataRange.uniqueTraders} Trader · ${active.dataRange.totalMessages?.toLocaleString('de-DE')} Nachrichten`
        : null}
    >
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted/20" />
          ))}
        </div>
      ) : hasEntries ? (
        <LeaderboardWidget
          hideHeader
          dataOverride={dataOverride}
          disableAutoFetch
          isLoadingOverride={false}
        />
      ) : !isGenerating ? (
        <WidgetEmptyState
          icon={Trophy}
          text="Noch kein Leaderboard vorhanden. Jetzt die Trader der letzten 7 Tage bewerten?"
          actionLabel="Bewertung starten"
          onAction={regenerate}
        />
      ) : (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted/20" />
          ))}
        </div>
      )}
    </WidgetFrame>
  )
}
