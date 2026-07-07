/**
 * types.ts (Newspaper edition v3 — tri-edition pipeline)
 *
 * All Zod schemas and TypeScript types for the production rewrite of
 * /newspaper. One mega generation returns THREE editions (1D/3D/7D) as
 * ordered block lists plus shared modules (Fear & Greed, trader
 * leaderboard, contributors, topics). Every deterministic number
 * (candles, F&G history, activity, sentiment, predictions) is computed
 * in code and bound to `dataComponent` blocks by the UI — the model only
 * writes content and picks/parameterizes genui components.
 *
 * OpenAI strict structured outputs: every field present (nullable, not
 * optional) and plain z.union instead of z.discriminatedUnion.
 */

import { z } from 'zod'
import { LeaderboardEntrySchema, LeaderboardResponseSchema } from '@/app/chart-leader/lib/schema'
import {
  DailyFearGreedSchema,
  DailyTickerEventSchema,
  DailyTimelineEventSchema
} from '../lib/types'

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

export const EDITION_FORMAT_VERSION = '2026-07-07.edition-v3'
export const EDITION_MODEL = 'gpt-5.4'
/** Raw chat window fed to the mega generation (Berlin days). */
export const EDITION_WINDOW_DAYS = 14
export const EDITION_DAY_RANGES = [1, 3, 7] as const
/** Rough char budget for the raw chat section (~250k tokens). */
export const EDITION_CHAT_CHAR_BUDGET = 1_000_000
/** Days that always stay untouched when the budget forces downsampling. */
export const EDITION_PROTECTED_RECENT_DAYS = 3

export type EditionDayRange = (typeof EDITION_DAY_RANGES)[number]

export function isEditionDayRange(value: number): value is EditionDayRange {
  return (EDITION_DAY_RANGES as readonly number[]).includes(value)
}

// ═══════════════════════════════════════════════════════════════════════
// Leaderboard (OpenAI-safe variant: nullable instead of optional)
// ═══════════════════════════════════════════════════════════════════════

const EditionLeaderboardEntrySchema = LeaderboardEntrySchema.extend({
  worstCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    outcome: z.string(),
    timestamp: z.string()
  }).nullable()
})

export const EditionLeaderboardSchema = LeaderboardResponseSchema.extend({
  leaderboard: z.array(EditionLeaderboardEntrySchema).min(3).max(20)
})

export type EditionLeaderboard = z.infer<typeof EditionLeaderboardSchema>

/**
 * Stored leaderboard payloads may come from the new generation
 * (worstCall nullable) or from legacy rows (worstCall optional).
 */
export type EditionStoredLeaderboard = EditionLeaderboard | z.infer<typeof LeaderboardResponseSchema>

// ═══════════════════════════════════════════════════════════════════════
// GenUI data components (model picks component + params, data is bound
// deterministically by component id + range)
// ═══════════════════════════════════════════════════════════════════════

export const EDITION_DATA_COMPONENT_IDS = [
  'btcChart',
  'fearGreedVsBtc',
  'sentimentVsBtc',
  'activityVsBtc',
  'traderLeaderboard',
  'predictionRecap',
  'fearGreedGauge'
] as const

export type EditionDataComponentId = (typeof EDITION_DATA_COMPONENT_IDS)[number]

export const EDITION_CHART_RANGES = ['24h', '3d', '7d', '14d'] as const
export type EditionChartRange = (typeof EDITION_CHART_RANGES)[number]

export const DataComponentBlockSchema = z.object({
  type: z.literal('dataComponent'),
  component: z.enum(EDITION_DATA_COMPONENT_IDS),
  range: z.enum(EDITION_CHART_RANGES).nullable()
    .describe('Zeitfenster der Abbildung (nur fuer Chart-Komponenten relevant, sonst null)'),
  title: z.string(),
  commentary: z.string().describe('2-4 Saetze redaktioneller Kommentar zur Abbildung'),
  annotations: z.array(z.object({
    date: z.string().describe('YYYY-MM-DD'),
    text: z.string()
  })).max(6)
})

// ═══════════════════════════════════════════════════════════════════════
// Content blocks
// ═══════════════════════════════════════════════════════════════════════

const PullQuoteSchema = z.object({
  text: z.string(),
  author: z.string()
})

const ArticleChartImageSchema = z.object({
  url: z.string().describe('TradingView Chart-URL aus dem Chat (tradingview.com/x/...)'),
  caption: z.string().nullable(),
  author: z.string().nullable()
})

export const CoverStoryBlockSchema = z.object({
  type: z.literal('coverStory'),
  kicker: z.string().describe('Dachzeile, z.B. "DIE GESCHICHTE DES TAGES"'),
  headline: z.string(),
  standfirst: z.string().describe('Unterzeile / Vorspann, 1-2 Saetze'),
  paragraphs: z.array(z.string()).min(2).max(8),
  pullQuote: PullQuoteSchema.nullable(),
  chartImage: ArticleChartImageSchema.nullable(),
  contributors: z.array(z.string()).min(1).max(6),
  author: z.string()
})

