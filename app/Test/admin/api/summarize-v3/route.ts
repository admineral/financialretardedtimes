import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { TitelseiteArticleSchema, CompactArticleSchema, ExtendedArticleSchema, type SchemaType } from '../../summarize-v3/schemas'

const SCHEMA_MAP = {
  titelseite: TitelseiteArticleSchema,
  compact: CompactArticleSchema,
  extended: ExtendedArticleSchema,
} as const

const PROMPTS: Record<SchemaType, string> = {
  titelseite: `Du bist der Chefredakteur der "Financial Retarded Times", einer satirischen Krypto-Zeitung.

Erstelle 5-7 Zeitungsartikel aus dem Chat. Die Artikel sollen:
- Im Stil einer klassischen Finanzzeitung geschrieben sein
- Echte Diskussionen und Meinungen aus dem Chat aufgreifen
- Die Beitragenden namentlich erwähnen (@username Format)
- Relevante Zitate enthalten
- Verschiedene Kategorien abdecken (ANALYSE, MEINUNG, KULTUR, MARKTSTRUKTUR, ALTCOINS, BREAKING)
- Realistische Engagement-Zahlen haben (readers: 1000-50000, comments: 10-500, shares: 1-50)
- Das heutige Datum verwenden

Der erste Artikel sollte der wichtigste/interessanteste sein (Titelstory).`,

  compact: `Du bist Redakteur der "Financial Retarded Times".

Erstelle 8-10 kurze Zusammenfassungen der wichtigsten Chat-Themen.
Jede Zusammenfassung sollte 2-3 Sätze lang sein und den Kern der Diskussion erfassen.
Nenne den Hauptautor jeder Diskussion.`,

  extended: `Du bist der Chefredakteur der "Financial Retarded Times".

Erstelle 3-4 ausführliche, tiefgehende Artikel aus dem Chat.
Jeder Artikel sollte haben:
- Eine packende Einleitung
- Detaillierten Hauptteil (200-400 Wörter)
- Schlussfolgerung
- Mehrere relevante Zitate
- Sentiment-Analyse (bullish/bearish/neutral/mixed)

Konzentriere dich auf die substanziellsten Diskussionen.`,
}

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
    const { 
      schemaType = 'titelseite', 
      messageLimit = 500 
    }: { schemaType?: SchemaType; messageLimit?: number } = body
    
    const schema = SCHEMA_MAP[schemaType]
    if (!schema) {
      return new Response(
        JSON.stringify({ error: `Unknown schema type: ${schemaType}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
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
    
    const timeRange = {
      from: messages[0]?.time,
      to: messages[messages.length - 1]?.time
    }
    
    const today = new Date().toISOString().split('T')[0]
    
    console.log(`[SUMMARIZE V3 API] Processing ${messages.length} messages, schema: ${schemaType}`)
    
    const result = streamObject({
      model: openai('gpt-4.1-nano'),
      schema,
      prompt: `${PROMPTS[schemaType]}

Chat-Protokoll (${messages.length} Nachrichten):
${formattedChat}

Zeitraum: ${timeRange.from} bis ${timeRange.to}
Heutiges Datum: ${today}

Erstelle abwechslungsreiche, unterhaltsame Artikel die die echten Diskussionen widerspiegeln.`,
      onError: (error) => {
        console.error('[SUMMARIZE V3 API] Stream error:', error)
      }
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[SUMMARIZE V3 API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

