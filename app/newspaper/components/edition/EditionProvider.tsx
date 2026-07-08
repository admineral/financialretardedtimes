'use client'

/**
 * EditionProvider.tsx (Newspaper edition v3 — client state)
 *
 * Replaces NewspaperIssueProvider. One provider owns:
 *
 * - All three cached editions (1D/3D/7D) for the selected date, loaded in
 *   ONE request → switching ranges or archive days is instant, never a
 *   regeneration.
 * - The noon-freshness decision comes from the server (read API). Stale
 *   editions are shown immediately while a background mega generation
 *   streams fresh content.
 * - Streaming: the generate route streams the tri-edition JSON; partial
 *   blocks of the ACTIVE range render live.
 * - Race-free reload: after a stream, the provider polls the read API and
 *   only accepts a row whose generation is NEWER than what it had before
 *   the stream started (shouldAcceptIncomingEdition) — the old
 *   "regenerated but didn't save / older row overwrote fresh content"
 *   bug is structurally impossible.
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
  cacheInfo: EditionCacheInfo | null
  freshnessReason: string | null
  isLegacy: boolean
  isLoading: boolean
  isStreaming: boolean
  /** Live partial object while the mega call streams. */
  streamingObject: PartialTriEdition | null
  refreshingWidget: EditionWidgetId | null
  error: string | null
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

