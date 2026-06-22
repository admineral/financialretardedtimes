import type { DailyAIContext } from '../lib/daily-ai'
import type { DailyAIResponseData, UnifiedNewspaperData } from '../lib/types'
import { getIssueExpiresAt, isIssueFresh } from './cache'
import type {
  NewspaperIssue,
  NewspaperIssueActivityBucket,
  NewspaperIssueActivityStats,
  NewspaperIssueTimelineEvent
} from './types'
import { firstPartyNewspaperModules } from '../modules'

const ISSUE_VERSION = '2026-06-21.modular-v1'

function addTickerIds(events: DailyAIResponseData['ticker']['events']) {
  return events
    .map((event, index) => {
      const text = event.text?.trim() || event.headline?.trim() || event.quote?.trim()
      if (!text) return null

      return {
        ...event,
        text: text.slice(0, 100),
        label: event.label ? event.label.slice(0, 8) : null,
        headline: event.headline ? event.headline.slice(0, 80) : text.slice(0, 80),
        id: `${event.date}-${event.time.replace(':', '')}-${index}`
      }
    })
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
}

function normalizeTimelineEvents(events: DailyAIResponseData['timeline']['events']): NewspaperIssueTimelineEvent[] {
  return events.map((event, index) => ({
    ...event,
    id: `${event.date}-${event.time.replace(':', '')}-${index}`,
    timestamp: event.timestamp ?? null,
    label: event.label.slice(0, 12),
    title: event.title.slice(0, 50),
    description: event.description ?? '',
    type: event.type,
    participants: event.participants ?? []
  }))
}

function serializeRange(range: DailyAIContext['ranges'][keyof DailyAIContext['ranges']]) {
  if (!range) return null
  return {
    startDate: range.startDate.toISOString(),
    endDate: range.endDate.toISOString(),
    cacheKey: range.cacheKey
  }
}

function moduleVersions(): Record<string, string> {
  return Object.fromEntries(firstPartyNewspaperModules.map(module => [module.id, module.version]))
}

export function createNewspaperIssue(params: {
  object: DailyAIResponseData
  context: DailyAIContext
  newspaperData: UnifiedNewspaperData | null
  updatedAt?: string
  source?: NewspaperIssue['meta']['source']
}): NewspaperIssue {
  const updatedAt = params.updatedAt ?? new Date().toISOString()
  const selectedDates = params.context.selectedDates.length > 0
    ? params.context.selectedDates
    : [params.context.cacheDate]

  const issue: NewspaperIssue = {
    meta: {
      issueDate: params.context.cacheDate,
      selectedDates,
      dayRange: params.context.dayRange,
      timelineMode: params.context.timelineMode,
      generatedAt: updatedAt,
      updatedAt,
      expiresAt: getIssueExpiresAt(updatedAt),
      isFresh: isIssueFresh(updatedAt),
      source: params.source ?? 'generated',
      version: ISSUE_VERSION,
      moduleVersions: moduleVersions()
    },
    modules: {
      articleDigest: {
        data: params.newspaperData
      },
      tickerBanner: {
        events: addTickerIds(params.object.ticker.events)
      },
      expandingTimeline: {
        events: normalizeTimelineEvents(params.object.timeline.events),
        summary: params.object.timeline.summary,
        activityLevel: params.object.timeline.activityLevel,
        dominantSentiment: params.object.timeline.dominantSentiment,
        activityBuckets: (params.context.timelineActivityBuckets ?? []) as NewspaperIssueActivityBucket[],
        activityStats: (params.context.timelineActivityStats ?? null) as NewspaperIssueActivityStats | null
      },
      fearGreed: {
        data: params.object.fearGreed.data,
        dateRange: params.context.fearGreedDateRangeInfo
      },
      activeChatters: {
        users: params.context.activeChatters ?? []
      },
      sidebarHighlights: {
        topContributors: params.newspaperData?.topContributors ?? [],
        trendingTopics: params.newspaperData?.trendingTopics ?? [],
        shortNews: params.newspaperData?.shortNews ?? []
      }
    },
    resources: {
      counts: params.context.counts,
      ranges: {
        newspaper: serializeRange(params.context.ranges.newspaper),
        ticker: serializeRange(params.context.ranges.ticker),
        timeline: serializeRange(params.context.ranges.timeline),
        fearGreed: serializeRange(params.context.ranges.fearGreed)
      }
    }
  }

  return issue
}

export function isNewspaperIssue(value: unknown): value is NewspaperIssue {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'meta' in value &&
    'modules' in value &&
    (value as { modules?: { articleDigest?: unknown } }).modules?.articleDigest
  )
}
