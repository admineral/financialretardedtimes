/**
 * route.ts (expand-article API)
 * 
 * AI-powered article expansion endpoint using OpenAI GPT-5.
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

/**
 * Schema for expanded article content
 */
const ExpandedArticleSchema = z.object({
  title: z.string().describe('Der Artikel-Titel (kann vom Original abweichen)'),
  subtitle: z.string().describe('Ein prägnanter Untertitel'),
  
  introduction: z.string().describe('Einleitender Absatz, 2-3 Sätze, der den Kontext setzt'),
  
  sections: z.array(z.object({
    heading: z.string().describe('Überschrift des Abschnitts'),
    content: z.string().describe('Der Inhalt des Abschnitts, 2-4 Absätze'),
    quote: z.object({
      text: z.string(),
      from: z.string()
    }).optional().describe('Optionales Zitat aus dem Chat')
  })).min(2).max(4).describe('Die Hauptabschnitte des Artikels'),
  
  keyTakeaways: z.array(z.string()).min(2).max(4).describe('Die wichtigsten Erkenntnisse als Bullet Points'),
  
  conclusion: z.string().describe('Abschließender Absatz mit Fazit'),
  
  relatedTopics: z.array(z.string()).min(2).max(4).describe('Verwandte Themen die im Chat diskutiert wurden'),
  
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).describe('Allgemeine Stimmung im Chat zu diesem Thema'),
  
  mentionedUsers: z.array(z.object({
    username: z.string(),
    role: z.string().describe('z.B. "Hauptanalyst", "Kritiker", "Moderator"')
  })).min(1).max(6).describe('Beteiligte User mit ihrer Rolle in der Diskussion')
})

export type ExpandedArticleData = z.infer<typeof ExpandedArticleSchema>

/**
 * System prompt for article expansion
 */
const EXPAND_ARTICLE_PROMPT = `Du bist Redakteur der "Financial Retarded Times" – einem Community-Marktbericht im Blog-Stil.

AUFGABE: Erweitere die kurze Zusammenfassung zu einem vollständigen Artikel. Du hast Zugriff auf den Original-Chat, aus dem die Zusammenfassung erstellt wurde.

═══════════════════════════════════════════════════════════════════════
STIL-RICHTLINIEN
═══════════════════════════════════════════════════════════════════════

STRUKTUR:
• Einleitung: Setze den Kontext, warum dieses Thema relevant ist
• 2-4 Hauptabschnitte: Vertiefe verschiedene Aspekte des Themas
• Jeder Abschnitt kann ein prägnantes Zitat aus dem Chat enthalten
• Key Takeaways: Die wichtigsten Punkte auf einen Blick
• Fazit: Was bedeutet das für die Community?

TON & HALTUNG:
• Analytisch, aber zugänglich – keine trockene Wissenschaft
• Neutral bei Meinungsverschiedenheiten – beide Seiten darstellen
• Trocken statt aufgeregt – Humor durch Understatement
• Konkrete Zahlen und Fakten wenn möglich
• Unsicherheiten benennen: "könnte", "potenziell", "falls sich bestätigt"

ZITATE:
• Nutze echte Zitate aus dem Chat
• Zitate sollten die Diskussion bereichern, nicht nur füllen
• Formatierung: *"Zitat hier"* – Username

COMMUNITY-FOKUS:
• Erwähne die beteiligten User und ihre Rollen
• Fange die Dynamik der Diskussion ein
• Beef neutral berichten – beide Seiten zu Wort kommen lassen

❌ VERMEIDE:
• Erfundene Zitate oder Fakten
• Übertriebene Dramatisierung
• Partei ergreifen bei Meinungsverschiedenheiten
• Cringe-Phrasen wie "MEGA!", "EPISCH!", "DRAMA!"
• Humor erklären oder forcieren

═══════════════════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════════════════

Erstelle einen strukturierten Artikel der:
1. Das Thema vertieft und Kontext liefert
2. Verschiedene Perspektiven aus dem Chat einbezieht
3. Mit echten Zitaten untermauert ist
4. Klare Takeaways bietet
5. Die Community-Dynamik einfängt`

/**
 * Fetch chat messages for context
 */
async function fetchChatContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  date: string,
  dayRange: number = 1
): Promise<{ messages: { username: string; text: string; time: string }[]; uniqueUsers: number }> {
  const messages: { username: string; text: string; time: string }[] = []
  
  // Calculate date range
  const dates: string[] = [date]
  if (dayRange > 1) {
    const startDate = new Date(date)
    for (let i = 1; i < dayRange; i++) {
      const prevDate = new Date(startDate)
      prevDate.setDate(prevDate.getDate() - i)
      dates.push(prevDate.toISOString().split('T')[0])
    }
  }
  
  // Fetch messages for all dates
  for (const d of dates) {
    const startOfDay = `${d}T00:00:00.000Z`
    const endOfDay = `${d}T23:59:59.999Z`
    
    const { data, error } = await supabase
      .from('tv_chat_messages')
      .select('username, text, time')
      .gte('time', startOfDay)
      .lte('time', endOfDay)
      .order('time', { ascending: true })
      .limit(1000)
    
    if (!error && data) {
      messages.push(...data)
    }
  }
  
  // Sort chronologically
  messages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  
  const uniqueUsers = new Set(messages.map(m => m.username)).size
  
  return { messages, uniqueUsers }
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
    const { messages, uniqueUsers } = await fetchChatContext(supabase, selectedDate, dayRange)
    
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
        month: '2-digit'
      })
      return `[${time}] ${msg.username}: ${msg.text}`
    }).join('\n')
    
    // Build context string
    let articleContext = `
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
ORIGINAL CHAT-PROTOKOLL (${messages.length} Nachrichten von ${uniqueUsers} Usern)
═══════════════════════════════════════════════════════════════════════

${formattedChat}

═══════════════════════════════════════════════════════════════════════
AUFGABE
═══════════════════════════════════════════════════════════════════════

Erweitere die obige Zusammenfassung zu einem vollständigen Artikel.
- Nutze echte Zitate aus dem Chat-Protokoll
- Vertiefe das Thema mit verschiedenen Perspektiven
- Fange die Community-Dynamik ein
- Bleibe neutral bei Meinungsverschiedenheiten
`
    
    console.log(`[EXPAND-ARTICLE] 📝 Expanding: "${headline}"`)
    console.log(`[EXPAND-ARTICLE]    Type: ${articleType}, Category: ${category}`)
    console.log(`[EXPAND-ARTICLE]    Chat context: ${messages.length} messages from ${uniqueUsers} users`)
    
    // Stream AI response
    const result = streamObject({
      model: openai('gpt-5.1'),
      schema: ExpandedArticleSchema,
      system: EXPAND_ARTICLE_PROMPT,
      maxOutputTokens: 4096,
      prompt: articleContext,
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


