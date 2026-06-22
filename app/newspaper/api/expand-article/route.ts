/**
 * route.ts (expand-article API)
 * 
 * AI-powered article expansion endpoint using OpenAI GPT-5.2.
 * 
 * LOCAL: Handles POST requests to generate full-length articles from short summaries.
 * Takes the article context (headline, summary, category, etc.) and the original chat
 * messages to generate a comprehensive, well-structured article.
 * 
 * GLOBAL: Called by the article detail page to generate expanded content on-the-fly.
 * Returns streaming JSON with the full article content.
 * 
 * ENDPOINT: POST /newspaper/api/expand-article
 * 
 * REQUEST BODY:
 * - articleType: 'featured' | 'secondary' | 'more' | 'event'
 * - headline: string - The article headline
 * - summary: string - The short summary to expand
 * - category: string - Article category
 * - author?: string - Original author
 * - contributors?: string[] - Contributing users
 * - quote?: { from: string, text: string } - Featured quote
 * - selectedDate: string - Date for fetching chat context
 * - dayRange?: number - Number of days (1, 3, or 7)
 * 
 * RESPONSE: Streaming JSON with expanded article content
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'
import { addDaysToDateKey, getNewspaperDayBounds } from '../../lib/timezone'

/**
 * Schema for chart/image references
 */
const ChartImageSchema = z.object({
  url: z.string().describe('Die vollständige URL zum Chart/Bild (TradingView S3 oder Snapshot URL)'),
  caption: z.string().describe('Kurze Beschreibung was der Chart zeigt'),
  author: z.string().nullable().describe('Username der den Chart geteilt hat, oder null falls unbekannt')
})

/**
 * Schema for quotes with styling info
 */
const StyledQuoteSchema = z.object({
  text: z.string().describe('Der Zitattext'),
  from: z.string().describe('Username des Zitierten'),
  context: z.string().nullable().describe('Kurzer Kontext zum Zitat, z.B. "zur Frage ob BTC 100K erreicht", oder null'),
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'humor']).nullable().describe('Stimmung des Zitats, oder null')
})

/**
 * Schema for expanded article content
 */
const ExpandedArticleSchema = z.object({
  title: z.string().describe('Kurzer, prägnanter Titel'),
  subtitle: z.string().describe('Ein Satz Untertitel'),
  
  // Header/Hero Image
  headerImage: ChartImageSchema.nullable().describe('Hauptbild - nur wenn Chart im Chat geteilt wurde, sonst null'),
  
  introduction: z.string().describe('KURZ! Max 2 Sätze Einleitung'),
  
  // Featured quote at the top
  featuredQuote: StyledQuoteSchema.nullable().describe('Das beste Zitat - wird prominent angezeigt, sonst null'),
  
  sections: z.array(z.object({
    heading: z.string().describe('Kurze Überschrift'),
    content: z.string().describe('KURZ! Max 3-4 Sätze pro Abschnitt'),
    quote: StyledQuoteSchema.nullable().describe('Ein gutes Zitat, sonst null'),
    inlineImage: ChartImageSchema.nullable().describe('Chart falls relevant, sonst null')
  })).min(2).max(3).describe('2-3 kurze Abschnitte'),
  
  keyTakeaways: z.array(z.string()).min(2).max(3).describe('2-3 kurze Bullet Points'),
  
  conclusion: z.string().describe('KURZ! Max 2 Sätze Fazit'),
  
  relatedTopics: z.array(z.string()).min(2).max(3).describe('2-3 verwandte Themen'),
  
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).describe('Stimmung'),
  
  mentionedUsers: z.array(z.object({
    username: z.string(),
    role: z.string().describe('Rolle: Analyst, Kritiker, etc.')
  })).min(1).max(4).describe('Beteiligte User'),
  
  // Additional images gallery
  chartGallery: z.array(ChartImageSchema).max(2).nullable().describe('Max 2 weitere Charts, sonst null')
})

