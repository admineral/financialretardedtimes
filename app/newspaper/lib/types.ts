/**
 * types.ts
 * 
 * TypeScript type definitions for the newspaper module.
 * 
 * LOCAL: Defines all interfaces and types used throughout the newspaper feature.
 * Includes date statistics, article data, events, and the unified newspaper schema.
 * 
 * GLOBAL: Single source of truth for all newspaper-related types. Imported by
 * components, API routes, and library files to ensure type consistency.
 * 
 * EXPORTS:
 * - DateStats: Interface for date selection with message counts
 * - UnifiedNewspaperData: Full AI-generated newspaper content type
 * - ArticleData, EventData, ShortNewsData, MoreArticleData: Sub-types
 */

import { z } from 'zod'

/**
 * Statistics for a single date in the chat archive.
 * Used by DateTimeline component and available-dates API.
 */
export interface DateStats {
  date: string // YYYY-MM-DD format
  messageCount: number
  uniqueUsers: number
}

/**
 * Quote from a chat message.
 * Used in articles to display user quotes.
 */
export const QuoteSchema = z.object({
  from: z.string(),
  text: z.string()
})

const NullableQuoteSchema = QuoteSchema.nullable()

/**
 * Chart image schema.
 * References TradingView chart screenshots shared in chat.
 */
export const ChartImageSchema = z.object({
  url: z.string(), // TradingView chart URL (e.g., https://www.tradingview.com/x/ABC123/)
  caption: z.string().optional(), // Description of the chart
  author: z.string().optional() // Who shared it
})

const AIChartImageSchema = z.object({
  url: z.string(), // TradingView chart URL (e.g., https://www.tradingview.com/x/ABC123/)
  caption: z.string().nullable(), // Description of the chart
  author: z.string().nullable() // Who shared it
})

/**
 * Chat event/moment schema.
 * Represents notable moments like discussions, debates, or milestones.
 */
export const EventSchema = z.object({
  type: z.enum(['discussion', 'debate', 'insight', 'humor', 'milestone']),
  title: z.string(),
  summary: z.string(),
  participants: z.array(z.string()).min(1).max(6) // Increased from 4 to allow more participants
})

/**
 * Main article schema.
 * Used for featured and secondary articles.
 */
export const ArticleSchema = z.object({
  author: z.string(),
  category: z.enum(['DISKUSSION', 'ANALYSE', 'MEINUNG', 'HIGHLIGHT', 'COMMUNITY']),
  headline: z.string(),
  summary: z.string(),
  quote: QuoteSchema.optional(),
  contributors: z.array(z.string()).min(1).max(4),
  chartImage: ChartImageSchema.optional() // Featured chart for this article
})

const AIArticleSchema = z.object({
  author: z.string(),
  category: z.enum(['DISKUSSION', 'ANALYSE', 'MEINUNG', 'HIGHLIGHT', 'COMMUNITY']),
  headline: z.string(),
  summary: z.string(),
  quote: NullableQuoteSchema,
  contributors: z.array(z.string()).min(1).max(4),
  chartImage: AIChartImageSchema.nullable() // Featured chart for this article
})

/**
 * Short news item schema.
 * Used in the sidebar for brief updates.
 */
export const ShortNewsSchema = z.object({
  headline: z.string(),
  teaser: z.string(),
  author: z.string()
})

/**
 * Additional article schema for the "more articles" grid.
 */
export const MoreArticleSchema = z.object({
  category: z.string(),
  headline: z.string(),
  teaser: z.string()
})

/**
 * Active chatter schema.
 * Represents a user who participated in the chat with their activity stats.
 */
export const ActiveChatterSchema = z.object({
  username: z.string(),
  avatar: z.string().optional(),
  messageCount: z.number()
})

const TopContributorSchema = z.object({
  username: z.string(),
  initial: z.string().max(1)
})

export const NewspaperAISchema = z.object({
  topContributors: z.array(TopContributorSchema).length(3),
  
  trendingTopics: z.array(z.string()).min(3).max(5),
  
  featuredArticle: AIArticleSchema,
  secondaryArticle: AIArticleSchema,
  
  events: z.array(EventSchema).min(1).max(3),
  
  shortNews: z.array(ShortNewsSchema).length(3),
  
  moreArticles: z.array(MoreArticleSchema).min(3).max(4)
})

