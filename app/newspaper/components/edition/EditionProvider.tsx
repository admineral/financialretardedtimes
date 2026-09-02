'use client'

/**
 * EditionProvider.tsx (Newspaper edition v3 — client state)
 *
 * One provider owns:
 *
 * - All three cached editions (1D/3D/7D) for the selected date, loaded in
 *   ONE request → switching ranges or archive days is instant, never a
 *   regeneration. `selectedDate="latest"` asks the read API for the newest
 *   cached paper and reports the resolved date back via onDateResolved, so
 *   first paint needs exactly one edition request.
 * - The noon-freshness decision comes from the server (read API). Stale
 *   editions are shown immediately while a mega generation prints fresh
 *   content.
 * - Two print modes. `stream`: the generate route streams the tri-edition
 *   JSON and partial blocks of the ACTIVE range render live. `background`:
 *   the route answers 202 and prints server-side; the page stays calm and
 *   polls the read API until the single-flight lock clears.
 * - Race-free reload: after a print run the provider only accepts a row
 *   whose generation is NEWER than what it had before (see
 *   shouldAcceptIncomingEdition). The lock doubles as the queue: if another
 *   visitor or the cron is already printing, we never start a second run,
 *   we wait for theirs.
 * - Widget single-mode refreshes patch state from the widget route's
 *   response.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { parsePartialJson } from 'ai'
import { shouldAcceptIncomingEdition } from '../../edition/freshness'
import type { EditionWidgetId } from '../../edition/prompt'
import type {
  EditionData,
  EditionCacheInfo,
  EditionDayRange,
  NewspaperEdition,
  TriEditionAI
} from '../../edition/types'

type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> }
export type PartialTriEdition = DeepPartial<TriEditionAI>

export type GenerationMode = 'stream' | 'background'

/** Sentinel accepted by `selectedDate`: load the newest cached paper. */
export const LATEST_EDITION = 'latest'

interface EditionApiPayload {
  cached: boolean
  edition: NewspaperEdition | null
  cacheInfo: EditionCacheInfo | null
  freshness: { isFresh: boolean; reason: string } | null
  legacy: boolean
}

interface EditionApiResponse extends EditionApiPayload {
  editions?: Partial<Record<EditionDayRange, EditionApiPayload>>
  lockActive?: boolean
  /** Resolved Berlin date key of the returned rows (null when nothing is cached). */
  date?: string | null
  today?: string
}

interface EditionDataResponse {
  data?: EditionData
}

export interface EditionState {
  /** The edition for the active dayRange (cached or just streamed). */
  edition: NewspaperEdition | null
  /** All loaded ranges for the selected date. */
  editions: Partial<Record<EditionDayRange, NewspaperEdition>>
  /** Berlin date key the loaded editions belong to. */
  date: string | null
  cacheInfo: EditionCacheInfo | null
  freshnessReason: string | null
  isLegacy: boolean
  isLoading: boolean
  /** A stream-mode print run is rendering live into the page. */
  isStreaming: boolean
  /** A print run is happening somewhere (background mode, cron, or another visitor). */
  isPrinting: boolean
  /** Live partial object while the mega call streams. */
  streamingObject: PartialTriEdition | null
  refreshingWidget: EditionWidgetId | null
  error: string | null
  generationMode: GenerationMode
  generate: () => Promise<void>
  refreshWidget: (widgetId: EditionWidgetId) => Promise<void>
}

const EditionContext = createContext<EditionState | null>(null)

export function useEdition(): EditionState {
  const context = useContext(EditionContext)
  if (!context) throw new Error('useEdition must be used inside EditionProvider')
  return context
}

function editionKeyForRange(dayRange: EditionDayRange): keyof TriEditionAI {
  return dayRange === 1 ? 'edition1d' : dayRange === 3 ? 'edition3d' : 'edition7d'
}

export function streamingContentForRange(
  object: PartialTriEdition | null,
  dayRange: EditionDayRange
): DeepPartial<TriEditionAI['edition1d']> | null {
  if (!object) return null
  const content = object[editionKeyForRange(dayRange)]
  return (content as DeepPartial<TriEditionAI['edition1d']> | undefined) ?? null
}

const RANGES: EditionDayRange[] = [1, 3, 7]

/** The 1D row is representative: all ranges of a mega generation share one generation_id. */
function representative(payload: EditionApiResponse | null): EditionApiPayload | undefined {
  return payload?.editions?.[1] ?? payload?.editions?.[3] ?? payload?.editions?.[7]
}

