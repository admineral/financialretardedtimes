import { z } from 'zod'

export const LeaderboardEntrySchema = z.object({
  rank: z.number(),
  username: z.string(),
  score: z.number().min(0).max(100),
  correctCalls: z.number(),
  wrongCalls: z.number(),
  totalCalls: z.number(),
  winRate: z.number().min(0).max(100),
  bestCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    priceTarget: z.number().nullable(),
    direction: z.enum(['bullish', 'bearish']),
    outcome: z.string(),
    timestamp: z.string()
  }),
  // OpenAI structured outputs reject optional fields — nullable instead
  worstCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    outcome: z.string(),
    timestamp: z.string()
  }).nullable(),
  callHistory: z.array(z.object({
    quote: z.string(),
    direction: z.enum(['bullish', 'bearish', 'neutral']),
    wasCorrect: z.boolean(),
    priceAtCall: z.number(),
    timestamp: z.string(),
    priceContext: z.string()
  })).max(5),
  badge: z.enum([
    'oracle',
    'analyst',
    'gambler',
    'contrarian',
    'degen',
    'diamond_hands',
    'top_signal',
    'bottom_feeder',
    'newbie'
  ]),
  badgeReason: z.string(),
  commentaryText: z.string()
})

export const LeaderboardResponseSchema = z.object({
  weekSummary: z.object({
    headline: z.string(),
    subheadline: z.string(),
    startPrice: z.number(),
    endPrice: z.number(),
    changePercent: z.number(),
    topWinner: z.string(),
    topLoser: z.string()
  }),
  leaderboard: z.array(LeaderboardEntrySchema).min(3).max(20),
  hallOfShame: z.array(z.object({
    username: z.string(),
    worstQuote: z.string(),
    priceAtCall: z.number(),
    outcome: z.string(),
    badge: z.string()
  })).max(5),
  dataRange: z.object({
    from: z.string(),
    to: z.string(),
    totalMessages: z.number(),
    uniqueTraders: z.number()
  })
})

export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>