const DailyTickerEventSchema = z.object({
  date: z.string(),
  time: z.string(),
  username: z.string(),
  text: z.string(),
  type: z.enum(['bullish', 'bearish', 'funny', 'drama', 'insight', 'call', 'fail']),
  emoji: z.string().nullable(),
  label: z.string().nullable(),
  headline: z.string().nullable(),
  quote: z.string().nullable(),
  quoteAuthor: z.string().nullable()
})

const DailyTimelineEventSchema = z.object({
  timestamp: z.string().nullable(),
  time: z.string(),
  date: z.string(),
  label: z.string().max(12),
  title: z.string().max(50),
  quote: z.string().nullable(),
  quoteAuthor: z.string().nullable(),
  description: z.string().nullable(),
  type: z.enum(['discussion', 'prediction', 'drama', 'insight', 'milestone', 'humor']),
  participants: z.array(z.string()),
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).nullable()
})

const DailyPeriodSentimentSchema = z.object({
  index: z.number().min(0).max(100),
  classification: z.enum(['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed']),
  classificationDE: z.enum(['Extreme Angst', 'Angst', 'Neutral', 'Gier', 'Extreme Gier'])
})

const DailyFearGreedSchema = z.object({
  today: DailyPeriodSentimentSchema,
  last3Days: DailyPeriodSentimentSchema,
  last7Days: DailyPeriodSentimentSchema,
  trend: z.enum(['rising', 'falling', 'stable']),
  insight: z.string(),
  topDrivers: z.array(z.string()).min(2).max(3)
})

export const DailyAIResponseSchema = z.object({
  newspaper: z.object({
    requested: z.boolean(),
    reason: z.string().nullable(),
    data: NewspaperAISchema.nullable()
  }),
  ticker: z.object({
    requested: z.boolean(),
    reason: z.string().nullable(),
    events: z.array(DailyTickerEventSchema)
  }),
  timeline: z.object({
    requested: z.boolean(),
    reason: z.string().nullable(),
    events: z.array(DailyTimelineEventSchema),
    summary: z.string().nullable(),
    activityLevel: z.enum(['low', 'medium', 'high']).nullable(),
    dominantSentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).nullable()
  }),
  fearGreed: z.object({
    requested: z.boolean(),
    reason: z.string().nullable(),
    data: DailyFearGreedSchema.nullable()
  })
})

/**
 * Unified newspaper schema.
 * Complete structure for AI-generated newspaper content.
 * Used by the summarize API and NewspaperContent component.
 */
export const UnifiedNewspaperSchema = z.object({
  topContributors: z.array(TopContributorSchema.extend({
    avatar: z.string().optional()
  })).length(3),
  
  trendingTopics: z.array(z.string()).min(3).max(5),
  
  featuredArticle: ArticleSchema,
  secondaryArticle: ArticleSchema,
  
  events: z.array(EventSchema).min(1).max(3),
  
  shortNews: z.array(ShortNewsSchema).length(3),
  
  moreArticles: z.array(MoreArticleSchema).min(3).max(4),
  
  // Active chatters from the day (added by API, not AI-generated)
  activeChatters: z.array(ActiveChatterSchema).optional()
})

// Inferred TypeScript types from Zod schemas
export type DailyAIResponseData = z.infer<typeof DailyAIResponseSchema>
export type DailyTickerEventData = z.infer<typeof DailyTickerEventSchema>
export type DailyTimelineEventData = z.infer<typeof DailyTimelineEventSchema>
export type DailyFearGreedData = z.infer<typeof DailyFearGreedSchema>
export type NewspaperAIData = z.infer<typeof NewspaperAISchema>
export type UnifiedNewspaperData = z.infer<typeof UnifiedNewspaperSchema>
export type ArticleData = z.infer<typeof ArticleSchema>
export type EventData = z.infer<typeof EventSchema>
export type ShortNewsData = z.infer<typeof ShortNewsSchema>
export type MoreArticleData = z.infer<typeof MoreArticleSchema>
export type ActiveChatter = z.infer<typeof ActiveChatterSchema>
export type ChartImage = z.infer<typeof ChartImageSchema>