export type ExpandedArticleData = z.infer<typeof ExpandedArticleSchema>

/**
 * System prompt for article expansion
 */
const EXPAND_ARTICLE_PROMPT = `Du bist Redakteur der "Financial Retarded Times" – einem Community-Marktbericht im Blog-Stil.

AUFGABE: Erweitere die kurze Zusammenfassung zu einem KURZEN, prägnanten Artikel. Du hast Zugriff auf den Original-Chat.

═══════════════════════════════════════════════════════════════════════
⛔ ABSOLUT IGNORIEREN – RATE CHART GAME TIPPS
═══════════════════════════════════════════════════════════════════════
Die Community hat ein Preisspiel. Tipps werden im Format "//PREIS" gepostet.

IGNORIERE KOMPLETT alle Nachrichten die mit // beginnen und einen Preis enthalten:
• //88.5k, //95000, //92.3K, //100k, //89900, //88000, etc.

Diese "//"-Tipps sind STRENG VERTRAULICH – NIEMALS erwähnen oder zitieren!
Auch nicht als "konkrete Preislevels" oder "angedeutete Preise" umschreiben!

✅ ERLAUBT: Normale Diskussionen über Preise, Analysen
⛔ VERBOTEN: Alles was mit "//" + Preis beginnt
═══════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════
⚠️ WICHTIG: HALTE DICH KURZ!
═══════════════════════════════════════════════════════════════════════

• Einleitung: MAX 2 Sätze
• Jede Section: MAX 3-4 Sätze pro content
• Fazit: MAX 2 Sätze
• Lieber prägnant als ausschweifend!
• Qualität > Quantität

═══════════════════════════════════════════════════════════════════════
STRUKTUR
═══════════════════════════════════════════════════════════════════════

• Einleitung: 1-2 Sätze Kontext
• 2-3 kurze Abschnitte: Je ein Aspekt, ein gutes Zitat
• Key Takeaways: 2-3 Bullet Points
• Fazit: 1-2 Sätze

TON & HALTUNG:
• Analytisch und knapp
• Neutral bei Meinungsverschiedenheiten
• Konkrete Zahlen wenn möglich
• Kein Fülltext!

═══════════════════════════════════════════════════════════════════════
ZITATE - WICHTIG!
═══════════════════════════════════════════════════════════════════════

• Nutze echte Zitate aus dem Chat - NICHT erfinden!
• Jedes Zitat hat: text, from (username), context und sentiment
• Wenn context oder sentiment nicht passt: null setzen
• sentiment: "bullish" | "bearish" | "neutral" | "humor"
• Das featuredQuote ist das beste Zitat - wird groß und prominent angezeigt
• Zitate in sections ergänzen den Inhalt, nicht nur füllen

═══════════════════════════════════════════════════════════════════════
CHARTS & BILDER - EXTREM WICHTIG!!!
═══════════════════════════════════════════════════════════════════════

Oben findest du eine Liste "VERFÜGBARE CHARTS" mit S3-URLs.

⚠️⚠️⚠️ KOPIERE DIE URLs BUCHSTABE FÜR BUCHSTABE! ⚠️⚠️⚠️

Beispiel aus der Liste:
  [10:30] kultr: https://s3.tradingview.com/snapshots/o/oJtjLzGE.png

Dann schreibst du:
  headerImage: {
    url: "https://s3.tradingview.com/snapshots/o/oJtjLzGE.png",  ← EXAKT SO!
    caption: "Chart von kultr",
    author: "kultr"
  }

❌ NIEMALS URLs selbst konstruieren oder verändern!
❌ NIEMALS "s3.tradingview.com/x/..." schreiben!
❌ NIEMALS URLs abkürzen oder zusammenbauen!
✅ NUR Copy-Paste der EXAKTEN URL aus der Liste!

Wenn keine Charts in der Liste sind → headerImage, inlineImage, chartGallery auf null setzen!

COMMUNITY-FOKUS:
• Erwähne die beteiligten User und ihre Rollen
• Fange die Dynamik der Diskussion ein
• Beef neutral berichten – beide Seiten zu Wort kommen lassen

❌ VERMEIDE:
• Erfundene Zitate, Fakten oder URLs
• Übertriebene Dramatisierung
• Partei ergreifen bei Meinungsverschiedenheiten
• Cringe-Phrasen wie "MEGA!", "EPISCH!", "DRAMA!"
• Humor erklären oder forcieren
• ⛔ "//PREIS" TIPPS (Rate Chart Game) – NIEMALS erwähnen!

═══════════════════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════════════════

Erstelle einen strukturierten Artikel der:
1. Das Thema vertieft und Kontext liefert
2. Verschiedene Perspektiven aus dem Chat einbezieht
3. Mit echten Zitaten untermauert ist (mit sentiment!)
4. Charts aus dem Chat einbindet (nur echte URLs!)
5. Klare Takeaways bietet
6. Die Community-Dynamik einfängt`

