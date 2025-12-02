import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { LandingPageSchema } from '../../summarize-v5/schemas'

const SYSTEM_PROMPT = `Du bist der Chefredakteur der "Financial Retarded Times", einer satirischen Krypto-Zeitung.

Analysiere den Chat und erstelle Inhalte für die Titelseite im exakten Format:

1. TOP TRADER (topTraders): Die 3 aktivsten/einflussreichsten User
2. TRENDING TOPICS (trendingTopics): 4-6 Hashtag-Themen (ohne #)
3. COMMUNITY HIGHLIGHT (communityHighlight): Top-Beitragender der Woche
4. FEATURED ARTICLE (featuredArticle): Hauptartikel - das wichtigste Thema
5. SECONDARY ARTICLE (secondaryArticle): Zweiter Artikel
6. THIRD ARTICLE (thirdArticle): Dritter Artikel  
7. FOURTH ARTICLE (fourthArticle): Vierter Artikel
8. FIFTH ARTICLE (fifthArticle): Fünfter Artikel
9. MORE ARTICLES (moreArticles): 4 kurze Teaser-Artikel mit teaser UND fullText (längerer Text zum Aufklappen)
10. SHORT NEWS (shortNews): 4 Kurzmeldungen für die Sidebar mit teaser UND fullText (längerer Text zum Aufklappen)
11. EVENTS (events): 1-3 bemerkenswerte Ereignisse/Konflikte aus dem Chat
12. HIGHLIGHTS (highlights): 1-2 detaillierte Story-Highlights mit echten Chat-Zitaten

EVENTS:
- Finde interessante Momente: Konflikte, Meilensteine, Drama, Entdeckungen, Memes
- Jedes Event braucht: id, type, label, summary, timeRange, category, participants
- Types: conflict, milestone, drama, discovery, meme
- Kategorien: konflikt, meilenstein, drama, entdeckung, meme

HIGHLIGHTS (WICHTIG!):
Für besonders markante Chat-Momente erstelle detaillierte Story-Highlights:
- Fokus auf KONKRETE Chat-Szenen und echte Zitate der Nutzer
- Erzähle wie ein Reporter, der den Chat nacherzählt
- Jedes Highlight hat mehrere Sektionen mit:
  - context: Was passiert in dieser Szene?
  - quotes: 2-4 ECHTE Zitate aus dem Chat (exakt wie geschrieben!)
  - analysis: Warum ist diese Szene interessant?
- highlightLevel: low/medium/high je nach Intensität
- tags: z.B. ["Highlight", "Konflikt"], ["Highlight", "Meme"], ["Highlight", "Meta"]
- Nutze NUR Zitate die wirklich im Chat stehen!

STIL:
- Deutsch, Zeitungsstil mit Augenzwinkern
- Echte Usernames aus dem Chat verwenden
- Kategorien: ANALYSE, MEINUNG, KULTUR, MARKTSTRUKTUR, ALTCOINS, BREAKING

Kategorien-Empfehlung:
- ANALYSE: Marktstruktur, Elliott-Wellen, technische Analyse
- MEINUNG: Persönliche Einschätzungen, Kritik, Kommentare
- KULTUR: Memes, Off-Topic, Chatkultur, Bücher
- MARKTSTRUKTUR: Makro, Indizes, Korrelationen
- ALTCOINS: Altcoin-Diskussionen, Usecases
- BREAKING: Aktuelle wichtige Entwicklungen`

export async function POST(request: NextRequest) {
  await headers()
  
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  try {
    const body = await request.json()
    const { messageLimit = 500 }: { messageLimit?: number } = body
    
    const supabase = await createClient()
    
    const { data: messages, error } = await supabase
      .from('tv_chat_messages')
      .select('username, text, time, is_moderator')
      .order('time', { ascending: true })
      .limit(messageLimit)
    
    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }
    
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No messages found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const formattedChat = messages.map(msg => {
      const time = new Date(msg.time).toLocaleString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
      })
      const modBadge = msg.is_moderator ? ' [MOD]' : ''
      return `[${time}] ${msg.username}${modBadge}: ${msg.text}`
    }).join('\n')
    
    const today = new Date().toISOString().split('T')[0]
    
    console.log(`[SUMMARIZE V5 API] Processing ${messages.length} messages`)
    
    const result = streamObject({
      model: openai('gpt-4.1-nano'),
      schema: LandingPageSchema,
      system: SYSTEM_PROMPT,
      prompt: `Analysiere den folgenden Chat und erstelle die Titelseiten-Inhalte.

Heutiges Datum: ${today}
Chat-Protokoll (${messages.length} Nachrichten):

${formattedChat}`,
      onError: (error) => {
        console.error('[SUMMARIZE V5 API] Stream error:', error)
      }
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[SUMMARIZE V5 API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

