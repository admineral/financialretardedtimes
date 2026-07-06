/**
 * types.ts (Newspaper v2 — Monthly Edition)
 *
 * All Zod schemas and TypeScript types for the two-stage v2 pipeline:
 *
 * Stage 1: DailyDigest — one compact AI digest per Berlin day, cached forever
 *          for past days in `newspaper_v2_daily_digests`.
 *
 * Stage 2: MonthlyIssueAI — one full generation over 30 daily digests plus
 *          raw recent chat plus market data. The model returns a DYNAMIC,
 *          ordered list of content blocks (discriminated union) instead of
 *          fixed widget slots. Deterministic data (candles, sentiment series,
 *          activity, F&G history, predictions) is computed in code and bound
 *          to `dataComponent` blocks by the UI.
 */

import { z } from 'zod'
import { LeaderboardEntrySchema, LeaderboardResponseSchema } from '@/app/chart-leader/lib/schema'

// OpenAI strict structured outputs require every key to be present, so the
// v2 leaderboard variant replaces `.optional()` with `.nullable()`.
const V2LeaderboardEntrySchema = LeaderboardEntrySchema.extend({
  worstCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    outcome: z.string(),
    timestamp: z.string()
  }).nullable()
})

export const V2LeaderboardResponseSchema = LeaderboardResponseSchema.extend({
  leaderboard: z.array(V2LeaderboardEntrySchema).min(3).max(20)
})

export type V2LeaderboardResponse = z.infer<typeof V2LeaderboardResponseSchema>

// ═══════════════════════════════════════════════════════════════════════
// STAGE 1 — Daily digest
// ═══════════════════════════════════════════════════════════════════════

export const DigestAISchema = z.object({
  summary: z.string().describe('4-8 Saetze: was an diesem Tag im Chat passiert ist'),
  topics: z.array(z.string()).min(1).max(8),
  sentiment: z.object({
    score: z.number().min(0).max(100).describe('0 = extrem bearish, 50 = neutral, 100 = extrem bullish'),
    label: z.enum(['bearish', 'leicht bearish', 'neutral', 'leicht bullish', 'bullish', 'gemischt'])
  }),
  notableQuotes: z.array(z.object({
    username: z.string(),
    text: z.string().describe('EXAKTES Original-Zitat'),
    time: z.string().nullable().describe('ISO Zeitstempel der Nachricht, falls bekannt')
  })).max(6),
  keyEvents: z.array(z.object({
    title: z.string(),
    description: z.string(),
    participants: z.array(z.string()).max(6)
  })).max(6),
  topUsers: z.array(z.string()).max(5),
  btcNote: z.string().nullable().describe('Kurzer Satz zum BTC-Preisverlauf des Tages, falls relevant')
})

export type DigestAI = z.infer<typeof DigestAISchema>

export interface DailyDigestData {
  ai: DigestAI
  stats: {
    messageCount: number
    uniqueUsers: number
  }
  btc: {
    open: number
    close: number
    high: number
    low: number
  } | null
}

export interface DailyDigestRow {
  digestDate: string
  data: DailyDigestData
  messageCount: number
  uniqueUsers: number
  model: string
  updatedAt: string
}

// ═══════════════════════════════════════════════════════════════════════
// STAGE 2 — Dynamic content blocks
// ═══════════════════════════════════════════════════════════════════════

const PullQuoteSchema = z.object({
  text: z.string(),
  author: z.string()
})

export const CoverStoryBlockSchema = z.object({
  type: z.literal('coverStory'),
  kicker: z.string().describe('Dachzeile, z.B. "DER MONAT IM CHAT"'),
  headline: z.string(),
  standfirst: z.string().describe('Unterzeile / Vorspann, 1-2 Saetze'),
  paragraphs: z.array(z.string()).min(3).max(8),
  pullQuote: PullQuoteSchema.nullable(),
  contributors: z.array(z.string()).min(1).max(6),
  author: z.string()
})