/**
 * Chat message with optional meta data
 */
interface ChatMessageWithMeta {
  username: string
  text: string
  time: string
  meta?: {
    type?: string
    url?: string
    preview_url?: string
  }
}

/**
 * Extract chart URLs from message text and meta
 * Only returns direct S3 URLs that we know will work
 */
function extractChartUrls(message: ChatMessageWithMeta): string[] {
  const urls: string[] = []
  
  // Check meta data for direct S3 URLs (these are the most reliable)
  if (message.meta?.url && message.meta.url.includes('s3.tradingview.com/')) {
    urls.push(message.meta.url)
  }
  if (message.meta?.preview_url && message.meta.preview_url.includes('s3.tradingview.com/')) {
    urls.push(message.meta.preview_url)
  }
  
  // Extract direct S3 URLs from text (most reliable)
  const urlRegex = /https?:\/\/[^\s]+/g
  const textUrls = message.text.match(urlRegex) || []
  
  for (const url of textUrls) {
    // ONLY include direct S3 snapshot URLs - these work reliably
    if (url.includes('s3.tradingview.com/snapshots/') && !url.includes('_thumb')) {
      urls.push(url)
    }
  }
  
  return [...new Set(urls)] // Remove duplicates
}

/**
 * Fetch chat messages for context
 */
async function fetchChatContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  date: string,
  dayRange: number = 1
): Promise<{ 
  messages: ChatMessageWithMeta[]
  uniqueUsers: number
  chartUrls: { url: string; username: string; time: string }[]
}> {
  const messages: ChatMessageWithMeta[] = []
  
  // Calculate date range
  const dates: string[] = [date]
  if (dayRange > 1) {
    for (let i = 1; i < dayRange; i++) {
      dates.push(addDaysToDateKey(date, -i))
    }
  }
  
  // Fetch messages for all dates (including meta for chart URLs)
  for (const d of dates) {
    const { startDate, endDate } = getNewspaperDayBounds(d)
    
    const { data, error } = await supabase
      .from('tv_chat_messages')
      .select('username, text, time, meta')
      .gte('time', startDate.toISOString())
      .lte('time', endDate.toISOString())
      .order('time', { ascending: true })
      .limit(1000)
    
    if (!error && data) {
      messages.push(...data)
    }
  }
  
  // Sort chronologically
  messages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  
  const uniqueUsers = new Set(messages.map(m => m.username)).size
  
  // Extract all chart URLs with their authors
  const chartUrls: { url: string; username: string; time: string }[] = []
  for (const msg of messages) {
    const urls = extractChartUrls(msg)
    for (const url of urls) {
      chartUrls.push({ url, username: msg.username, time: msg.time })
    }
  }
  
  return { messages, uniqueUsers, chartUrls }
}

/**
 * POST handler for article expansion
 */