export function EditionProvider({
  selectedDate,
  dayRange,
  children
}: {
  selectedDate: string | null
  dayRange: EditionDayRange
  children: (state: EditionState) => React.ReactNode
}) {
  const [editions, setEditions] = useState<Partial<Record<EditionDayRange, NewspaperEdition>>>({})
  const [cacheInfos, setCacheInfos] = useState<Partial<Record<EditionDayRange, EditionCacheInfo | null>>>({})
  const [freshnessReason, setFreshnessReason] = useState<string | null>(null)
  const [legacyFlags, setLegacyFlags] = useState<Partial<Record<EditionDayRange, boolean>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingObject, setStreamingObject] = useState<PartialTriEdition | null>(null)
  const [refreshingWidget, setRefreshingWidget] = useState<EditionWidgetId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadedDateRef = useRef<string | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const autoGenerateTriggeredRef = useRef<string | null>(null)
  const generateRef = useRef<() => Promise<void>>(async () => {})

  const applyPayloads = useCallback((payloads: Partial<Record<EditionDayRange, EditionApiPayload>>) => {
    setEditions(prev => {
      const next = { ...prev }
      for (const key of [1, 3, 7] as EditionDayRange[]) {
        const payload = payloads[key]
        if (payload?.edition) next[key] = payload.edition
        else if (payload && !payload.cached) delete next[key]
      }
      return next
    })
    setCacheInfos(prev => {
      const next = { ...prev }
      for (const key of [1, 3, 7] as EditionDayRange[]) {
        const payload = payloads[key]
        if (payload) next[key] = payload.cacheInfo
      }
      return next
    })
    setLegacyFlags(prev => {
      const next = { ...prev }
      for (const key of [1, 3, 7] as EditionDayRange[]) {
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
    const hasHydratableEdition = ([1, 3, 7] as EditionDayRange[]).some(key => {
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
        for (const key of [1, 3, 7] as EditionDayRange[]) {
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

  /** Loads all three ranges for a date in one round-trip. */
  const loadDate = useCallback(async (date: string): Promise<EditionApiResponse | null> => {
    try {
      const response = await fetch(`/newspaper/api/edition?date=${date}&range=${dayRange}&all=1`, { cache: 'no-store' })
      if (!response.ok && response.status !== 404) {
        throw new Error(`Edition read failed (${response.status})`)
      }
      const payload: EditionApiResponse = await response.json()
      if (payload.editions) {
        applyPayloads(payload.editions)
        void hydrateDeterministicData(date, payload.editions)
      }
      setFreshnessReason(payload.freshness?.reason ?? null)
      return payload
    } catch (err) {
      console.error('[EDITION-PROVIDER] Load failed:', err)
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
      return null
    }
  }, [applyPayloads, dayRange, hydrateDeterministicData])

  /**
   * Polls the read API after a stream until rows from a NEWER generation
   * than `previous` appear (the freshly persisted ones), then accepts them.
   */
  const reloadNewerThan = useCallback(async (
    date: string,
    previous: { generationId: string | null; updatedAt: string | null }
  ) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await fetch(`/newspaper/api/edition?date=${date}&range=${dayRange}&all=1`, { cache: 'no-store' })
      if (response.ok) {
        const payload: EditionApiResponse = await response.json()
        const active = payload.editions?.[dayRange]
        if (
          active?.cacheInfo &&
          shouldAcceptIncomingEdition(previous, {
            generationId: active.cacheInfo.generationId,
            updatedAt: active.cacheInfo.updatedAt
          }) &&
          active.cacheInfo.generationId !== previous.generationId
        ) {
          if (payload.editions) applyPayloads(payload.editions)
          setFreshnessReason(payload.freshness?.reason ?? null)
          return true
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1500 + attempt * 500))
    }
    console.warn('[EDITION-PROVIDER] No newer generation appeared after stream; keeping current state')
    return false
  }, [applyPayloads, dayRange])

  /** Fires the mega generation and streams the active edition live. */
  const generate = useCallback(async () => {
    const date = selectedDate
    if (!date || isStreaming) return

    const previous = {
      generationId: cacheInfos[dayRange]?.generationId ?? null,
      updatedAt: cacheInfos[dayRange]?.updatedAt ?? null
    }

    streamAbortRef.current?.abort()
    const abort = new AbortController()
    streamAbortRef.current = abort

    setIsStreaming(true)
    setStreamingObject(null)
    setError(null)

    try {
      const response = await fetch('/newspaper/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorDate: date }),
        signal: abort.signal
      })

      if (response.status === 409) {
        // Another visitor/cron is already generating — poll for its result.
        await reloadNewerThan(date, previous)
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
      await reloadNewerThan(date, previous)
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
  }, [selectedDate, isStreaming, cacheInfos, dayRange, reloadNewerThan])

  generateRef.current = generate

  /** Initial load + noon-rule auto regeneration. */
  useEffect(() => {
    if (!selectedDate) return
    let cancelled = false

    const run = async () => {
      const isNewDate = loadedDateRef.current !== selectedDate
      if (isNewDate) {
        loadedDateRef.current = selectedDate
        setEditions({})
        setCacheInfos({})
        setLegacyFlags({})
        setIsLoading(true)
      }

      const payload = await loadDate(selectedDate)
      if (cancelled) return
      setIsLoading(false)

      if (!payload) return

      const active = payload.editions?.[dayRange]
      const isToday = payload.today === selectedDate
      const needsGeneration = isToday && (!active?.cached || active.freshness?.isFresh === false || active.legacy)

      if (needsGeneration && !payload.lockActive && autoGenerateTriggeredRef.current !== selectedDate) {
        autoGenerateTriggeredRef.current = selectedDate
        void generateRef.current()
      } else if (needsGeneration && payload.lockActive) {
        // Someone else is generating; pick up their result when it lands.
        void reloadNewerThan(selectedDate, {
          generationId: active?.cacheInfo?.generationId ?? null,
          updatedAt: active?.cacheInfo?.updatedAt ?? null
        })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [selectedDate, dayRange, loadDate, reloadNewerThan])

  /** Widget single-mode refresh — patches state from the route response. */
  const refreshWidget = useCallback(async (widgetId: EditionWidgetId) => {
    const date = selectedDate
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
  }, [selectedDate, dayRange, refreshingWidget, loadDate])

  const state = useMemo<EditionState>(() => ({
    edition: editions[dayRange] ?? null,
    editions,
    cacheInfo: cacheInfos[dayRange] ?? null,
    freshnessReason,
    isLegacy: legacyFlags[dayRange] ?? false,
    isLoading,
    isStreaming,
    streamingObject,
    refreshingWidget,
    error,
    generate,
    refreshWidget
  }), [editions, cacheInfos, freshnessReason, legacyFlags, dayRange, isLoading, isStreaming, streamingObject, refreshingWidget, error, generate, refreshWidget])

  return <EditionContext.Provider value={state}>{children(state)}</EditionContext.Provider>
}
