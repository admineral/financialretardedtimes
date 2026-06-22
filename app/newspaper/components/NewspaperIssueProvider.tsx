'use client'

import { experimental_useObject as useObject } from '@ai-sdk/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DailyAIResponseSchema, type ArticleData, type DailyAIResponseData, type NewspaperAIData, type UnifiedNewspaperData } from '../lib/types'
import type { DayRange } from './DateTimeline'
import type {
  NewspaperIssue,
  NewspaperIssueTimelineEvent
} from '../engine'

interface IssueCacheInfo {
  updatedAt: string
  expiresAt: string
  isFresh: boolean
  messageCount: number
  uniqueUsers: number
  dayRange: number
}

interface NewspaperIssueState {
  issue: NewspaperIssue | null
  cacheInfo: IssueCacheInfo | null
  isLoading: boolean
  isRefreshing: boolean
  refreshingModule: string | null
  error: Error | null
  refreshIssue: () => Promise<void>
  refreshModule: (moduleId: string) => Promise<void>
}

interface NewspaperIssueProviderProps {
  selectedDate: string | null
  selectedDates: string[]
  dayRange: DayRange
  children: (state: NewspaperIssueState) => React.ReactNode
}

interface IssueRequestSnapshot {
  selectedDate: string | null
  selectedDates: string[]
  dayRange: DayRange
  datesKey: string
  issueKey: string
}

interface GenerateIssuePayload {
  includeNewspaper?: boolean
  selectedDates: string[]
  dayRange: DayRange
  timelineMode: '24h'
  includeTicker: boolean
  includeTimeline: boolean
  includeFearGreed: boolean
}

type IssueSubmit = (payload: GenerateIssuePayload) => void

const NewspaperIssueContext = createContext<NewspaperIssueState | null>(null)
const TIMELINE_EVENT_TYPES = ['discussion', 'prediction', 'drama', 'insight', 'milestone', 'humor'] as const

function normalizeTimelineEventType(type: string | null | undefined): NewspaperIssueTimelineEvent['type'] {
  if (!type) return 'discussion'

  const lower = type.toLowerCase().trim()
  if ((TIMELINE_EVENT_TYPES as readonly string[]).includes(lower)) {
    return lower as NewspaperIssueTimelineEvent['type']
  }
  if (lower.includes('predict') || lower.includes('prognose') || lower.includes('call')) return 'prediction'
  if (lower.includes('drama') || lower.includes('streit') || lower.includes('beef') || lower.includes('conflict')) return 'drama'
  if (lower.includes('insight') || lower.includes('erkenntnis') || lower.includes('analyse')) return 'insight'
  if (lower.includes('mile') || lower.includes('meilenstein')) return 'milestone'
  if (lower.includes('humor') || lower.includes('witz') || lower.includes('lol') || lower.includes('meme')) return 'humor'
  return 'discussion'
}

function buildIssueKey(selectedDate: string | null, dayRange: DayRange, datesKey: string) {
  return `${selectedDate ?? 'none'}:${dayRange}:${datesKey}`
}

function sameCacheInfo(previous: IssueCacheInfo | null, next: IssueCacheInfo | null) {
  if (previous === next) return true
  if (!previous || !next) return false
  return previous.updatedAt === next.updatedAt &&
    previous.expiresAt === next.expiresAt &&
    previous.isFresh === next.isFresh &&
    previous.messageCount === next.messageCount &&
    previous.uniqueUsers === next.uniqueUsers &&
    previous.dayRange === next.dayRange
}

function addTickerIds(events: NonNullable<Partial<DailyAIResponseData['ticker']>['events']>) {
  return events
    .map((event, index) => {
      const text = event?.text?.trim() || event?.headline?.trim() || event?.quote?.trim()
      if (!text) return null

      return {
        ...event,
        date: event.date || new Date().toISOString().slice(0, 10),
        time: event.time || '--:--',
        username: event.username || event.quoteAuthor || 'Community',
        text: text.slice(0, 100),
        label: event.label ? event.label.slice(0, 8) : null,
        headline: event.headline ? event.headline.slice(0, 80) : text.slice(0, 80),
        quote: event.quote ?? null,
        quoteAuthor: event.quoteAuthor ?? null,
        type: event.type || 'insight',
        emoji: event.emoji ?? null,
        id: `${event.date || 'stream'}-${event.time?.replace(':', '') || index}-${index}`
      }
    })
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
}