export async function POST(request: NextRequest) {
  await headers()
  
  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  try {
    // Parse request body
    const body = await request.json()
    const {
      articleType,
      headline,
      summary,
      category,
      author,
      contributors,
      quote,
      selectedDate,
      dayRange = 1
    } = body
    
    if (!headline || !summary || !selectedDate) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: headline, summary, selectedDate' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Initialize Supabase client
    const supabase = await createClient()
    
    // Fetch chat context
    const { messages, uniqueUsers, chartUrls } = await fetchChatContext(supabase, selectedDate, dayRange)
    
    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No chat messages found for context' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Format messages for AI prompt
    const formattedChat = messages.map(msg => {
      const time = new Date(msg.time).toLocaleString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Europe/Berlin'
      })
      return `[${time}] ${msg.username}: ${msg.text}`
    }).join('\n')
    
    // Format chart URLs for AI - make it super clear these are the ONLY valid URLs
    const formattedCharts = chartUrls.length > 0 
      ? chartUrls.map((c, i) => {
          return `CHART ${i + 1}:\n  URL: ${c.url}\n  Author: ${c.username}`
        }).join('\n\n')
      : 'KEINE CHARTS VERFÜGBAR - keine Bilder verwenden!'
    
    // Build context string
    const articleContext = `
═══════════════════════════════════════════════════════════════════════
ARTIKEL ZUM ERWEITERN
═══════════════════════════════════════════════════════════════════════
Typ: ${articleType}
Kategorie: ${category}
Headline: ${headline}
Summary: ${summary}
${author ? `Autor: ${author}` : ''}
${contributors && contributors.length > 0 ? `Beteiligte: ${contributors.join(', ')}` : ''}
${quote ? `Zitat: "${quote.text}" – ${quote.from}` : ''}

═══════════════════════════════════════════════════════════════════════
⚠️ VERFÜGBARE CHART-URLS ZUM KOPIEREN (${chartUrls.length} gefunden)
═══════════════════════════════════════════════════════════════════════

${formattedCharts}

⚠️ WICHTIG: Kopiere die URLs EXAKT wie oben gezeigt!
⚠️ Erfinde KEINE eigenen URLs - nur diese hier funktionieren!

═══════════════════════════════════════════════════════════════════════
ORIGINAL CHAT-PROTOKOLL (${messages.length} Nachrichten von ${uniqueUsers} Usern)
═══════════════════════════════════════════════════════════════════════

${formattedChat}

═══════════════════════════════════════════════════════════════════════
AUFGABE
═══════════════════════════════════════════════════════════════════════

Erweitere die obige Zusammenfassung zu einem vollständigen Artikel.
- Nutze echte Zitate aus dem Chat-Protokoll
- Binde verfügbare Charts als Bilder ein (headerImage, inlineImage, chartGallery)
- Vertiefe das Thema mit verschiedenen Perspektiven
- Fange die Community-Dynamik ein
- Bleibe neutral bei Meinungsverschiedenheiten
`
    
    console.log(`[EXPAND-ARTICLE] 📝 Expanding: "${headline}"`)
    console.log(`[EXPAND-ARTICLE]    Type: ${articleType}, Category: ${category}`)
    console.log(`[EXPAND-ARTICLE]    Chat context: ${messages.length} messages from ${uniqueUsers} users`)
    console.log(`[EXPAND-ARTICLE]    Direct S3 chart URLs: ${chartUrls.length}`)
    if (chartUrls.length > 0) {
      console.log(`[EXPAND-ARTICLE]    URLs (only s3.tradingview.com/snapshots/...):`)
      chartUrls.slice(0, 5).forEach(c => console.log(`      ✅ ${c.url} (by ${c.username})`))
    } else {
      console.log(`[EXPAND-ARTICLE]    ⚠️ No direct S3 URLs found - article will have no images`)
    }
    
    // Stream AI response
    const result = streamObject({
      model: openai('gpt-5.4'),
      schema: ExpandedArticleSchema,
      system: EXPAND_ARTICLE_PROMPT,
      prompt: articleContext,
      providerOptions: { openai: { reasoning: { effort: 'high' } } },
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[EXPAND-ARTICLE API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

