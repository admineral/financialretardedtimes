import { z } from 'zod'

// Date stats interface
export interface DateStats {
  date: string // YYYY-MM-DD
  messageCount: number
  uniqueUsers: number
}

// Shared Event Schema
export const EventSchema = z.object({
  id: z.string(),
  type: z.enum(['conflict', 'milestone', 'drama', 'discovery', 'meme']),
  label: z.string(),
  summary: z.string(),
  timeRange: z.string().optional(),
  category: z.enum(['konflikt', 'meilenstein', 'drama', 'entdeckung', 'meme']),
  participants: z.array(z.string()).min(1).max(6)
})

// Shared Highlight Schema
export const HighlightSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  highlightLevel: z.enum(['low', 'medium', 'high']),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string(),
    context: z.string(),
    quotes: z.array(z.object({
      from: z.string(),
      text: z.string()
    })).min(1).max(4),
    analysis: z.string().optional()
  })).min(1).max(4),
  participants: z.array(z.string()).min(1).max(8),
  tags: z.array(z.string()).min(1).max(4)
})

// Shared Quote Schema for articles (simplified - max 2 quotes)
export const ArticleQuoteSchema = z.object({
  from: z.string(),
  text: z.string(),
  timestamp: z.string().optional()
})

// Conversation Schema (simplified - max 3 messages)
export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  messages: z.array(z.object({
    from: z.string(),
    text: z.string(),
    timestamp: z.string().optional()
  })).min(2).max(3)
})

// 1. REPORTER Schema
export const ReporterSchema = z.object({
  topTraders: z.array(z.object({
    username: z.string(),
    initial: z.string().max(1)
  })).length(3),
  trendingTopics: z.array(z.string()).min(4).max(6),
  communityHighlight: z.object({
    username: z.string(),
    contributionCount: z.number(),
    label: z.string()
  }),
  // WICHTIG: Nur EINE Quote-Option nutzen (keyQuote ODER quotes ODER conversation)
  featuredArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string(),
    keyQuote: z.string().optional(), // BEVORZUGT: Ein einzelnes Zitat
    quotes: z.array(ArticleQuoteSchema).max(2).optional(), // Max 2 Zitate
    conversation: ConversationSchema.optional(), // Max 3 Nachrichten
    contributors: z.array(z.string()).min(1).max(5)
  }),
  secondaryArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string(),
    contributors: z.array(z.string()).min(1).max(4)
  }),
  events: z.array(EventSchema).optional()
})

// 2. DRAMA Schema
export const DramaSchema = z.object({
  events: z.array(EventSchema).min(1).max(3),
  thirdArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string()
  }).optional(),
  highlights: z.array(HighlightSchema).optional()
})

// 3. MEME Schema
export const MemeSchema = z.object({
  shortNews: z.array(z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string().optional(),
    topics: z.string().optional()
  })).min(3).max(4),
  moreArticles: z.array(z.object({
    category: z.string(),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string().optional()
  })).min(3).max(4)
})

// 4. ANALYST Schema
export const AnalystSchema = z.object({
  highlights: z.array(HighlightSchema).min(1).max(2),
  events: z.array(EventSchema).optional()
})

// Type definitions
export type ReporterData = z.infer<typeof ReporterSchema>
export type DramaData = z.infer<typeof DramaSchema>
export type MemeData = z.infer<typeof MemeSchema>
export type AnalystData = z.infer<typeof AnalystSchema>
export type EventType = z.infer<typeof EventSchema>
export type HighlightType = z.infer<typeof HighlightSchema>