function normalizeTimelineEvents(events: NonNullable<Partial<DailyAIResponseData['timeline']>['events']>): NewspaperIssueTimelineEvent[] {
  return events
    .filter(event => event?.title && event?.time && event?.date)
    .map((event, index) => ({
      timestamp: event.timestamp ?? null,
      time: event.time || '',
      date: event.date || '',
      label: (event.label || 'CHAT').slice(0, 12),
      title: (event.title || '').slice(0, 50),
      quote: event.quote ?? null,
      quoteAuthor: event.quoteAuthor ?? null,
      description: event.description ?? '',
      type: normalizeTimelineEventType(event.type),
      participants: event.participants || [],
      sentiment: event.sentiment ?? null,
      id: `${event.date || 'stream'}-${event.time?.replace(':', '') || index}-${index}`
    }))
}

type PartialNewspaperAIData = Partial<NewspaperAIData> & {
  featuredArticle?: NewspaperAIData['featuredArticle'] | null
  secondaryArticle?: NewspaperAIData['secondaryArticle'] | null
}

function issueMatchesSelection(issue: NewspaperIssue | null, selectedDate: string | null, dayRange: DayRange): issue is NewspaperIssue {
  return Boolean(issue && selectedDate && issue.meta.issueDate === selectedDate && issue.meta.dayRange === dayRange)
}

function emptyIssue(params: {
  selectedDate: string
  selectedDates: string[]
  dayRange: DayRange
  previous?: NewspaperIssue | null
}): NewspaperIssue {
  const now = new Date().toISOString()
  return {
    meta: {
      issueDate: params.selectedDate,
      selectedDates: params.selectedDates.length ? params.selectedDates : [params.selectedDate],
      dayRange: params.dayRange,
      timelineMode: '24h',
      generatedAt: now,
      updatedAt: now,
      expiresAt: now,
      isFresh: false,
      source: 'streaming',
      version: '2026-06-21.modular-v1',
      moduleVersions: params.previous?.meta.moduleVersions ?? {}
    },
    modules: {
      articleDigest: { data: params.previous?.modules.articleDigest.data ?? null },
      tickerBanner: { events: params.previous?.modules.tickerBanner.events ?? [] },
      expandingTimeline: {
        events: params.previous?.modules.expandingTimeline.events ?? [],
        summary: params.previous?.modules.expandingTimeline.summary ?? null,
        activityLevel: params.previous?.modules.expandingTimeline.activityLevel ?? null,
        dominantSentiment: params.previous?.modules.expandingTimeline.dominantSentiment ?? null,
        activityBuckets: params.previous?.modules.expandingTimeline.activityBuckets ?? [],
        activityStats: params.previous?.modules.expandingTimeline.activityStats ?? null
      },
      fearGreed: {
        data: params.previous?.modules.fearGreed.data ?? null,
        dateRange: params.previous?.modules.fearGreed.dateRange ?? null
      },
      activeChatters: { users: params.previous?.modules.activeChatters.users ?? [] },
      sidebarHighlights: {
        topContributors: params.previous?.modules.sidebarHighlights.topContributors ?? [],
        trendingTopics: params.previous?.modules.sidebarHighlights.trendingTopics ?? [],
        shortNews: params.previous?.modules.sidebarHighlights.shortNews ?? []
      }
    },
    resources: params.previous?.resources ?? {
      counts: {
        newspaperMessages: 0,
        tickerMessages: 0,
        timelineMessages: 0,
        fearGreedMessages: 0,
        newspaperUsers: 0,
        tickerUsers: 0,
        timelineUsers: 0,
        fearGreedUsers: 0
      },
      ranges: {}
    }
  }
}

function mergeStreamingObject(
  previous: NewspaperIssue | null,
  object: Partial<DailyAIResponseData> | undefined,
  params: { selectedDate: string; selectedDates: string[]; dayRange: DayRange }
): NewspaperIssue {
  const issue = emptyIssue({ ...params, previous })

  if (object?.newspaper?.data) {
    const normalizedNewspaper = normalizeStreamingNewspaper(
      object.newspaper.data as PartialNewspaperAIData,
      previous?.modules.articleDigest.data ?? null
    )

    if (normalizedNewspaper) {
      issue.modules.articleDigest.data = {
        ...normalizedNewspaper,
        activeChatters: previous?.modules.activeChatters.users
      }
    }

    issue.modules.sidebarHighlights = {
      topContributors: (object.newspaper.data.topContributors ?? previous?.modules.sidebarHighlights.topContributors ?? []).map(contributor => ({
        username: contributor.username,
        initial: contributor.initial
      })),
      trendingTopics: object.newspaper.data.trendingTopics ?? previous?.modules.sidebarHighlights.trendingTopics ?? [],
      shortNews: object.newspaper.data.shortNews ?? previous?.modules.sidebarHighlights.shortNews ?? []
    }
  }

  if (object?.ticker?.events?.length) {
    issue.modules.tickerBanner.events = addTickerIds(object.ticker.events)
  }

  if (object?.timeline?.events?.length) {
    issue.modules.expandingTimeline = {
      ...issue.modules.expandingTimeline,
      events: normalizeTimelineEvents(object.timeline.events),
      summary: object.timeline.summary ?? issue.modules.expandingTimeline.summary,
      activityLevel: object.timeline.activityLevel ?? issue.modules.expandingTimeline.activityLevel,
      dominantSentiment: object.timeline.dominantSentiment ?? issue.modules.expandingTimeline.dominantSentiment
    }
  }

  if (object?.fearGreed?.data) {
    issue.modules.fearGreed = {
      ...issue.modules.fearGreed,
      data: object.fearGreed.data
    }
  }

  return issue
}