export const ARTICLE_VARIANTS = ['investigative', 'feature', 'analysis', 'shortNews'] as const

export const ArticleBlockSchema = z.object({
  type: z.literal('article'),
  variant: z.enum(ARTICLE_VARIANTS),
  kicker: z.string(),
  headline: z.string(),
  standfirst: z.string().nullable(),
  paragraphs: z.array(z.string()).min(1).max(14),
  quote: PullQuoteSchema.nullable(),
  chartImage: ArticleChartImageSchema.nullable(),
  author: z.string(),
  contributors: z.array(z.string()).max(6)
})

export const SectionHeaderBlockSchema = z.object({
  type: z.literal('sectionHeader'),
  title: z.string(),
  subtitle: z.string().nullable()
})

export const QuoteWallBlockSchema = z.object({
  type: z.literal('quoteWall'),
  title: z.string(),
  quotes: z.array(z.object({
    text: z.string(),
    username: z.string(),
    context: z.string().nullable()
  })).min(3).max(10)
})

export const ChatExcerptBlockSchema = z.object({
  type: z.literal('chatExcerpt'),
  title: z.string(),
  context: z.string().describe('1-2 Saetze: warum dieser Moment wichtig war'),
  messageRefs: z.array(z.object({
    username: z.string(),
    time: z.string().describe('ISO Zeitstempel der Original-Nachricht'),
    text: z.string().describe('EXAKTER Original-Text der Nachricht')
  })).min(2).max(8)
})

// Plain union — OpenAI structured outputs rejects discriminated unions.
export const EditionBlockSchema = z.union([
  CoverStoryBlockSchema,
  ArticleBlockSchema,
  SectionHeaderBlockSchema,
  QuoteWallBlockSchema,
  ChatExcerptBlockSchema,
  DataComponentBlockSchema
])

export type CoverStoryBlock = z.infer<typeof CoverStoryBlockSchema>
export type ArticleBlock = z.infer<typeof ArticleBlockSchema>
export type SectionHeaderBlock = z.infer<typeof SectionHeaderBlockSchema>
export type QuoteWallBlock = z.infer<typeof QuoteWallBlockSchema>
export type ChatExcerptBlock = z.infer<typeof ChatExcerptBlockSchema>
export type DataComponentBlock = z.infer<typeof DataComponentBlockSchema>
export type EditionBlock = z.infer<typeof EditionBlockSchema>

// ═══════════════════════════════════════════════════════════════════════
// Per-edition content (blocks + own ticker + own timeline)
// ═══════════════════════════════════════════════════════════════════════

export const EditionContentSchema = z.object({
  masthead: z.object({
    dateline: z.string().describe('z.B. "Tagesausgabe · Montag, 07. Juli 2026"'),
    motto: z.string().describe('Trockenes Editions-Motto in einer Zeile')
  }),
  blocks: z.array(EditionBlockSchema).min(5).max(30),
  ticker: z.object({
    events: z.array(DailyTickerEventSchema).max(30)
  }),
  timeline: z.object({
    events: z.array(DailyTimelineEventSchema).max(20),
    summary: z.string().nullable(),
    activityLevel: z.enum(['low', 'medium', 'high']).nullable(),
    dominantSentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).nullable()
  })
})

export type EditionContent = z.infer<typeof EditionContentSchema>

// ═══════════════════════════════════════════════════════════════════════
// AI response schemas (mega tri-edition call + archive single edition)
// ═══════════════════════════════════════════════════════════════════════

const TopContributorSchema = z.object({
  username: z.string(),
  initial: z.string().max(1),
  reason: z.string().describe('Warum dieser User heute reingehoert, 1 kurzer Satz')
})

/**
 * The mega-call contract. Field order == stream order: small shared bits
 * first, then the editions (1D first, it is what most visitors look at),
 * leaderboard last because it is the heaviest reasoning step.
 */
export const TriEditionAISchema = z.object({
  trendingTopics: z.array(z.string()).min(4).max(8),
  topContributors: z.array(TopContributorSchema).min(3).max(6),
  fearGreed: DailyFearGreedSchema,
  edition1d: EditionContentSchema,
  edition3d: EditionContentSchema,
  edition7d: EditionContentSchema,
  traderLeaderboard: EditionLeaderboardSchema.nullable()
})

export type TriEditionAI = z.infer<typeof TriEditionAISchema>

/** Archive re-generation for a past day (or past multi-day anchor). */
export const ArchiveEditionAISchema = z.object({
  trendingTopics: z.array(z.string()).min(3).max(8),
  topContributors: z.array(TopContributorSchema).min(3).max(6),
  edition: EditionContentSchema
})

