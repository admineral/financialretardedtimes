import type React from 'react'
import { z } from 'zod'
import { LeaderboardResponseSchema } from '@/app/chart-leader/lib/schema'
import {
  ActiveChatterSchema,
  DailyFearGreedSchema,
  DailyTickerEventSchema,
  DailyTimelineEventSchema,
  ShortNewsSchema,
  UnifiedNewspaperSchema
} from '../lib/types'

export type ModuleRunMode = 'standalone' | 'composed'
export type ResourceKind = 'chat' | 'market' | 'avatar' | 'cache' | 'ai' | 'custom'

export interface ResourceNeed {
  id: string
  kind: ResourceKind
  params?: Record<string, unknown>
}

export interface ModuleCachePolicy {
  ttlSeconds: number
  staleSeconds?: number
  tags: string[]
}

export interface PromptSectionDefinition {
  id: string
  resources: string[]
  instructions: string[]
  outputPath: string
  examples?: string[]
  forbidden?: string[]
}

export interface ModulePromptContext {
  mode: ModuleRunMode
  outputPath: string
}

export type ModulePromptBuilder = (context: ModulePromptContext) => PromptSectionDefinition

export interface NewspaperIssue {
  meta: NewspaperIssueMeta
  modules: NewspaperIssueModules
  resources: NewspaperIssueResources
}

export interface NewspaperAIUsage {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  cachedInputTokens: number | null
  cacheWriteInputTokens: number | null
  reasoningTokens: number | null
  modelId: string | null
}

export interface NewspaperIssueMeta {
  issueDate: string
  selectedDates: string[]
  dayRange: number
  timelineMode: '24h' | '3d' | '7d'
  generatedAt: string
  updatedAt: string
  expiresAt: string
  isFresh: boolean
  source: 'cache' | 'generated' | 'streaming' | 'legacy'
  version: string
  moduleVersions: Record<string, string>
}

export interface NewspaperIssueResources {
  counts: {
    newspaperMessages: number
    tickerMessages: number
    timelineMessages: number
    fearGreedMessages: number
    newspaperUsers: number
    tickerUsers: number
    timelineUsers: number
    fearGreedUsers: number
    traderLeaderboardMessages: number
    traderLeaderboardUsers: number
  }
  ranges: Record<string, { startDate: string; endDate: string; cacheKey: string } | null>
  aiUsage?: NewspaperAIUsage | null
}

const IssueTickerEventSchema = DailyTickerEventSchema.extend({
  id: z.string()
})

const IssueTimelineEventSchema = DailyTimelineEventSchema.extend({
  id: z.string(),
  description: z.string(),
  type: z.enum(['discussion', 'prediction', 'drama', 'insight', 'milestone', 'humor'])
})

const IssueActivityBucketSchema = z.object({
  timestamp: z.string(),
  label: z.string(),
  count: z.number(),
  uniqueUsers: z.number(),
  intensity: z.number()
})