function normalizeStreamingArticle(article?: NewspaperAIData['featuredArticle'] | null): ArticleData | null {
  if (!article) return null

  return {
    ...article,
    quote: article.quote ?? undefined,
    chartImage: article.chartImage
      ? {
          url: article.chartImage.url,
          caption: article.chartImage.caption ?? undefined,
          author: article.chartImage.author ?? undefined
        }
      : undefined
  }
}

function normalizeStreamingNewspaper(
  data: PartialNewspaperAIData,
  previous: UnifiedNewspaperData | null
): UnifiedNewspaperData | null {
  const featuredArticle = normalizeStreamingArticle(data.featuredArticle) ?? previous?.featuredArticle
  const secondaryArticle = normalizeStreamingArticle(data.secondaryArticle) ?? previous?.secondaryArticle

  if (!featuredArticle || !secondaryArticle) return previous

  return {
    topContributors: data.topContributors ?? previous?.topContributors ?? [],
    trendingTopics: data.trendingTopics ?? previous?.trendingTopics ?? [],
    featuredArticle,
    secondaryArticle,
    events: data.events ?? previous?.events ?? [],
    shortNews: data.shortNews ?? previous?.shortNews ?? [],
    moreArticles: data.moreArticles ?? previous?.moreArticles ?? [],
    activeChatters: previous?.activeChatters
  }
}

