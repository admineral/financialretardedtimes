/**
 * legacy.ts (Newspaper edition v3 — archive adapter)
 *
 * Converts pre-rewrite `newspaper_cache` rows into the new block-based
 * NewspaperEdition so the archive (day switching into the past) renders
 * without regeneration. Handles both stored formats:
 *
 * 1. Modular v1 `NewspaperIssue` ({ meta, modules, resources })
 * 2. Ancient flat `UnifiedNewspaperData` (articles at the top level)
 */

import type { LeaderboardResponse } from '@/app/chart-leader/lib/schema'
import type {
  ActiveChatter,
  DailyFearGreedData,
  ShortNewsData,
  UnifiedNewspaperData
} from '../lib/types'
import {
  EDITION_FORMAT_VERSION,
  EDITION_WINDOW_DAYS,
  type ArticleBlock,
  type EditionBlock,
  type EditionContent,
  type NewspaperEdition
} from './types'
import { NEWSPAPER_TIME_ZONE } from '../lib/timezone'

/**
 * Structural type for the deleted engine's modular NewspaperIssue rows
 * ({ meta, modules, resources }) — only the fields the adapter reads.
 */
interface LegacyModularIssue {
  meta: { generatedAt?: string | null }
  modules: {
    articleDigest?: { data?: UnifiedNewspaperData | null } | null
    sidebarHighlights?: {
      trendingTopics?: string[]
      topContributors?: Array<{ username: string; initial: string; avatar?: string }>
    } | null
    fearGreed?: {
      data?: unknown
      dateRange?: { oldestDate: string; newestDate: string; todayMessageCount: number } | null
    } | null
    traderLeaderboard?: { data?: unknown; updatedAt?: string | null } | null
    activeChatters?: { users?: unknown[] } | null
    tickerBanner?: { events?: NewspaperEdition['content']['ticker']['events'] } | null
    expandingTimeline?: {
      events?: Array<
        Omit<NewspaperEdition['content']['timeline']['events'][number], 'description'> & {
          description?: string | null
        }
      >
      summary?: string | null
      activityLevel?: 'low' | 'medium' | 'high' | null
      dominantSentiment?: 'bullish' | 'bearish' | 'neutral' | 'mixed' | null
      activityBuckets?: NewspaperEdition['activity']['buckets']
      activityStats?: unknown
    } | null
  }
  resources: unknown
}

function isModularIssue(value: unknown): value is LegacyModularIssue {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'meta' in value &&
    'modules' in value &&
    'resources' in value
  )
}

function isFlatUnifiedData(value: unknown): value is UnifiedNewspaperData {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'featuredArticle' in value &&
    'trendingTopics' in value
  )
}

function legacyDateline(date: string, dayRange: number): string {
  const label = new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: NEWSPAPER_TIME_ZONE
  })
  const range = dayRange === 1 ? 'Tagesausgabe' : dayRange === 3 ? '3-Tage-Ausgabe' : 'Wochenausgabe'
  return `${range} · ${label}`
}

function articleFromLegacy(
  article: {
    author: string
    category: string
    headline: string
    summary: string
    quote?: { from: string; text: string } | null
    contributors: string[]
    chartImage?: { url: string; caption?: string | null; author?: string | null } | null
  },
  variant: ArticleBlock['variant']
): ArticleBlock {
  return {
    type: 'article',
    variant,
    kicker: article.category,
    headline: article.headline,
    standfirst: null,
    paragraphs: article.summary.split(/\n\n+/).filter(Boolean),
    quote: article.quote ? { text: article.quote.text, author: article.quote.from } : null,
    chartImage: article.chartImage
      ? {
          url: article.chartImage.url,
          caption: article.chartImage.caption ?? null,
          author: article.chartImage.author ?? null
        }
      : null,
    author: article.author,
    contributors: article.contributors ?? []
  }
}

function blocksFromUnifiedData(data: UnifiedNewspaperData): EditionBlock[] {
  const blocks: EditionBlock[] = []

  blocks.push({
    type: 'coverStory',
    kicker: data.featuredArticle.category,
    headline: data.featuredArticle.headline,
    standfirst: '',
    paragraphs: data.featuredArticle.summary.split(/\n\n+/).filter(Boolean),
    pullQuote: data.featuredArticle.quote
      ? { text: data.featuredArticle.quote.text, author: data.featuredArticle.quote.from }
      : null,
    chartImage: data.featuredArticle.chartImage
      ? {
          url: data.featuredArticle.chartImage.url,
          caption: data.featuredArticle.chartImage.caption ?? null,
          author: data.featuredArticle.chartImage.author ?? null
        }
      : null,
    contributors: data.featuredArticle.contributors?.length ? data.featuredArticle.contributors : [data.featuredArticle.author],
    author: data.featuredArticle.author
  })

  blocks.push(articleFromLegacy(data.secondaryArticle, 'feature'))

  if (data.events?.length) {
    blocks.push({ type: 'sectionHeader', title: 'Momente des Tages', subtitle: null })
    for (const event of data.events) {
      blocks.push({
        type: 'article',
        variant: 'shortNews',
        kicker: event.type.toUpperCase(),
        headline: event.title,
        standfirst: null,
        paragraphs: [event.summary],
        quote: null,
        chartImage: null,
        author: event.participants[0] ?? 'Redaktion',
        contributors: event.participants ?? []
      })
    }
  }

  const shortNews: ShortNewsData[] = data.shortNews ?? []
  const moreArticles = data.moreArticles ?? []
  if (shortNews.length + moreArticles.length > 0) {
    blocks.push({ type: 'sectionHeader', title: 'In Kürze', subtitle: null })
    for (const item of shortNews) {
      blocks.push({
        type: 'article',
        variant: 'shortNews',
        kicker: 'KURZMELDUNG',
        headline: item.headline,
        standfirst: null,
        paragraphs: [item.teaser],
        quote: null,
        chartImage: null,
        author: item.author,
        contributors: []
      })
    }
    for (const item of moreArticles) {
      blocks.push({
        type: 'article',
        variant: 'shortNews',
        kicker: item.category,
        headline: item.headline,
        standfirst: null,
        paragraphs: [item.teaser],
        quote: null,
        chartImage: null,
        author: 'Redaktion',
        contributors: []
      })
    }
  }

  return blocks
}

