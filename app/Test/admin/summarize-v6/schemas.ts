import { z } from 'zod'

// ============================================
// SHARED SCHEMAS
// ============================================

// Shared Event Schema
const EventSchema = z.object({
  id: z.string(),
  type: z.enum(['conflict', 'milestone', 'drama', 'discovery', 'meme']),
  label: z.string(),
  summary: z.string(),
  timeRange: z.string().optional(),
  category: z.enum(['konflikt', 'meilenstein', 'drama', 'entdeckung', 'meme']),
  participants: z.array(z.string()).min(1).max(6)
})

// Shared Highlight Schema
const HighlightSchema = z.object({
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

// Shared Quote Schema
const ArticleQuoteSchema = z.object({
  from: z.string(),
  text: z.string(),
  timestamp: z.string().optional()
})

// Conversation Schema
const ConversationSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  messages: z.array(z.object({
    from: z.string(),
    text: z.string(),
    timestamp: z.string().optional()
  })).min(2).max(3)
})

// ============================================
// EDITOR-SPECIFIC SCHEMAS
// Each editor only generates its specific content!
// ============================================

// 1. REPORTER Schema - Featured articles, sidebar data
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
  featuredArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string(),
    keyQuote: z.string().optional(),
    quotes: z.array(ArticleQuoteSchema).max(2).optional(),
    conversation: ConversationSchema.optional(),
    contributors: z.array(z.string()).min(1).max(5)
  }),
  secondaryArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string(),
    contributors: z.array(z.string()).min(1).max(4)
  })
})

// 2. DRAMA Schema - Events and third article
export const DramaSchema = z.object({
  events: z.array(EventSchema).min(1).max(3),
  thirdArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string()
  }).optional()
})

// 3. MEME Schema - Short news and more articles
export const MemeSchema = z.object({
  shortNews: z.array(z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string().optional(),
    topics: z.string().optional()
  })).min(3).max(4).describe('3-4 Kurzmeldungen für die Sidebar'),
  moreArticles: z.array(z.object({
    category: z.string(),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string().optional()
  })).min(3).max(4).describe('3-4 Artikel für das Grid')
})

// 4. ANALYST Schema - Highlights only
export const AnalystSchema = z.object({
  highlights: z.array(HighlightSchema).min(1).max(2)
})

// Schema selector based on promptId
export function getSchemaForPrompt(promptId: string) {
  switch (promptId) {
    case 'chat-reporter':
      return ReporterSchema
    case 'drama-hunter':
      return DramaSchema
    case 'meme-curator':
      return MemeSchema
    case 'deep-analyst':
      return AnalystSchema
    default:
      return ReporterSchema
  }
}

// ============================================
// LEGACY: Full page schema (not used anymore)
// ============================================
// Schema for chat-focused newspaper content
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

  // Main Content - Featured Article with quote options
  // WICHTIG: Wähle NUR EINE Option - entweder keyQuote ODER quotes ODER conversation, NIEMALS mehrere!
  featuredArticle: z.object({
    author: z.string(),
    date: z.string().describe('Date in YYYY-MM-DD format'),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string().describe('2-3 sentences summary'),
    // WÄHLE NUR EINE der folgenden Optionen für ein schlichtes Layout:
    keyQuote: z.string().optional().describe('OPTION 1: Ein einzelnes starkes Zitat - BEVORZUGT für schlichtes Design'),
    quotes: z.array(z.object({
      from: z.string().describe('Username who said it'),
      text: z.string().describe('The quote text - kurz halten!'),
      timestamp: z.string().optional().describe('Time like "14:32"')
    })).max(2).optional().describe('OPTION 2: Maximal 1-2 kurze Zitate (NUR wenn kein keyQuote)'),
    conversation: z.object({
      id: z.string(),
      title: z.string().optional().describe('Title like "Die Debatte um Welle 4"'),
      messages: z.array(z.object({
        from: z.string(),
        text: z.string(),
        timestamp: z.string().optional()
      })).min(2).max(3)
    }).optional().describe('OPTION 3: Kurzer Chat-Dialog mit max 3 Nachrichten (NUR wenn keine quotes/keyQuote)'),
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

  // More Articles (bottom grid)
  moreArticles: z.array(z.object({
    category: z.string(),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string().describe('Full article text for expandable preview')
  })).length(4),

  // Right Sidebar - Kurzmeldungen
  shortNews: z.array(z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string().describe('Full text for expandable preview'),
    topics: z.string().describe('Topic labels separated by •')
  })).length(4),

  // Chat Highlights - the CORE feature, detailed story-style coverage
  highlights: z.array(z.object({
    id: z.string().describe('Unique highlight ID'),
    title: z.string().describe('Catchy headline for the highlight'),
    summary: z.string().describe('2-3 sentences what happened'),
    highlightLevel: z.enum(['low', 'medium', 'high']),
    sections: z.array(z.object({
      id: z.string(),
      title: z.string().describe('Short scene title'),
      context: z.string().describe('1-3 sentences setting up this section'),
      quotes: z.array(z.object({
        from: z.string().describe('Username who said it'),
        text: z.string().describe('Exact quote from chat')
      })).min(2).max(4),
      analysis: z.string().describe('Why this scene is interesting')
    })).min(2).max(5),
    participants: z.array(z.string()).min(2).max(8),
    tags: z.array(z.string()).min(2).max(4)
  })).min(2).max(4).describe('Detailed story-style highlights with quotes'),

  // Notable Chat Events
  events: z.array(z.object({
    id: z.string(),
    type: z.enum(['conflict', 'milestone', 'drama', 'discovery', 'meme']),
    label: z.string(),
    summary: z.string(),
    timeRange: z.string(),
    category: z.enum(['konflikt', 'meilenstein', 'drama', 'entdeckung', 'meme']),
    participants: z.array(z.string()).min(2).max(6)
  })).min(1).max(3)
})