export function NewspaperIssueProvider({
  selectedDate,
  selectedDates,
  dayRange,
  children
}: NewspaperIssueProviderProps) {
  const [issue, setIssue] = useState<NewspaperIssue | null>(null)
  const [cacheInfo, setCacheInfo] = useState<IssueCacheInfo | null>(null)
  const [isLoadingCache, setIsLoadingCache] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshingModule, setRefreshingModule] = useState<string | null>(null)
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false)
  const [cacheError, setCacheError] = useState<Error | null>(null)
  const datesKey = selectedDates.join(',')
  const issueKey = buildIssueKey(selectedDate, dayRange, datesKey)

  const {
    object,
    submit,
    isLoading: isGenerating,
    error: generationError
  } = useObject({
    api: '/newspaper/api/summarize',
    schema: DailyAIResponseSchema
  })

  const backgroundGenerationKeysRef = useRef<Set<string>>(new Set())
  const issueRef = useRef<NewspaperIssue | null>(null)
  const paramsRef = useRef<IssueRequestSnapshot>({ selectedDate, selectedDates, dayRange, datesKey, issueKey })
  const submitRef = useRef<IssueSubmit | null>(null)
  const activeGenerationKeyRef = useRef<string | null>(null)
  const generationSeenLoadingRef = useRef(false)
  const streamTargetRef = useRef<IssueRequestSnapshot | null>(null)
  const activeStreamModeRef = useRef<'issue' | 'module' | null>(null)
  const activeStreamingModuleRef = useRef<string | null>(null)
  const lastStreamingSignatureRef = useRef<string>('')

  useEffect(() => {
    issueRef.current = issue
  }, [issue])

  useEffect(() => {
    paramsRef.current = { selectedDate, selectedDates, dayRange, datesKey, issueKey }
    lastStreamingSignatureRef.current = ''
  }, [datesKey, dayRange, issueKey, selectedDate, selectedDates])

  useEffect(() => {
    submitRef.current = submit as IssueSubmit
  }, [submit])

  const generateIssue = useCallback(async (force = false) => {
    const snapshot = paramsRef.current
    const { selectedDate, selectedDates, dayRange, datesKey } = snapshot
    if (!selectedDate || !submitRef.current) return

    const key = buildIssueKey(selectedDate, dayRange, datesKey)
    if (activeGenerationKeyRef.current === key) {
      if (force) setIsRefreshing(true)
      return
    }
    if (!force && backgroundGenerationKeysRef.current.has(key)) return

    activeGenerationKeyRef.current = key
    generationSeenLoadingRef.current = false
    streamTargetRef.current = snapshot
    activeStreamModeRef.current = 'issue'
    activeStreamingModuleRef.current = null
    lastStreamingSignatureRef.current = ''
    if (force) {
      backgroundGenerationKeysRef.current.delete(key)
      setIsRefreshing(true)
    } else {
      backgroundGenerationKeysRef.current.add(key)
      setIsBackgroundRefreshing(true)
    }

    setCacheError(null)
    if (force) {
      await fetch('/newspaper/api/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, dayRange })
      }).catch(console.error)
    }
    submitRef.current({
      includeNewspaper: true,
      selectedDates: selectedDates.length ? selectedDates : [selectedDate],
      dayRange,
      timelineMode: '24h',
      includeTicker: dayRange === 1,
      includeTimeline: dayRange === 1,
      includeFearGreed: dayRange === 1
    })
  }, [])

  const loadIssue = useCallback(async (options: { quiet?: boolean } = {}) => {
    const { selectedDate, dayRange, datesKey } = paramsRef.current
    if (!selectedDate) return

    if (!options.quiet) setIsLoadingCache(true)
    setCacheError(null)
    try {
      const response = await fetch(`/newspaper/api/issue?date=${selectedDate}&dayRange=${dayRange}`, {
        cache: 'no-store'
      })

      if (response.ok) {
        const result = await response.json()
        const incomingIssue = result.issue as NewspaperIssue
        const currentIssue = issueRef.current
        const currentKey = currentIssue
          ? buildIssueKey(currentIssue.meta.issueDate, currentIssue.meta.dayRange as DayRange, currentIssue.meta.selectedDates.join(','))
          : null
        const currentIsStreaming = issueMatchesSelection(currentIssue, selectedDate, dayRange) &&
          currentIssue.meta.source === 'streaming'
        const incomingIsOlder = currentIssue
          ? new Date(incomingIssue.meta.updatedAt).getTime() < new Date(currentIssue.meta.updatedAt).getTime()
          : false

        if (currentIsStreaming && incomingIsOlder) {
          return
        }

        setIssue(previous => {
          const previousKey = previous
            ? buildIssueKey(previous.meta.issueDate, previous.meta.dayRange as DayRange, previous.meta.selectedDates.join(','))
            : null
          if (
            previousKey === currentKey &&
            previousKey === buildIssueKey(incomingIssue.meta.issueDate, incomingIssue.meta.dayRange as DayRange, incomingIssue.meta.selectedDates.join(',')) &&
            previous?.meta.updatedAt === incomingIssue.meta.updatedAt &&
            previous?.meta.source === incomingIssue.meta.source
          ) {
            return previous
          }
          return incomingIssue
        })
        setCacheInfo(previous => sameCacheInfo(previous, result.cacheInfo) ? previous : result.cacheInfo)
        if (!result.cacheInfo?.isFresh && activeGenerationKeyRef.current !== buildIssueKey(selectedDate, dayRange, datesKey)) {
          generateIssue(false)
        }
        return
      }

      if (response.status === 404) {
        generateIssue(false)
        return
      }

      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || 'Failed to load newspaper issue')
    } catch (error) {
      setCacheError(error instanceof Error ? error : new Error('Failed to load newspaper issue'))
    } finally {
      setIsLoadingCache(false)
    }
  }, [generateIssue])

  const refreshModule = useCallback(async (moduleId: string) => {
    const snapshot = paramsRef.current
    const { selectedDate, selectedDates, dayRange } = snapshot
    if (!selectedDate || !submitRef.current) return
    if (refreshingModule) return

    setRefreshingModule(moduleId)
    setCacheError(null)

    if (moduleId !== 'sentiment.fearGreed') {
      setCacheError(new Error(`Streaming module refresh is not implemented for ${moduleId}`))
      setRefreshingModule(null)
      return
    }

    generationSeenLoadingRef.current = false
    streamTargetRef.current = snapshot
    activeStreamModeRef.current = 'module'
    activeStreamingModuleRef.current = moduleId
    lastStreamingSignatureRef.current = ''

    submitRef.current({
      includeNewspaper: false,
      selectedDates: selectedDates.length ? selectedDates : [selectedDate],
      dayRange,
      timelineMode: '24h',
      includeTicker: false,
      includeTimeline: false,
      includeFearGreed: true
    })
  }, [refreshingModule])

  useEffect(() => {
    loadIssue()
  }, [issueKey, loadIssue])

  useEffect(() => {
    if (!object) return
    const streamTarget = streamTargetRef.current ?? paramsRef.current
    const streamTargetDate = streamTarget.selectedDate
    if (!streamTargetDate) return
    const streamingSignature = `${streamTarget.issueKey}:${JSON.stringify(object)}`
    if (streamingSignature === lastStreamingSignatureRef.current) return
    lastStreamingSignatureRef.current = streamingSignature

    setIssue(previous => mergeStreamingObject(
      issueMatchesSelection(previous, streamTargetDate, streamTarget.dayRange) ? previous : null,
      object as Partial<DailyAIResponseData>,
      {
        selectedDate: streamTargetDate,
        selectedDates: streamTarget.selectedDates,
        dayRange: streamTarget.dayRange
      }
    ))
  }, [object])

  useEffect(() => {
    if (isGenerating) {
      generationSeenLoadingRef.current = true
    }
  }, [isGenerating])

  useEffect(() => {
    if (isGenerating) return
    if (refreshingModule && activeStreamModeRef.current === 'module') {
      if (!generationSeenLoadingRef.current) return
      const completedModuleId = activeStreamingModuleRef.current
      const { selectedDate, dayRange } = paramsRef.current

      if (!completedModuleId || !selectedDate) {
        setRefreshingModule(null)
        activeStreamModeRef.current = null
        activeStreamingModuleRef.current = null
        generationSeenLoadingRef.current = false
        return
      }

      const timeout = window.setTimeout(async () => {
        try {
          const response = await fetch(`/newspaper/api/module/${encodeURIComponent(completedModuleId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ date: selectedDate, dayRange, useLatestCache: true })
          })
          const result = await response.json().catch(() => ({}))
          if (!response.ok) {
            throw new Error(result.error || `Failed to patch ${completedModuleId}`)
          }
          if (result.issue) {
            setIssue(result.issue as NewspaperIssue)
            issueRef.current = result.issue as NewspaperIssue
          }
          if (result.cacheInfo) {
            setCacheInfo(previous => sameCacheInfo(previous, result.cacheInfo) ? previous : result.cacheInfo)
          }
        } catch (error) {
          setCacheError(error instanceof Error ? error : new Error(`Failed to patch ${completedModuleId}`))
        } finally {
          setRefreshingModule(null)
          activeStreamModeRef.current = null
          activeStreamingModuleRef.current = null
          generationSeenLoadingRef.current = false
        }
      }, 750)

      return () => window.clearTimeout(timeout)
    }
  }, [isGenerating, refreshingModule])

  useEffect(() => {
    if (isGenerating) return
    if (!isRefreshing && !isBackgroundRefreshing) return
    if (!generationSeenLoadingRef.current) return
    const completedGenerationKey = activeGenerationKeyRef.current
    const timeout = window.setTimeout(() => {
      loadIssue({ quiet: true }).finally(() => {
        if (activeGenerationKeyRef.current === completedGenerationKey) {
          activeGenerationKeyRef.current = null
        }
        if (completedGenerationKey) {
          backgroundGenerationKeysRef.current.delete(completedGenerationKey)
        }
        activeStreamModeRef.current = null
        activeStreamingModuleRef.current = null
        generationSeenLoadingRef.current = false
        setIsRefreshing(false)
        setIsBackgroundRefreshing(false)
      })
    }, 750)
    return () => window.clearTimeout(timeout)
  }, [isBackgroundRefreshing, isGenerating, isRefreshing, loadIssue])

  const state = useMemo<NewspaperIssueState>(() => {
    const visibleIssue = issueMatchesSelection(issue, selectedDate, dayRange) ? issue : null

    return {
      issue: visibleIssue,
      cacheInfo: visibleIssue ? cacheInfo : null,
      isLoading: !visibleIssue && (isLoadingCache || isGenerating),
      isRefreshing,
      refreshingModule,
      error: generationError || cacheError,
      refreshIssue: () => generateIssue(true),
      refreshModule
    }
  }, [cacheError, cacheInfo, dayRange, generateIssue, generationError, isGenerating, isLoadingCache, isRefreshing, issue, refreshModule, refreshingModule, selectedDate])

  return (
    <NewspaperIssueContext.Provider value={state}>
      {children(state)}
    </NewspaperIssueContext.Provider>
  )
}

export function useNewspaperIssue(): NewspaperIssueState {
  const context = useContext(NewspaperIssueContext)
  if (!context) {
    throw new Error('useNewspaperIssue must be used within NewspaperIssueProvider')
  }
  return context
}