function emptyContent(date: string, dayRange: number): EditionContent & NewspaperEdition['content'] {
  return {
    masthead: {
      dateline: legacyDateline(date, dayRange),
      motto: 'Aus dem Archiv'
    },
    blocks: [],
    ticker: { events: [] },
    timeline: { events: [], summary: null, activityLevel: null, dominantSentiment: null }
  }
}

function baseEdition(params: {
  date: string
  dayRange: number
  updatedAt: string
  messageCount: number
  uniqueUsers: number
}): NewspaperEdition {
  const { date, dayRange, updatedAt, messageCount, uniqueUsers } = params
  return {
    meta: {
      formatVersion: EDITION_FORMAT_VERSION,
      editionDate: date,
      selectedDates: [date],
      dayRange,
      windowDays: EDITION_WINDOW_DAYS,
      generationId: `legacy:${date}:${dayRange}`,
      generatedAt: updatedAt,
      updatedAt,
      isFresh: true,
      source: 'legacy',
      model: 'legacy',
      aiUsage: null
    },
    shared: {
      trendingTopics: [],
      topContributors: [],
      fearGreed: { data: null, dateRange: null, updatedAt: null },
      traderLeaderboard: { data: null, updatedAt: null },
      activeChatters: []
    },
    content: emptyContent(date, dayRange),
    activity: { buckets: [], stats: null },
    data: {
      window: { startDate: date, endDate: date, days: dayRange },
      btc: { candlesByRange: { '24h': [], '3d': [], '7d': [], '14d': [] }, currentPrice: null, change14d: null },
      fearGreedHistory: [],
      sentimentSeries: [],
      activitySeries: [],
      predictions: { items: [], summary: null, updatedAt: null },
      totals: { messageCount, uniqueUsers, busiestDay: null }
    },
    chatExcerpts: {},
    stats: { messageCount, uniqueUsers }
  }
}

/**
 * Adapts a pre-rewrite cache row into a NewspaperEdition, or returns null
 * if the payload is unrecognizable.
 */
export function adaptLegacyRow(params: {
  date: string
  dayRange: number
  legacyData: unknown
  updatedAt: string
  messageCount: number
  uniqueUsers: number
}): NewspaperEdition | null {
  const { date, dayRange, legacyData, updatedAt, messageCount, uniqueUsers } = params

  if (isModularIssue(legacyData)) {
    const issue = legacyData
    const digest = issue.modules.articleDigest?.data ?? null
    const edition = baseEdition({ date, dayRange, updatedAt, messageCount, uniqueUsers })

    edition.shared = {
      trendingTopics: digest?.trendingTopics ?? issue.modules.sidebarHighlights?.trendingTopics ?? [],
      topContributors: (digest?.topContributors ?? issue.modules.sidebarHighlights?.topContributors ?? []).map(contributor => ({
        username: contributor.username,
        initial: contributor.initial,
        reason: '',
        avatar: 'avatar' in contributor ? contributor.avatar : undefined
      })),
      fearGreed: {
        data: (issue.modules.fearGreed?.data as DailyFearGreedData | null) ?? null,
        dateRange: issue.modules.fearGreed?.dateRange ?? null,
        updatedAt: null
      },
      traderLeaderboard: {
        data: (issue.modules.traderLeaderboard?.data as LeaderboardResponse | null) ?? null,
        updatedAt: issue.modules.traderLeaderboard?.updatedAt ?? null
      },
      activeChatters: (issue.modules.activeChatters?.users ?? []) as ActiveChatter[]
    }

    edition.content = {
      ...emptyContent(date, dayRange),
      blocks: digest ? blocksFromUnifiedData(digest) : [],
      ticker: { events: issue.modules.tickerBanner?.events ?? [] },
      timeline: {
        events: (issue.modules.expandingTimeline?.events ?? []).map(event => ({
          ...event,
          description: event.description ?? ''
        })),
        summary: issue.modules.expandingTimeline?.summary ?? null,
        activityLevel: issue.modules.expandingTimeline?.activityLevel ?? null,
        dominantSentiment: issue.modules.expandingTimeline?.dominantSentiment ?? null
      }
    }

    edition.activity = {
      buckets: issue.modules.expandingTimeline?.activityBuckets ?? [],
      stats: (issue.modules.expandingTimeline?.activityStats ?? null) as NewspaperEdition['activity']['stats']
    }
    edition.meta.generatedAt = issue.meta.generatedAt ?? updatedAt
    return edition
  }

  if (isFlatUnifiedData(legacyData)) {
    const data = legacyData
    const edition = baseEdition({ date, dayRange, updatedAt, messageCount, uniqueUsers })
    edition.shared.trendingTopics = data.trendingTopics ?? []
    edition.shared.topContributors = (data.topContributors ?? []).map(contributor => ({
      username: contributor.username,
      initial: contributor.initial,
      reason: '',
      avatar: (contributor as { avatar?: string }).avatar
    }))
    edition.shared.activeChatters = data.activeChatters ?? []
    edition.content = {
      ...emptyContent(date, dayRange),
      blocks: blocksFromUnifiedData(data)
    }
    return edition
  }

  return null
}