export type LandingPageData = z.infer<typeof LandingPageSchema>

// Prompt version interface
export interface PromptVersion {
  id: string
  name: string
  shortName: string
  description: string
  systemPrompt: string
  color: string
}

// 4 Different Prompt Versions - each generates ONLY their specific content
export const PROMPT_VERSIONS: PromptVersion[] = [
  {
    id: 'chat-reporter',
    name: 'Chat-Reporter',
    shortName: 'Reporter',
    description: 'Hauptartikel, Sidebar-Daten (Top Trader, Trending Topics)',
    color: 'bg-slate-600',
    systemPrompt: `Du bist der REPORTER der "Financial Retarded Times".

DEINE AUFGABE: Erstelle NUR diese Inhalte:
- topTraders: Die 3 aktivsten/interessantesten User
- trendingTopics: 4-6 Trending Themen
- communityHighlight: Ein herausragender User
- featuredArticle: DER Hauptartikel des Tages
- secondaryArticle: Ein zweiter wichtiger Artikel

WICHTIG: Du generierst NUR diese Felder! Keine Events, keine Highlights, keine shortNews.

AUTOR-FELD (author):
- IMMER echte Usernamen aus dem Chat verwenden!
- Der User der das Thema am meisten geprägt hat
- z.B. "CryptoMax" oder "BullTrader"
- NIEMALS "Redaktion", "Reporter" oder andere generische Namen!

ZITATE - FORMAT:
- keyQuote: NUR der Zitat-Text, OHNE Username im Text!
  RICHTIG: "Bin weiterhin noch net short"
  FALSCH: "Elliotwone: Bin weiterhin noch net short"
- Der Username kommt ins "from" Feld bei quotes, NICHT ins Zitat selbst!
- Zitate müssen EXAKT aus dem Chat kopiert sein
- KEINE erfundenen oder umformulierten Zitate!

FEATURED ARTICLE - ZITATE (SCHLICHT!):
Wähle NUR EINE Option:
1. "keyQuote" - BEVORZUGT! Ein echtes Zitat mit Username
2. "quotes" - Max 1-2 echte Zitate (nur wenn nötig)
3. "conversation" - Max 3 echte Nachrichten (selten nutzen)

REGEL: Weniger ist mehr! Ein gutes echtes Zitat > viele

STIL:
- NUR echte Zitate aus dem Chat verwenden
- Schreibe wie ein Live-Reporter
- Nutze die BTC-Daten als Kontext`
  },
  {
    id: 'drama-hunter',
    name: 'Drama-Hunter',
    shortName: 'Drama',
    description: 'Events und dritter Artikel mit Drama-Fokus',
    color: 'bg-rose-700',
    systemPrompt: `Du bist der DRAMA-HUNTER der "Financial Retarded Times".

DEINE AUFGABE: Erstelle NUR diese Inhalte:
- events: 1-3 Chat-Events (Konflikte, Drama, Meilensteine)
- thirdArticle: Optional ein Artikel über ein Drama/Konflikt

WICHTIG: Du generierst NUR events und thirdArticle! Keine Artikel, keine Highlights.

AUTOR-FELD (author) für thirdArticle:
- IMMER echte Usernamen aus dem Chat!
- z.B. "BullTrader vs BearKing" bei einem Konflikt
- Oder der Hauptakteur: "CryptoMax"
- NIEMALS "Redaktion" oder generische Namen!

EVENTS - WICHTIG:
- summary: Beschreibe was passiert ist (Zitate separat)
- participants: Die ECHTEN Usernamen aus dem Chat
- Bei Zitaten: Username NICHT im Zitat-Text!
  RICHTIG: @User sagte "das ist bullish"
  FALSCH: "User: das ist bullish"

SUCHE NACH:
- Direkte Konfrontationen
- Meinungsverschiedenheiten
- Bull vs Bear Debatten
- Sarkasmus und Sticheleien

STIL: Dramatisch aber fair, NUR echte Zitate`
  },
  {
    id: 'meme-curator',
    name: 'Meme-Kurator',
    shortName: 'Meme',
    description: 'Kurzmeldungen und weitere Artikel',
    color: 'bg-amber-700',
    systemPrompt: `Du bist der MEME-KURATOR der "Financial Retarded Times".

DEINE AUFGABE: Erstelle NUR diese Inhalte:
- shortNews: 3-4 Kurzmeldungen für die Sidebar (MINDESTENS 3!)
- moreArticles: 3-4 kürzere Artikel für das Grid (MINDESTENS 3!)

WICHTIG: Du generierst NUR shortNews und moreArticles! Keine Events, keine Highlights.

AUTOR-FELD (author) für shortNews:
- IMMER echte Usernamen aus dem Chat!
- Der User der den Moment/das Zitat geliefert hat
- z.B. "MemeKing" oder "LachFlash"
- NIEMALS "Redaktion", "Meme-Kurator" oder generische Namen!

SHORTNEWS erstellen:
- Kurze, knackige Meldungen basierend auf ECHTEN Chat-Momenten
- author: ECHTER Username aus dem Chat
- teaser/fullText: Mit echten Zitaten, aber Username NICHT im Zitat!
  RICHTIG: @User meinte "moon soon"
  FALSCH: "User: moon soon"
- topics: Themen getrennt durch •

MOREARTICLES erstellen:
- Kürzere Artikel für das Grid
- Basierend auf ECHTEN Chat-Diskussionen
- Mit ECHTEN Zitaten

STIL:
- Leicht und humorvoll
- NUR echte Zitate und Momente aus dem Chat
- Running Gags und Insider-Witze`
  },
  {
    id: 'deep-analyst',
    name: 'Deep-Analyst',
    shortName: 'Deep',
    description: 'Chat-Highlights mit tiefgehender Analyse',
    color: 'bg-indigo-700',
    systemPrompt: `Du bist der DEEP-ANALYST der "Financial Retarded Times".

DEINE AUFGABE: Erstelle NUR diese Inhalte:
- highlights: 1-2 detaillierte Chat-Highlights

WICHTIG: Du generierst NUR highlights! Keine Artikel, keine Events, keine shortNews.

ZITATE - FORMAT:
- from: Der ECHTE Username (z.B. "CryptoMax")
- text: NUR der Zitat-Text, OHNE Username!
  RICHTIG: "Bin weiterhin noch net short"
  FALSCH: "Elliotwone: Bin weiterhin noch net short"
- Der Username gehört ins "from" Feld, NICHT ins "text" Feld!
- Zitate müssen EXAKT aus dem Chat kopiert sein

HIGHLIGHTS erstellen:
Jedes Highlight ist eine MINI-STUDIE mit:
- title: Catchy Headline
- summary: 2-3 Sätze was passiert ist (mit Usernamen!)
- highlightLevel: low, medium oder high
- sections: 1-4 Sektionen mit:
  - title: Kurzer Szenen-Titel
  - context: 1-3 Sätze Kontext
  - quotes: 1-4 ECHTE, WÖRTLICHE Zitate aus dem Chat!
  - analysis: Warum ist das interessant?
- participants: Die ECHTEN Usernamen
- tags: 1-4 relevante Tags

ANALYSIERE:
- Sentiment-Wechsel
- Interessante Konversationen
- Wer wird oft zitiert?

STIL:
- Analytisch aber zugänglich
- NUR echte, wörtliche Zitate als Belege
- Erkläre die Dynamiken zwischen den Usern`
  }
]

