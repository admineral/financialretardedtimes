import { z } from 'zod'

// Schema matching the exact landing page structure
export const LandingPageSchema = z.object({
  // Left Sidebar Data
  topTraders: z.array(z.object({
    username: z.string(),
    initial: z.string().max(1)
  })).length(3).describe('Top 3 traders/contributors'),
  
  trendingTopics: z.array(z.string()).min(4).max(6).describe('Trending hashtag topics without #'),
  
  communityHighlight: z.object({
    username: z.string(),
    contributionCount: z.number(),
    label: z.string().describe('e.g. "Qualitätsbeiträge"')
  }),

  // Main Content - Featured Article
  featuredArticle: z.object({
    author: z.string(),
    date: z.string().describe('Date in YYYY-MM-DD format'),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string().describe('2-3 sentences summary'),
    keyQuote: z.string(),
    contributors: z.array(z.string()).min(2).max(5)
  }),

  // Secondary Article
  secondaryArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string(),
    contributors: z.array(z.string()).min(2).max(4)
  }),

  // Third Article
  thirdArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string()
  }),

  // Fourth Article
  fourthArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string()
  }),

  // Fifth Article
  fifthArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string()
  }),

  // More Articles (bottom grid)
  moreArticles: z.array(z.object({
    category: z.string(),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string().describe('Full article text for expandable preview')
  })).length(4),

  // Right Sidebar - Kurzmeldungen (4 statt 2)
  shortNews: z.array(z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string().describe('Full text for expandable preview'),
    topics: z.string().describe('Topic labels separated by •')
  })).length(4),

  // Events - notable moments/conflicts in the chat
  events: z.array(z.object({
    id: z.string().describe('Unique event ID like e-btc-debate'),
    type: z.enum(['conflict', 'milestone', 'drama', 'discovery', 'meme']),
    label: z.string().describe('Short catchy title'),
    summary: z.string().describe('2-3 sentences describing what happened'),
    timeRange: z.string().describe('Time range like "18:10 - 18:40"'),
    category: z.enum(['konflikt', 'meilenstein', 'drama', 'entdeckung', 'meme']),
    participants: z.array(z.string()).min(2).max(6).describe('Usernames involved')
  })).min(1).max(3).describe('Notable events/conflicts from the chat'),

  // Chat Highlights - detailed story-style coverage of notable chat moments
  highlights: z.array(z.object({
    id: z.string().describe('Unique highlight ID like h-btc-88-highlight'),
    title: z.string().describe('Catchy headline for the highlight'),
    summary: z.string().describe('2-3 sentences what happened and why its notable'),
    highlightLevel: z.enum(['low', 'medium', 'high']),
    sections: z.array(z.object({
      id: z.string().describe('Section ID like sec-einstieg'),
      title: z.string().describe('Short scene title'),
      context: z.string().describe('1-3 sentences setting up this section'),
      quotes: z.array(z.object({
        from: z.string().describe('Username who said it'),
        text: z.string().describe('Exact quote from chat, 1-2 sentences max')
      })).min(2).max(4),
      analysis: z.string().describe('1-3 sentences explaining why this scene is interesting')
    })).min(2).max(5),
    participants: z.array(z.string()).min(2).max(8),
    tags: z.array(z.string()).min(2).max(4).describe('Tags like Highlight, Konflikt, Meme, Meta, Markt')
  })).min(1).max(2).describe('Detailed story-style highlights with quotes and analysis')
})

export type LandingPageData = z.infer<typeof LandingPageSchema>

