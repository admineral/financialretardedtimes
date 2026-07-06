'use client'

/**
 * V2IssueProvider.tsx (Newspaper v2)
 *
 * Orchestrates the monthly issue lifecycle:
 * 1. Load cached issue (GET issue). Fresh -> done.
 * 2. Otherwise: backfill stage-1 digests in batches (POST digests, looped,
 *    with visible progress), fetch the deterministic data payload, then
 *    stream the stage-2 generation (POST generate via useObject).
 * 3. After the stream finishes the server has cached the composed issue
 *    (with resolved chat excerpts) — reload it.
 */

import { experimental_useObject as useObject } from '@ai-sdk/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  MonthlyIssueAISchema,
  type V2Data,
  type V2Issue,
  type V2ResolvedChatMessage
} from '../lib/types'

export type V2Phase = 'loading' | 'digests' | 'generating' | 'ready' | 'error'

export interface V2DigestProgress {
  covered: number
  total: number
}

/** Loosely-typed partial content while the stream is running. */
export type V2PartialContent = {
  masthead?: { issueTitle?: string; dateline?: string; motto?: string }
  trendingTopics?: (string | undefined)[]
  topContributors?: ({ username?: string; reason?: string } | undefined)[]
  blocks?: unknown[]
  traderLeaderboard?: unknown
}

export interface V2State {
  issue: V2Issue | null
  /** Partial streaming content (takes precedence over issue.content while streaming) */
  streamingContent: V2PartialContent | null
  data: V2Data | null
  chatExcerpts: Record<string, V2ResolvedChatMessage[]>
  phase: V2Phase
  isStreaming: boolean
  digestProgress: V2DigestProgress | null
  error: Error | null
  refresh: () => void
}

const V2Context = createContext<V2State | null>(null)

export function useV2Issue(): V2State {
  const context = useContext(V2Context)
  if (!context) throw new Error('useV2Issue must be used within V2IssueProvider')
  return context
}

export function V2IssueProvider({ children }: { children: (state: V2State) => React.ReactNode }) {
  const [issue, setIssue] = useState<V2Issue | null>(null)
  const [data, setData] = useState<V2Data | null>(null)
  const [phase, setPhase] = useState<V2Phase>('loading')
  const [digestProgress, setDigestProgress] = useState<V2DigestProgress | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const startedRef = useRef(false)
  const generatingRef = useRef(false)

  const {
    object: streamingObject,
    submit,
    isLoading: isStreaming,
    clear
  } = useObject({
    api: '/newspaper/v2/api/generate',
    schema: MonthlyIssueAISchema,
    onFinish: async ({ error: streamError }) => {
      generatingRef.current = false
      if (streamError) {
        console.error('[V2] Stream finished with schema error:', streamError)
      }
      // Server cached the composed issue (with resolved excerpts) — reload it.
      try {
        const response = await fetch('/newspaper/v2/api/issue', { cache: 'no-store' })
        if (response.ok) {
          const result = await response.json()
          setIssue(result.issue as V2Issue)
          setPhase('ready')
          clear()
          return
        }
      } catch (loadError) {
        console.error('[V2] Issue reload after stream failed:', loadError)
      }
      // Keep the streamed content on screen even if the reload failed.
      setPhase('ready')
    },
    onError: (streamError) => {
      generatingRef.current = false
      setError(streamError)
      setPhase('error')
    }
  })

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/newspaper/v2/api/data', { cache: 'no-store' })
      if (response.ok) {
        const result = await response.json()
        setData(result.data as V2Data)
      }
    } catch (dataError) {
      console.error('[V2] Data load failed:', dataError)
    }
  }, [])

  const runDigestBackfill = useCallback(async (): Promise<boolean> => {
    try {
      const statusResponse = await fetch('/newspaper/v2/api/digests', { cache: 'no-store' })
      if (!statusResponse.ok) return true
      const status = await statusResponse.json()
      let missing: string[] = status.missing ?? []
      const total: number = status.days ?? 30

      if (missing.length === 0) return true

      setPhase('digests')
      setDigestProgress({ covered: total - missing.length, total })

      // Loop until covered — each POST processes a small batch server-side.
      for (let i = 0; i < 20 && missing.length > 0; i++) {
        const response = await fetch('/newspaper/v2/api/digests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxPerRun: 4 })
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error || 'Digest-Backfill fehlgeschlagen')
        }
        const result = await response.json()
        missing = result.remaining ?? []
        setDigestProgress({ covered: total - missing.length, total })
        if (result.done) break
        if ((result.generated ?? []).length === 0 && missing.length > 0) {
          // No progress — avoid an infinite loop.
          console.warn('[V2] Digest backfill stalled, continuing with partial coverage')
          break
        }
      }

      return true
    } catch (backfillError) {
      console.error('[V2] Digest backfill failed:', backfillError)
      // Continue anyway — generation works with partial digest coverage.
      return true
    }
  }, [])

  const startGeneration = useCallback(async () => {
    if (generatingRef.current) return
    generatingRef.current = true
    setError(null)

    await runDigestBackfill()
    await loadData()

    setPhase('generating')
    setDigestProgress(null)
    submit({})
  }, [loadData, runDigestBackfill, submit])

  const loadIssue = useCallback(async () => {
    setPhase('loading')
    try {
      const response = await fetch('/newspaper/v2/api/issue', { cache: 'no-store' })

      if (response.ok) {
        const result = await response.json()
        const cachedIssue = result.issue as V2Issue
        setIssue(cachedIssue)
        setData(cachedIssue.data)
        if (cachedIssue.meta.isFresh) {
          setPhase('ready')
          return
        }
        // Stale — show the cached issue and regenerate in the background.
        setPhase('ready')
        void startGeneration()
        return
      }

      if (response.status === 404) {
        void startGeneration()
        return
      }

      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || 'Ausgabe konnte nicht geladen werden')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError : new Error('Ausgabe konnte nicht geladen werden'))
      setPhase('error')
    }
  }, [startGeneration])

  const refresh = useCallback(() => {
    if (generatingRef.current) return
    void (async () => {
      try {
        await fetch('/newspaper/v2/api/issue', { method: 'POST' })
      } catch {
        // best effort invalidation
      }
      await startGeneration()
    })()
  }, [startGeneration])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void loadIssue()
  }, [loadIssue])

  const state = useMemo<V2State>(() => ({
    issue,
    streamingContent: isStreaming ? (streamingObject as V2PartialContent | null) : null,
    data: data ?? issue?.data ?? null,
    chatExcerpts: issue?.chatExcerpts ?? {},
    phase,
    isStreaming,
    digestProgress,
    error,
    refresh
  }), [issue, streamingObject, isStreaming, data, phase, digestProgress, error, refresh])

  return <V2Context.Provider value={state}>{children(state)}</V2Context.Provider>
}