export type ArchiveEditionAI = z.infer<typeof ArchiveEditionAISchema>

// ═══════════════════════════════════════════════════════════════════════
// Deterministic data payload (bound to dataComponents by the UI)
// ═══════════════════════════════════════════════════════════════════════

export interface EditionCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export interface EditionFearGreedPoint {
  createdAt: string
  todayIndex: number
  todayClassificationDE: string
  trend: string
  insight: string | null
}

export interface EditionSentimentPoint {
  timestamp: string
  netSentiment: number
  messageCount: number
  priceAtBucket: number | null
}

export interface EditionActivityPoint {
  date: string
  messageCount: number
  uniqueUsers: number
  btcClose: number | null
}

export interface EditionPredictionItem {
  username: string
  prediction: string
  direction: 'bullish' | 'bearish' | 'neutral'
  targetPrice: number | null
  targetDateText: string
  priceAtPrediction: number
  timestamp: string
  confidence: 'low' | 'medium' | 'high'
}

export interface EditionData {
  window: { startDate: string; endDate: string; days: number }
  btc: {
    candlesByRange: Record<EditionChartRange, EditionCandle[]>
    currentPrice: number | null
    change14d: number | null
  }
  fearGreedHistory: EditionFearGreedPoint[]
  sentimentSeries: EditionSentimentPoint[]
  activitySeries: EditionActivityPoint[]
  predictions: {
    items: EditionPredictionItem[]
    summary: string | null
    updatedAt: string | null
  }
  totals: {
    messageCount: number
    uniqueUsers: number
    busiestDay: string | null
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Stored envelope (one row per date + dayRange in newspaper_cache)
// ═══════════════════════════════════════════════════════════════════════

export interface EditionAIUsage {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  cachedInputTokens: number | null
  reasoningTokens: number | null
  modelId: string | null
}

export interface EditionMeta {
  formatVersion: string
  editionDate: string
  selectedDates: string[]
  dayRange: number
  windowDays: number
  generationId: string
  generatedAt: string
  updatedAt: string
  /** Computed at read time via the noon rule; stored value is advisory. */
  isFresh: boolean
  source: 'cache' | 'generated' | 'streaming' | 'legacy'
  model: string
  aiUsage: EditionAIUsage | null
}

export interface EditionActivityBucket {
  timestamp: string
  label: string
  count: number
  uniqueUsers: number
  intensity: number
}

export interface EditionActivityStats {
  totalMessages: number
  totalUsers: number
  avgPerBucket: number
  maxPerBucket: number
  peakTime: string
  quietTime: string
  mode: string
  interval: string
  startDate: string
  endDate: string
}

export interface EditionActiveChatter {
  username: string
  avatar?: string
  messageCount: number
}

export interface EditionShared {
  trendingTopics: string[]
  topContributors: Array<{ username: string; initial: string; reason: string; avatar?: string }>
  fearGreed: {
    data: z.infer<typeof DailyFearGreedSchema> | null
    dateRange: { oldestDate: string; newestDate: string; todayMessageCount: number } | null
    updatedAt: string | null
  }
  traderLeaderboard: {
    data: EditionStoredLeaderboard | null
    updatedAt: string | null
  }
  activeChatters: EditionActiveChatter[]
}

export interface EditionResolvedChatMessage {
  username: string
  text: string
  time: string
  avatar: string | null
  isModerator: boolean
  matched: boolean
}

export type EditionTickerEvent = z.infer<typeof DailyTickerEventSchema> & { id: string }
export type EditionTimelineEvent = z.infer<typeof DailyTimelineEventSchema> & {
  id: string
  description: string
}

export interface NewspaperEdition {
  meta: EditionMeta
  shared: EditionShared
  content: EditionContent & {
    ticker: { events: EditionTickerEvent[] }
    timeline: EditionContent['timeline'] & { events: EditionTimelineEvent[] }
  }
  /** Deterministic activity buckets for the ChatHistoryTimeline strip. */
  activity: {
    buckets: EditionActivityBucket[]
    stats: EditionActivityStats | null
  }
  /** Deterministic genui data for the dataComponent blocks. */
  data: EditionData
  /** Server-resolved authentic chat messages, keyed by block index. */
  chatExcerpts: Record<string, EditionResolvedChatMessage[]>
  stats: {
    messageCount: number
    uniqueUsers: number
  }
}

export interface EditionCacheInfo {
  updatedAt: string
  generatedAt: string
  generationId: string
  isFresh: boolean
  messageCount: number
  uniqueUsers: number
  dayRange: number
}

export function isNewspaperEdition(value: unknown): value is NewspaperEdition {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'meta' in value &&
    (value as { meta?: { formatVersion?: string } }).meta?.formatVersion === EDITION_FORMAT_VERSION &&
    'content' in value &&
    Array.isArray((value as { content?: { blocks?: unknown } }).content?.blocks)
  )
}
