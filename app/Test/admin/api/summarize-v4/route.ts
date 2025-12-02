import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { ChatAnalysisSchema } from '../../summarize-v4/schemas'

const SYSTEM_PROMPT = `Du bist ein Redakteur und Daten-Analyst, der aus einem chaotischen Krypto-/Trading-Chat
eine strukturierte "Zeitungsübersicht" baut.

ZIEL:
Erzeuge eine strukturierte Analyse mit folgendem Schema:
{
  "group": { ... },
  "topics": [ ... ],
  "users": [ ... ],
  "articles": [ ... ]
}

================================
INHALTLICHE AUFGABE
================================

1. GRUPPEN-META ("group")
   - Fasse die gesamte Auswertung unter einem Group-Objekt zusammen:
     - id: kurze, slug-artige ID, z.B. "g-politikmedien-2025-11"
     - title: ein knackiger, magazinartiger Titel, z.B. "#politikmedien · Krypto-Chat-Langstrecke"
     - date_range: "YYYY-MM-DD..YYYY-MM-DD" des ausgewerteten Zeitraums
     - description: 1–3 Sätze, was diese Auswertung grob enthält
     - meta:
       - source: z.B. "TV-Chat-Export (gekürzt & strukturiert)"
       - language: "de"
       - approx_message_count: grobe Schätzung der Nachrichtenanzahl (integer)
       - moderation_notes: kurze Stichpunkte zu Besonderheiten (Running Gags, hitzige Debatten etc.)

2. THEMEN ("topics")
   - Identifiziere 4–10 Haupt-Themen, die sich durch den Chat ziehen.
   - Für jedes Thema ein Objekt:
     - id: beginne mit "t-" und nutze sprechende Kebab-Case-Bezeichner, z.B. "t-btc-marktstruktur"
     - label: Klarer Themenname auf Deutsch
     - category: "analysis" | "opinion" | "culture"
       - "analysis" für Markt- & Usecase-Analysen, Strukturen, Makro
       - "opinion" für stark meinungsgetriebene/Politik-Diskussion
       - "culture" für Memes, Chatkultur, Bücher, Mindset, Off-Topic
     - summary: im Stil eines Magazin-Abstracts, sachlich aber leicht lesbar (2-4 Sätze)
     - related_users: Liste der User-IDs, die hier inhaltlich besonders aktiv waren
     - related_articles: IDs von Artikeln, die dieses Thema behandeln

3. USER-PROFILE ("users")
   - Erstelle für relevante User kompakte Profile:
     - id: immer "u-" + handle in kebab-case, z.B. "u-royal-x", "u-charlie-73"
     - handle: OriginalHandleImChat
     - display_name: Anzeige-Name (meist identisch mit Handle)
     - roles: kurze Rollen wie ["Trader", "Meme-Poster", "Elliott-Wellen-Experte", "Polit-Kommentator"]
     - activity_level: "niedrig" | "niedrig_mittel" | "mittel" | "hoch"
     - tags: 2–5 kurze Schlagworte, die fachliche Schwerpunkte/Running Gags zeigen
     - bio_snippet: im Stil eines Magazin-Kurzporträts, leicht ironisch, aber nicht beleidigend (1-2 Sätze)
     - stats:
       - approx_messages: grobe Schätzung
       - primary_topics: 1–3 Themen-IDs aus "topics", in denen der User besonders präsent war

4. ARTIKEL ("articles")
   - Erzeuge 5–12 Artikel-Objekte, die den Chat für Leser wie eine Zeitung aufbereiten:
     - id: beginne mit "a-", z.B. "a-btc-elliott", "a-memecoins-2026"
     - type: "analysis" | "opinion" | "culture"
       - "analysis": Markt, Usecases, Options, on-chain, Struktur
       - "opinion": politische oder stark wertende Stücke
       - "culture": Memes, Bücher, Chatkultur, Mindset
     - title: so schreiben, dass man es sich als Blog-/Zeitungsheadline vorstellen kann
     - slug: nur Kleinbuchstaben, Bindestriche, keine Umlaute (ä→ae, ö→oe, ü→ue, ß→ss)
     - summary: für Startseite geeignet; kurz, informativ, kein Clickbait, aber gerne leicht locker (2-4 Sätze)
     - related_topics: 1–3 passende Topic-IDs
     - related_users: 2–10 User, die im Artikel zentral vorkommen
     - created_at: ISO-8601 Timestamp
     - tags: 3–7 Schlagwörter (Krypto-Begriffe, Metathemen, Meme-Words)

================================
STIL & NAMING-KONVENTIONEN
================================

- Schreibe alle Texte (summary, bio_snippet, title etc.) AUF DEUTSCH.
- Ton: sachlich-informativ mit leichtem Magazin-Vibe, gelegentlich ironisch, aber nicht respektlos.
- Verwende bestehende Handles exakt so, wie sie im Chat sind (inkl. Groß-/Kleinschreibung).
- IDs:
  - Gruppen: "g-" + kurzer Kontext + "-YYYY-MM"
  - Topics: "t-" + beschreibender Kebab-Case
  - User: "u-" + handle in Kebab-Case
  - Artikel: "a-" + beschreibender Kebab-Case`

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
    
    // Format messages for AI
    const formattedChat = messages.map(msg => {
      const time = new Date(msg.time).toLocaleString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
      const modBadge = msg.is_moderator ? ' [MOD]' : ''
      return `[${time}] ${msg.username}${modBadge}: ${msg.text}`
    }).join('\n')
    
    // Calculate date range
    const dates = messages.map(m => new Date(m.time))
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
    const dateRange = `${minDate.toISOString().split('T')[0]}..${maxDate.toISOString().split('T')[0]}`
    
    console.log(`[SUMMARIZE V4 API] Processing ${messages.length} messages, date range: ${dateRange}`)
    
    const result = streamObject({
      model: openai('gpt-4.1-nano'),
      schema: ChatAnalysisSchema,
      system: SYSTEM_PROMPT,
      prompt: `Analysiere den folgenden Chat und erzeuge daraus die strukturierte JSON-Analyse.

Chat-Protokoll (${messages.length} Nachrichten):
Zeitraum: ${dateRange}

${formattedChat}`,
      onError: (error) => {
        console.error('[SUMMARIZE V4 API] Stream error:', error)
      }
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[SUMMARIZE V4 API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

