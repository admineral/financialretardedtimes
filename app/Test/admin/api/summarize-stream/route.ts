import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

// Schema for structured article output
export const ArticleSchema = z.object({
  articles: z.array(z.object({
    headline: z.string().describe('Catchy newspaper-style headline for the article'),
    subheadline: z.string().describe('Supporting subtitle that adds context'),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']).describe('Article category'),
    author: z.string().describe('Main contributor username from the chat'),
    contributors: z.array(z.string()).describe('Other usernames who contributed to this topic'),
    summary: z.string().describe('2-3 sentence summary of the article content'),
    fullContent: z.string().describe('Full article content in newspaper style, 150-300 words'),
    keyQuote: z.string().describe('Notable quote from the chat discussion'),
    topics: z.array(z.string()).describe('Relevant hashtag topics'),
    verificationScore: z.number().min(0).max(100).describe('How well-supported the claims are based on chat discussion'),
  })).min(3).max(7).describe('Generated newspaper articles based on chat content')
})

// Schema for simple summary
export const SummarySchema = z.object({
  overview: z.string().describe('High-level overview of what was discussed'),
  mainTopics: z.array(z.object({
    topic: z.string(),
    description: z.string(),
    participants: z.array(z.string())
  })).describe('Main topics discussed'),
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).describe('Overall market sentiment'),
  activeUsers: z.array(z.object({
    username: z.string(),
    messageCount: z.number(),
    role: z.string().describe('Their role in discussions, e.g. analyst, comedian, skeptic')
  })).describe('Most active participants'),
  notableQuotes: z.array(z.object({
    quote: z.string(),
    author: z.string(),
    context: z.string()
  })).describe('Memorable quotes from the chat'),
  trendingCoins: z.array(z.string()).describe('Cryptocurrencies mentioned frequently'),
})

export async function POST(request: NextRequest) {
  await headers()
  
  // Log API key status
  const apiKey = process.env.OPENAI_API_KEY
  console.log('[SUMMARIZE STREAM API] OpenAI API Key:', apiKey ? `Found (${apiKey.slice(0, 8)}...${apiKey.slice(-4)})` : 'NOT FOUND')
  
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  try {
    const body = await request.json()
    const { mode = 'articles', messageLimit = 500 } = body
    
    const supabase = await createClient()
    
    // Fetch messages from database
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
        month: '2-digit'
      })
      const modBadge = msg.is_moderator ? ' [MOD]' : ''
      return `[${time}] ${msg.username}${modBadge}: ${msg.text}`
    }).join('\n')
    
    const timeRange = {
      from: messages[0]?.time,
      to: messages[messages.length - 1]?.time
    }
    
    console.log(`[SUMMARIZE STREAM API] Processing ${messages.length} messages, mode: ${mode}`)
    
    if (mode === 'articles') {
      // Stream structured newspaper articles
      const result = streamObject({
        model: openai('gpt-4.1-nano'),
        schema: ArticleSchema,
        prompt: `Du bist der Chefredakteur der "Financial Retarded Times", einer satirischen Krypto-Zeitung im Stil klassischer Tageszeitungen.

Analysiere den folgenden TradingView-Chat und erstelle 5 Zeitungsartikel daraus. Die Artikel sollen:
- Im Stil einer seriösen Finanzzeitung geschrieben sein, aber mit einem Augenzwinkern
- Echte Diskussionen und Meinungen aus dem Chat aufgreifen
- Die Beitragenden namentlich erwähnen
- Relevante Zitate enthalten
- Verschiedene Kategorien abdecken (Analyse, Meinung, Kultur, etc.)

Chat-Protokoll (${messages.length} Nachrichten):
${formattedChat}

Zeitraum: ${timeRange.from} bis ${timeRange.to}

Erstelle abwechslungsreiche, unterhaltsame Artikel die die echten Diskussionen widerspiegeln.`,
        onError: (error) => {
          console.error('[SUMMARIZE STREAM API] Stream error:', error)
        }
      })
      
      return result.toTextStreamResponse()
      
    } else {
      // Stream summary
      const result = streamObject({
        model: openai('gpt-4.1-nano'),
        schema: SummarySchema,
        prompt: `Analysiere den folgenden TradingView-Krypto-Chat und erstelle eine strukturierte Zusammenfassung.

Chat-Protokoll (${messages.length} Nachrichten):
${formattedChat}

Zeitraum: ${timeRange.from} bis ${timeRange.to}

Fasse die wichtigsten Diskussionen, Stimmungen und aktiven Teilnehmer zusammen. Achte auf wiederkehrende Themen und bemerkenswerte Aussagen.`,
        onError: (error) => {
          console.error('[SUMMARIZE STREAM API] Stream error:', error)
        }
      })
      
      return result.toTextStreamResponse()
    }
    
  } catch (error) {
    console.error('[SUMMARIZE STREAM API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