const IssueActivityStatsSchema = z.object({
  totalMessages: z.number(),
  totalUsers: z.number(),
  avgPerBucket: z.number().optional(),
  maxPerBucket: z.number(),
  peakTime: z.string(),
  quietTime: z.string().optional(),
  mode: z.string().optional(),
  interval: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

const NewspaperAIUsageSchema = z.object({
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
  cachedInputTokens: z.number().nullable(),
  cacheWriteInputTokens: z.number().nullable(),
  reasoningTokens: z.number().nullable(),
  modelId: z.string().nullable()
})

export const NewspaperIssueSchema = z.object({
  meta: z.object({
    issueDate: z.string(),
    selectedDates: z.array(z.string()),
    dayRange: z.number(),
    timelineMode: z.enum(['24h', '3d', '7d']),
    generatedAt: z.string(),
    updatedAt: z.string(),
    expiresAt: z.string(),
    isFresh: z.boolean(),
    source: z.enum(['cache', 'generated', 'streaming', 'legacy']),
    version: z.string(),
    moduleVersions: z.record(z.string(), z.string())
  }),
  modules: z.object({
    articleDigest: z.object({
      data: UnifiedNewspaperSchema.nullable()
    }),
    tickerBanner: z.object({
      events: z.array(IssueTickerEventSchema)
    }),
    expandingTimeline: z.object({
      events: z.array(IssueTimelineEventSchema),
      summary: z.string().nullable(),
      activityLevel: z.enum(['low', 'medium', 'high']).nullable(),
      dominantSentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).nullable(),
      activityBuckets: z.array(IssueActivityBucketSchema),
      activityStats: IssueActivityStatsSchema.nullable()
    }),
    fearGreed: z.object({
      data: DailyFearGreedSchema.nullable(),
      dateRange: z.object({
        oldestDate: z.string(),
        newestDate: z.string(),
        todayMessageCount: z.number()
      }).nullable()
    }),
    traderLeaderboard: z.object({
      data: LeaderboardResponseSchema.nullable(),
      updatedAt: z.string().nullable(),
      range: z.object({
        startDate: z.string(),
        endDate: z.string(),
        cacheKey: z.string()
      }).nullable()
    }),
    activeChatters: z.object({
      users: z.array(ActiveChatterSchema)
    }),
    sidebarHighlights: z.object({
      topContributors: z.array(z.object({
        username: z.string(),
        initial: z.string(),
        avatar: z.string().optional()
      })),
      trendingTopics: z.array(z.string()),
      shortNews: z.array(ShortNewsSchema)
    }),
    custom: z.record(z.string(), z.unknown())
  }),
  resources: z.object({
    counts: z.object({
      newspaperMessages: z.number(),
      tickerMessages: z.number(),
      timelineMessages: z.number(),
      fearGreedMessages: z.number(),
      newspaperUsers: z.number(),
      tickerUsers: z.number(),
      timelineUsers: z.number(),
      fearGreedUsers: z.number(),
      traderLeaderboardMessages: z.number(),
      traderLeaderboardUsers: z.number()
    }),
    ranges: z.record(z.string(), z.object({
      startDate: z.string(),
      endDate: z.string(),
      cacheKey: z.string()
    }).nullable()),
    aiUsage: NewspaperAIUsageSchema.nullable().optional()
  })
})

export type NewspaperIssueModuleKey = keyof NewspaperIssueModules
export type NewspaperIssueTickerEvent = z.infer<typeof IssueTickerEventSchema>
export type NewspaperIssueTimelineEvent = z.infer<typeof IssueTimelineEventSchema>
export type NewspaperIssueActivityBucket = z.infer<typeof IssueActivityBucketSchema>
export type NewspaperIssueActivityStats = z.infer<typeof IssueActivityStatsSchema>

export type NewspaperIssueModules = {
  articleDigest: { data: z.infer<typeof UnifiedNewspaperSchema> | null }
  tickerBanner: { events: NewspaperIssueTickerEvent[] }
  expandingTimeline: {
    events: NewspaperIssueTimelineEvent[]
    summary: string | null
    activityLevel: 'low' | 'medium' | 'high' | null
    dominantSentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' | null
    activityBuckets: NewspaperIssueActivityBucket[]
    activityStats: NewspaperIssueActivityStats | null
  }
  fearGreed: {
    data: z.infer<typeof DailyFearGreedSchema> | null
    dateRange: { oldestDate: string; newestDate: string; todayMessageCount: number } | null
  }
  traderLeaderboard: {
    data: z.infer<typeof LeaderboardResponseSchema> | null
    updatedAt: string | null
    range: { startDate: string; endDate: string; cacheKey: string } | null
  }
  activeChatters: { users: z.infer<typeof ActiveChatterSchema>[] }
  sidebarHighlights: {
    topContributors: Array<{ username: string; initial: string; avatar?: string }>
    trendingTopics: string[]
    shortNews: z.infer<typeof ShortNewsSchema>[]
  }
  custom: Record<string, unknown>
}

export interface NewspaperModuleDefinition<TOutput = unknown> {
  id: string
  version: string
  title: string
  description: string
  resourceNeeds: ResourceNeed[]
  outputSchema: z.ZodType<TOutput>
  prompt: ModulePromptBuilder
  cache: ModuleCachePolicy
  standaloneRoute?: string
  render?: React.ComponentType<{ data: TOutput; issue: NewspaperIssue }>
  legacyAdapter?: (output: TOutput) => unknown
}

export interface Connector<TParams = unknown, TResult = unknown> {
  id: string
  kind: ResourceKind
  fetch(params: TParams): Promise<TResult>
}