export const ArticleBlockSchema = z.object({
  type: z.literal('article'),
  variant: z.enum(['investigative', 'monthlyFocus', 'weeklyRecap', 'feature', 'shortNews']),
  weekLabel: z.string().nullable().describe('Nur bei weeklyRecap, z.B. "Woche 1 (02.-08. Jun)"'),
  kicker: z.string(),
  headline: z.string(),
  standfirst: z.string().nullable(),
  paragraphs: z.array(z.string()).min(1).max(12),
  quote: PullQuoteSchema.nullable(),
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

export const StatsBoxBlockSchema = z.object({
  type: z.literal('statsBox'),
  title: z.string(),
  stats: z.array(z.object({
    label: z.string(),
    value: z.string(),
    hint: z.string().nullable()
  })).min(2).max(8)
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

export const DATA_COMPONENT_IDS = [
  'btcChart',
  'sentimentTimeline',
  'traderLeaderboard',
  'fearGreed',
  'predictionRecap',
  'activityHeatmap'
] as const

export const DataComponentBlockSchema = z.object({
  type: z.literal('dataComponent'),
  component: z.enum(DATA_COMPONENT_IDS),
  title: z.string(),
  commentary: z.string().describe('2-4 Saetze redaktioneller Kommentar zur Abbildung'),
  annotations: z.array(z.object({
    date: z.string().describe('YYYY-MM-DD'),
    text: z.string()
  })).max(6)
})

// NOTE: plain z.union (not discriminatedUnion) — OpenAI structured outputs
// rejects the 'oneOf' JSON schema that discriminated unions serialize to,
// while unions serialize to the accepted 'anyOf'.
export const BlockSchema = z.union([
  CoverStoryBlockSchema,
  ArticleBlockSchema,
  SectionHeaderBlockSchema,
  QuoteWallBlockSchema,
  StatsBoxBlockSchema,
  ChatExcerptBlockSchema,
  DataComponentBlockSchema
])

export const MonthlyIssueAISchema = z.object({
  masthead: z.object({
    issueTitle: z.string().describe('Titel der Monatsausgabe'),
    dateline: z.string().describe('z.B. "Monatsausgabe · 06. Juni - 06. Juli 2026"'),
    motto: z.string().describe('Trockenes Editions-Motto in einer Zeile')
  }),
  trendingTopics: z.array(z.string()).min(4).max(8),
  topContributors: z.array(z.object({
    username: z.string(),
    reason: z.string()
  })).min(3).max(6),
  blocks: z.array(BlockSchema).min(18).max(40),
  traderLeaderboard: V2LeaderboardResponseSchema.nullable()
})

export type CoverStoryBlock = z.infer<typeof CoverStoryBlockSchema>
export type ArticleBlock = z.infer<typeof ArticleBlockSchema>
export type SectionHeaderBlock = z.infer<typeof SectionHeaderBlockSchema>
export type QuoteWallBlock = z.infer<typeof QuoteWallBlockSchema>
export type StatsBoxBlock = z.infer<typeof StatsBoxBlockSchema>
export type ChatExcerptBlock = z.infer<typeof ChatExcerptBlockSchema>
export type DataComponentBlock = z.infer<typeof DataComponentBlockSchema>
export type DataComponentId = (typeof DATA_COMPONENT_IDS)[number]
export type V2Block = z.infer<typeof BlockSchema>
export type MonthlyIssueAI = z.infer<typeof MonthlyIssueAISchema>

// ═══════════════════════════════════════════════════════════════════════
// Deterministic data payload (computed in code, bound to dataComponents)
// ═══════════════════════════════════════════════════════════════════════

export interface V2Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export interface V2SentimentPoint {
  date: string
  score: number
  label: string
  btcClose: number | null
}

export interface V2ActivityPoint {
  date: string
  messageCount: number
  uniqueUsers: number
}

export interface V2FearGreedPoint {
  createdAt: string
  todayIndex: number
  todayClassificationDE: string
  trend: string
  insight: string | null
}

export interface V2PredictionItem {
  username: string
  prediction: string
  direction: 'bullish' | 'bearish' | 'neutral'
  targetPrice: number | null
  targetDateText: string
  priceAtPrediction: number
  timestamp: string
  confidence: 'low' | 'medium' | 'high'
}

export interface V2ResolvedChatMessage {
  username: string
  text: string
  time: string
  avatar: string | null
  isModerator: boolean
  matched: boolean
}

export interface V2Data {
  range: { startDate: string; endDate: string; days: number }
  btc: {
    candles: V2Candle[]
    currentPrice: number | null
    change30d: number | null
  }
  sentimentSeries: V2SentimentPoint[]
  activitySeries: V2ActivityPoint[]
  fearGreedHistory: V2FearGreedPoint[]
  predictions: {
    items: V2PredictionItem[]
    summary: string | null
    updatedAt: string | null
  }
  digestCoverage: Array<{
    date: string
    hasDigest: boolean
    messageCount: number
    uniqueUsers: number
  }>
  totals: {
    messageCount: number
    uniqueUsers: number
    busiestDay: string | null
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Composed issue envelope (cached in newspaper_v2_cache)
// ═══════════════════════════════════════════════════════════════════════

export interface V2AIUsage {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  reasoningTokens: number | null
  modelId: string | null
}

export interface V2IssueMeta {
  issueDate: string
  rangeStart: string
  rangeEnd: string
  days: number
  generatedAt: string
  updatedAt: string
  expiresAt: string
  isFresh: boolean
  source: 'cache' | 'generated' | 'streaming'
  version: string
  model: string
  aiUsage: V2AIUsage | null
}

export interface V2Issue {
  meta: V2IssueMeta
  content: MonthlyIssueAI
  /** Deterministic data payloads for dataComponent blocks */
  data: V2Data
  /** Server-resolved authentic chat messages, keyed by block index */
  chatExcerpts: Record<string, V2ResolvedChatMessage[]>
}

export const V2_ISSUE_VERSION = '2026-07-06.v2-monthly-1'
export const V2_ISSUE_TTL_SECONDS = 24 * 60 * 60
export const V2_MODEL = 'gpt-5.4'
export const V2_DAYS = 30
export const V2_RAW_DAYS = 3