interface PollOptions {
  /** Upper bound on polls. */
  attempts: number
  /** Delay before each poll in ms. */
  delayMs: number
  /** Stop early once the server lock is gone and no newer row appeared. */
  followLock: boolean
}

/** Short poll after a stream: rows land within seconds of the stream ending. */
const AFTER_STREAM_POLL: PollOptions = { attempts: 10, delayMs: 1500, followLock: false }
/** Long poll for background prints and other people's runs: up to ~10 minutes. */
const BACKGROUND_POLL: PollOptions = { attempts: 120, delayMs: 5000, followLock: true }

export function EditionProvider({
  selectedDate,
  dayRange,
  generationMode = 'stream',
  onDateResolved,
  children
}: {
  /** Berlin date key, `LATEST_EDITION`, or null while the page has no date yet. */
  selectedDate: string | null
  dayRange: EditionDayRange
  generationMode?: GenerationMode
  /** Fired after a `latest` load with the resolved date (null when nothing is cached) and Berlin today. */
  onDateResolved?: (resolved: string | null, today: string) => void
  children: (state: EditionState) => React.ReactNode
}) {
  const [editions, setEditions] = useState<Partial<Record<EditionDayRange, NewspaperEdition>>>({})
  const [cacheInfos, setCacheInfos] = useState<Partial<Record<EditionDayRange, EditionCacheInfo | null>>>({})
  const [freshnessReason, setFreshnessReason] = useState<string | null>(null)
  const [legacyFlags, setLegacyFlags] = useState<Partial<Record<EditionDayRange, boolean>>>({})
  const [loadedDate, setLoadedDate] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [streamingObject, setStreamingObject] = useState<PartialTriEdition | null>(null)
  const [refreshingWidget, setRefreshingWidget] = useState<EditionWidgetId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadedDateRef = useRef<string | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const autoGenerateTriggeredRef = useRef<string | null>(null)
  const generateRef = useRef<() => Promise<void>>(async () => {})
  const onDateResolvedRef = useRef(onDateResolved)
  onDateResolvedRef.current = onDateResolved

  /** Concrete date the provider works on (selectedDate unless it is the `latest` sentinel). */
  const activeDate = selectedDate === LATEST_EDITION ? loadedDate : selectedDate

  const applyPayloads = useCallback((payloads: Partial<Record<EditionDayRange, EditionApiPayload>>) => {
    setEditions(prev => {
      const next = { ...prev }
      for (const key of RANGES) {
        const payload = payloads[key]
        if (payload?.edition) next[key] = payload.edition
        else if (payload && !payload.cached) delete next[key]
      }
      return next
    })
    setCacheInfos(prev => {
      const next = { ...prev }
      for (const key of RANGES) {
        const payload = payloads[key]
        if (payload) next[key] = payload.cacheInfo
      }
      return next
    })
    setLegacyFlags(prev => {
      const next = { ...prev }
      for (const key of RANGES) {
        const payload = payloads[key]
        if (payload) next[key] = payload.legacy
      }
      return next
    })
  }, [])

  const hydrateDeterministicData = useCallback(async (
    date: string,
    payloads: Partial<Record<EditionDayRange, EditionApiPayload>>
  ) => {
    const hasHydratableEdition = RANGES.some(key => {
      const payload = payloads[key]
      return Boolean(payload?.edition && !payload.legacy)
    })
    if (!hasHydratableEdition) return

    try {
      const response = await fetch(`/newspaper/api/edition/data?date=${date}`, { cache: 'no-store' })
      if (!response.ok) return

      const payload: EditionDataResponse = await response.json()
      if (!payload.data || loadedDateRef.current !== date) return
      const data = payload.data

      setEditions(prev => {
        const next = { ...prev }
        for (const key of RANGES) {
          const edition = next[key]
          const loadedPayload = payloads[key]
          if (edition && loadedPayload?.edition && !loadedPayload.legacy) {
            next[key] = { ...edition, data }
          }
        }
        return next
      })
    } catch (err) {
      console.warn('[EDITION-PROVIDER] Deterministic data refresh failed:', err)
    }
  }, [])

  /**
   * Loads all three ranges for a date (or the newest cached paper) in one
   * round-trip. Independent of dayRange on purpose: range switches must
   * never hit the network.
   */
  const loadDate = useCallback(async (dateOrLatest: string): Promise<EditionApiResponse | null> => {
    try {
      const response = await fetch(`/newspaper/api/edition?date=${dateOrLatest}&range=1&all=1`, { cache: 'no-store' })
      if (!response.ok && response.status !== 404) {
        throw new Error(`Edition read failed (${response.status})`)
      }
      const payload: EditionApiResponse = await response.json()
      const resolved = payload.date ?? (dateOrLatest === LATEST_EDITION ? null : dateOrLatest)

      loadedDateRef.current = resolved
      setLoadedDate(resolved)
      if (payload.editions && resolved) {
        applyPayloads(payload.editions)
        void hydrateDeterministicData(resolved, payload.editions)
      }
      setFreshnessReason(payload.freshness?.reason ?? null)
      return payload
    } catch (err) {
      console.error('[EDITION-PROVIDER] Load failed:', err)
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
      return null
    }
  }, [applyPayloads, hydrateDeterministicData])

  /**
   * Polls the read API until rows from a NEWER generation than `previous`
   * appear (the freshly persisted ones), then accepts them. With
   * `followLock` the poll also gives up once the server lock is released
   * without a newer row (the run failed) instead of waiting out the clock.
   */
  const reloadNewerThan = useCallback(async (
    date: string,
    previous: { generationId: string | null; updatedAt: string | null },
    options: PollOptions = AFTER_STREAM_POLL
  ) => {
    let lockSeen = false
    for (let attempt = 0; attempt < options.attempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, options.delayMs + (options.followLock ? 0 : attempt * 500)))
      if (loadedDateRef.current !== date) return false

      const response = await fetch(`/newspaper/api/edition?date=${date}&range=1&all=1`, { cache: 'no-store' })
      if (!response.ok && response.status !== 404) continue

      const payload: EditionApiResponse = await response.json()
      const active = representative(payload)
      if (
        active?.cacheInfo &&
        shouldAcceptIncomingEdition(previous, {
          generationId: active.cacheInfo.generationId,
          updatedAt: active.cacheInfo.updatedAt
        }) &&
        active.cacheInfo.generationId !== previous.generationId
      ) {
        if (payload.editions) {
          applyPayloads(payload.editions)
          void hydrateDeterministicData(date, payload.editions)
        }
        setFreshnessReason(payload.freshness?.reason ?? null)
        return true
      }

      if (options.followLock) {
        if (payload.lockActive) lockSeen = true
        // Lock released (or never observed after a few tries) and still no
        // newer row: the print run is over without output. Stop waiting.
        else if (lockSeen || attempt >= 2) break
      }
    }
    console.warn('[EDITION-PROVIDER] No newer generation appeared; keeping current state')
    return false
  }, [applyPayloads, hydrateDeterministicData])

  /** Fires the mega generation: live stream or quiet background print. */
  const generate = useCallback(async () => {
    const date = activeDate
    if (!date || isStreaming || isPrinting) return

    const previous = {
      generationId: cacheInfos[1]?.generationId ?? cacheInfos[dayRange]?.generationId ?? null,
      updatedAt: cacheInfos[1]?.updatedAt ?? cacheInfos[dayRange]?.updatedAt ?? null
    }

    setError(null)

    if (generationMode === 'background') {
      setIsPrinting(true)
      try {
        const response = await fetch('/newspaper/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anchorDate: date, mode: 'background' })
        })
        // 202 = our run was queued, 409 = someone else is printing already.
        // Either way the lock is the queue: wait for whichever run finishes.
        if (response.status !== 202 && response.status !== 409) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error ?? `Generierung fehlgeschlagen (${response.status})`)
        }
        await reloadNewerThan(date, previous, BACKGROUND_POLL)
      } catch (err) {
        console.error('[EDITION-PROVIDER] Background generation failed:', err)
        setError(err instanceof Error ? err.message : 'Generierung fehlgeschlagen')
      } finally {
        setIsPrinting(false)
      }
      return
    }

    streamAbortRef.current?.abort()
    const abort = new AbortController()
    streamAbortRef.current = abort

    setIsStreaming(true)
    setStreamingObject(null)

    try {
      const response = await fetch('/newspaper/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorDate: date, mode: 'stream' }),
        signal: abort.signal
      })

      if (response.status === 409) {
        // Another visitor/cron is already generating — poll for its result.
        setIsStreaming(false)
        setIsPrinting(true)
        try {
          await reloadNewerThan(date, previous, BACKGROUND_POLL)
        } finally {
          setIsPrinting(false)
        }
        return
      }
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? `Generierung fehlgeschlagen (${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let lastParse = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const now = Date.now()
        if (now - lastParse > 150) {
          lastParse = now
          const { value: parsed } = await parsePartialJson(buffer)
          if (parsed && typeof parsed === 'object') {
            setStreamingObject(parsed as PartialTriEdition)
          }
        }
      }

      const { value: finalParsed } = await parsePartialJson(buffer)
      if (finalParsed && typeof finalParsed === 'object') {
        setStreamingObject(finalParsed as PartialTriEdition)
      }

      // The server persists in its own time; only accept a NEWER row.
      await reloadNewerThan(date, previous, AFTER_STREAM_POLL)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('[EDITION-PROVIDER] Generation failed:', err)
      setError(err instanceof Error ? err.message : 'Generierung fehlgeschlagen')
    } finally {
      if (streamAbortRef.current === abort) {
        setIsStreaming(false)
        setStreamingObject(null)
      }
    }
  }, [activeDate, isStreaming, isPrinting, cacheInfos, dayRange, generationMode, reloadNewerThan])

  generateRef.current = generate

  /** Initial load + noon-rule auto regeneration. Runs once per selected date. */
  useEffect(() => {
    if (!selectedDate) return
    // The `latest` load already resolved to this date: nothing to do. This
    // is what keeps first paint at a single edition request.
    if (selectedDate !== LATEST_EDITION && loadedDateRef.current === selectedDate) return

    let cancelled = false

    const run = async () => {
      loadedDateRef.current = selectedDate
      setEditions({})
      setCacheInfos({})
      setLegacyFlags({})
      setIsLoading(true)

      const payload = await loadDate(selectedDate)
      if (cancelled) return
      setIsLoading(false)

      if (!payload) return

      const today = payload.today ?? null
      const resolved = payload.date ?? (selectedDate === LATEST_EDITION ? null : selectedDate)

      if (selectedDate === LATEST_EDITION) {
        if (today) onDateResolvedRef.current?.(resolved, today)
        // A newest paper that is not today's means a new Berlin day started.
        // The page will select today and this effect prints it; do not
        // regenerate the archived paper we just showed.
        if (!resolved || resolved !== today) return
      }

      if (!resolved) return
      const active = representative(payload)
      const isToday = today === resolved
      const needsGeneration = isToday && (!active?.cached || active.freshness?.isFresh === false || active.legacy)

      if (needsGeneration && !payload.lockActive && autoGenerateTriggeredRef.current !== resolved) {
        autoGenerateTriggeredRef.current = resolved
        void generateRef.current()
      } else if (needsGeneration && payload.lockActive) {
        // Someone else (cron, another reader) is printing; pick up their result.
        setIsPrinting(true)
        try {
          await reloadNewerThan(resolved, {
            generationId: active?.cacheInfo?.generationId ?? null,
            updatedAt: active?.cacheInfo?.updatedAt ?? null
          }, BACKGROUND_POLL)
        } finally {
          if (!cancelled) setIsPrinting(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [selectedDate, loadDate, reloadNewerThan])

  /** Widget single-mode refresh — patches state from the route response. */
  const refreshWidget = useCallback(async (widgetId: EditionWidgetId) => {
    const date = activeDate
    if (!date || refreshingWidget) return
    setRefreshingWidget(widgetId)
    setError(null)

    try {
      const response = await fetch(`/newspaper/api/widget/${widgetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, dayRange })
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? `Widget-Refresh fehlgeschlagen (${response.status})`)
      }

      // Reload all ranges — shared-module widgets patch all three rows.
      await loadDate(date)
    } catch (err) {
      console.error('[EDITION-PROVIDER] Widget refresh failed:', widgetId, err)
      setError(err instanceof Error ? err.message : 'Widget-Refresh fehlgeschlagen')
    } finally {
      setRefreshingWidget(null)
    }
  }, [activeDate, dayRange, refreshingWidget, loadDate])

  const state = useMemo<EditionState>(() => ({
    edition: editions[dayRange] ?? null,
    editions,
    date: loadedDate,
    cacheInfo: cacheInfos[dayRange] ?? null,
    freshnessReason,
    isLegacy: legacyFlags[dayRange] ?? false,
    isLoading,
    isStreaming,
    isPrinting,
    streamingObject,
    refreshingWidget,
    error,
    generationMode,
    generate,
    refreshWidget
  }), [editions, loadedDate, cacheInfos, freshnessReason, legacyFlags, dayRange, isLoading, isStreaming, isPrinting, streamingObject, refreshingWidget, error, generationMode, generate, refreshWidget])

  return <EditionContext.Provider value={state}>{children(state)}</EditionContext.Provider>
}
