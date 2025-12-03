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

/**
 * Chat event/moment schema.
 * Represents notable moments like discussions, debates, or milestones.
 */
export const EventSchema = z.object({
  type: z.enum(['discussion', 'debate', 'insight', 'humor', 'milestone']),
  title: z.string(),
  summary: z.string(),
  participants: z.array(z.string()).min(1).max(4)
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
  contributors: z.array(z.string()).min(1).max(4)
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
 * Unified newspaper schema.
 * Complete structure for AI-generated newspaper content.
 * Used by the summarize API and NewspaperContent component.
 */
export const UnifiedNewspaperSchema = z.object({
  topContributors: z.array(z.object({
    username: z.string(),
    initial: z.string().max(1)
  })).length(3),
  
  trendingTopics: z.array(z.string()).min(3).max(5),
  
  featuredArticle: ArticleSchema,
  secondaryArticle: ArticleSchema,
  
  events: z.array(EventSchema).min(1).max(3),
  
  shortNews: z.array(ShortNewsSchema).length(3),
  
  moreArticles: z.array(MoreArticleSchema).min(3).max(4)
})

// Inferred TypeScript types from Zod schemas
export type UnifiedNewspaperData = z.infer<typeof UnifiedNewspaperSchema>
export type ArticleData = z.infer<typeof ArticleSchema>
export type EventData = z.infer<typeof EventSchema>
export type ShortNewsData = z.infer<typeof ShortNewsSchema>
export type MoreArticleData = z.infer<typeof MoreArticleSchema>

