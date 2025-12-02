import { z } from 'zod'

// Base article schema - the default
export const TitelseiteArticleSchema = z.object({
  articles: z.array(z.object({
    headline: z.string().describe('Catchy newspaper-style headline'),
    subheadline: z.string().describe('Supporting subtitle that adds context'),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']).describe('Article category'),
    author: z.string().describe('Main contributor username from the chat'),
    contributors: z.array(z.string()).describe('Other usernames who contributed'),
    content: z.string().describe('Article content, 100-200 words'),
    keyQuote: z.string().describe('Notable quote from the chat discussion'),
    topics: z.array(z.string()).describe('Relevant hashtag topics'),
    verificationScore: z.number().min(0).max(100).describe('How well-supported the claims are'),
    date: z.string().describe('Publication date in YYYY-MM-DD format'),
    readTime: z.number().describe('Estimated read time in minutes'),
    engagement: z.object({
      readers: z.number().describe('Estimated reader count'),
      comments: z.number().describe('Comment count'),
      shares: z.number().describe('Share count')
    }).describe('Engagement metrics')
  })).min(5).max(8).describe('Generated newspaper articles')
})

// Compact schema for quick summaries
export const CompactArticleSchema = z.object({
  articles: z.array(z.object({
    headline: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    author: z.string(),
    summary: z.string().describe('2-3 sentence summary'),
    verificationScore: z.number().min(0).max(100),
  })).min(5).max(10)
})

// Extended schema with more detail
export const ExtendedArticleSchema = z.object({
  articles: z.array(z.object({
    headline: z.string(),
    subheadline: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    author: z.string(),
    contributors: z.array(z.string()),
    introduction: z.string().describe('Opening paragraph'),
    mainContent: z.string().describe('Main article body, 200-400 words'),
    conclusion: z.string().describe('Concluding thoughts'),
    keyQuotes: z.array(z.object({
      quote: z.string(),
      author: z.string()
    })),
    topics: z.array(z.string()),
    verificationScore: z.number().min(0).max(100),
    sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']),
    date: z.string(),
    readTime: z.number(),
    engagement: z.object({
      readers: z.number(),
      comments: z.number(),
      shares: z.number()
    })
  })).min(3).max(5)
})

// Schema registry
export const SCHEMA_REGISTRY = {
  titelseite: {
    name: 'Titelseite',
    description: 'Standard newspaper front page layout',
    schema: TitelseiteArticleSchema,
    articleCount: '5-8 articles'
  },
  compact: {
    name: 'Compact',
    description: 'Quick summaries, more articles',
    schema: CompactArticleSchema,
    articleCount: '5-10 articles'
  },
  extended: {
    name: 'Extended',
    description: 'Detailed articles with multiple sections',
    schema: ExtendedArticleSchema,
    articleCount: '3-5 articles'
  }
} as const

export type SchemaType = keyof typeof SCHEMA_REGISTRY
export type TitelseiteArticle = z.infer<typeof TitelseiteArticleSchema>['articles'][number]
export type CompactArticle = z.infer<typeof CompactArticleSchema>['articles'][number]
export type ExtendedArticle = z.infer<typeof ExtendedArticleSchema>['articles'][number]

