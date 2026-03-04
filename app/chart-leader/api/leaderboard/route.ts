/**
 * Leaderboard API
 *
 * AI-powered leaderboard that scores users by prediction accuracy.
 * Fetches chat messages + BTC price data to determine who was right.
 *
 * ENDPOINTS:
 * - GET  /chart-leader/api/leaderboard          → cached leaderboard
 * - POST /chart-leader/api/leaderboard          → stream fresh AI analysis
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

// ══════════════════════════════════════════════════════════════════════
// SCHEMAS
// ══════════════════════════════════════════════════════════════════════

const LeaderboardEntrySchema = z.object({
  rank: z.number(),
  username: z.string(),
  score: z.number().min(0).max(100),         // Overall accuracy score 0-100
  correctCalls: z.number(),
  wrongCalls: z.number(),
  totalCalls: z.number(),
  winRate: z.number().min(0).max(100),       // % correct
  bestCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    priceTarget: z.number().nullable(),
    direction: z.enum(['bullish', 'bearish']),
    outcome: z.string(),                     // "BTC pumped 8% nach diesem Call"
    timestamp: z.string(),
  }),
  worstCall: z.object({
    quote: z.string(),
    priceAtCall: z.number(),
    outcome: z.string(),
    timestamp: z.string(),
  }).optional(),
  callHistory: z.array(z.object({
    quote: z.string(),
    direction: z.enum(['bullish', 'bearish', 'neutral']),
    wasCorrect: z.boolean(),
    priceAtCall: z.number(),
    timestamp: z.string(),
    priceContext: z.string(),
  })).max(5),
  badge: z.enum([
    'oracle',        // 80%+ win rate
    'analyst',       // 60-79% win rate
    'gambler',       // <40% win rate
    'contrarian',    // Mostly wrong but consistent
    'degen',         // High volume, mixed results
    'diamond_hands', // Only holds calls
    'top_signal',    // Famous for calling tops wrong
    'bottom_feeder', // Finds bottoms early
    'newbie',        // Less than 3 calls
  ]),
  badgeReason: z.string(),
  commentaryText: z.string(),  // Journalist-style 1-sentence commentary
})

const LeaderboardResponseSchema = z.object({
  weekSummary: z.object({
    headline: z.string(),
    subheadline: z.string(),
    startPrice: z.number(),
    endPrice: z.number(),
    changePercent: z.number(),
    topWinner: z.string(),
    topLoser: z.string(),
  }),
  leaderboard: z.array(LeaderboardEntrySchema).min(3).max(20),
  hallOfShame: z.array(z.object({
    username: z.string(),
    worstQuote: z.string(),
    priceAtCall: z.number(),
    outcome: z.string(),
    badge: z.string(),
  })).max(5),
  dataRange: z.object({
    from: z.string(),
    to: z.string(),
    totalMessages: z.number(),
    uniqueTraders: z.number(),
  }),
})

export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

interface ChatMessage {
  id: string
  username: string
  text: string
  time: string
}

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

const CACHE_KEY = 'leaderboard_7d'
const CACHE_TTL_MINUTES = 120 // 2 hours

function isCacheValid(updatedAt: string): boolean {
  const diffMinutes = (Date.now() - new Date(updatedAt).getTime()) / 60000
  return diffMinutes < CACHE_TTL_MINUTES
}

async function fetchMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  daysBack = 7
): Promise<{ messages: ChatMessage[]; from: string; to: string }> {
  const now = new Date()
  const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)

  const allMessages: ChatMessage[] = []
  let lastTime: string | null = null
  let batchCount = 0
  const BATCH_SIZE = 1000
  const MAX_BATCHES = 10 // max 10k messages

  while (batchCount < MAX_BATCHES) {
    let query = supabase
      .from('tv_chat_messages')
      .select('id, username, text, time')
      .gte('time', from.toISOString())
      .lte('time', now.toISOString())
      .not('text', 'is', null)
      .order('time', { ascending: true })
      .limit(BATCH_SIZE)

    if (lastTime) {
      query = query.gt('time', lastTime)
    }

    const { data: batch, error } = await query

    if (error) {
      console.error('[LEADERBOARD] Batch fetch error:', error)
      break
    }
    if (!batch || batch.length === 0) break

    allMessages.push(...(batch as ChatMessage[]))
    lastTime = batch[batch.length - 1].time
    batchCount++

    console.log(`[LEADERBOARD] Batch ${batchCount}: ${batch.length} msgs (total: ${allMessages.length})`)

    if (batch.length < BATCH_SIZE) break
  }

  return {
    messages: allMessages.filter((m) => m.text?.trim().length > 3),
    from: from.toISOString(),
    to: now.toISOString(),
  }
}

async function fetchOHLC(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<OHLCData[]> {
  try {
    // Try 1H from cache
    const { data: cached } = await supabase
      .from('chart_timeline_ohlc_cache')
      .select('candles')
      .eq('timeframe', '1H')
      .single()

    if (cached?.candles && Array.isArray(cached.candles)) {
      return cached.candles as OHLCData[]
    }

    // Fallback: Binance 1h last 7 days
    const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=168'
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []

    type BinanceKline = [number, string, string, string, string, ...unknown[]]
    const raw: BinanceKline[] = await res.json()
    return raw.map((k) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
    }))
  } catch {
    return []
  }
}

function getPriceAtTime(timestamp: string, ohlcData: OHLCData[]): number {
  if (ohlcData.length === 0) return 0
  const ts = new Date(timestamp).getTime()
  let closest = ohlcData[0]
  let minDiff = Math.abs(closest.timestamp - ts)
  for (const c of ohlcData) {
    const diff = Math.abs(c.timestamp - ts)
    if (diff < minDiff) {
      minDiff = diff
      closest = c
    }
  }
  return closest.close
}

function buildPriceTimeline(ohlcData: OHLCData[]): string {
  if (ohlcData.length === 0) return 'Keine Preisdaten verfügbar.'

  const lines: string[] = []
  const first = ohlcData[0]
  const last = ohlcData[ohlcData.length - 1]
  const change = (((last.close - first.open) / first.open) * 100).toFixed(2)
  const high = Math.max(...ohlcData.map((c) => c.high))
  const low = Math.min(...ohlcData.map((c) => c.low))

  lines.push(`## BTC Preis (7 Tage)`)
  lines.push(
    `Start: $${first.open.toFixed(0)} → Ende: $${last.close.toFixed(0)} (${change}%)`
  )
  lines.push(`7-Tage-Hoch: $${high.toFixed(0)} | 7-Tage-Tief: $${low.toFixed(0)}`)
  lines.push('')

  // 4-hour price points for context
  const fourHourMs = 4 * 60 * 60 * 1000
  const buckets = new Map<number, OHLCData[]>()
  for (const c of ohlcData) {
    const b = Math.floor(c.timestamp / fourHourMs) * fourHourMs
    if (!buckets.has(b)) buckets.set(b, [])
    buckets.get(b)!.push(c)
  }

  lines.push(`## 4H Preisübersicht (für Call-Bewertung):`)
  for (const [ts, candles] of [...buckets.entries()].sort()) {
    const open = candles[0].open
    const close = candles[candles.length - 1].close
    const pct = (((close - open) / open) * 100).toFixed(1)
    const emoji = close >= open ? '🟢' : '🔴'
    const date = new Date(ts).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    lines.push(
      `${date}: $${open.toFixed(0)}→$${close.toFixed(0)} ${emoji} ${pct}%`
    )
  }

  return lines.join('\n')
}

// Evenly sample messages across the week (max ~500 for prompt)
function sampleMessages(messages: ChatMessage[], maxTotal = 500): ChatMessage[] {
  const byDay = new Map<string, ChatMessage[]>()
  for (const m of messages) {
    const day = m.time.split('T')[0]
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(m)
  }

  const maxPerDay = Math.ceil(maxTotal / Math.max(byDay.size, 1))
  const result: ChatMessage[] = []

  for (const [, dayMsgs] of [...byDay.entries()].sort()) {
    const step = Math.max(1, Math.floor(dayMsgs.length / maxPerDay))
    for (let i = 0; i < dayMsgs.length && result.length < maxTotal; i += step) {
      result.push(dayMsgs[i])
    }
  }

  return result
}

// ══════════════════════════════════════════════════════════════════════
// AI PROMPT
// ══════════════════════════════════════════════════════════════════════

const LEADERBOARD_PROMPT = `Du bist der Chef-Analyst der "Financial Retarded Times".
Deine Aufgabe: Erstelle ein LEADERBOARD der besten und schlechtesten Trader im Bitcoin-Chat.

═══════════════════════════════════════════════════════════════════════
⛔ ABSOLUT IGNORIEREN
═══════════════════════════════════════════════════════════════════════
- Nachrichten die mit "//" beginnen → Das sind SPIELTIPPS, KEIN echter Trade-Call!
- Fragen ohne Behauptung ("Denkt ihr wir gehen auf 100k?")
- Allgemeines Gerede ohne Richtungsaussage

═══════════════════════════════════════════════════════════════════════
WAS DU BEWERTEST
═══════════════════════════════════════════════════════════════════════
Bewerte nur ECHTE Preis-Calls:
✅ "LONG JETZT!" / "SHORT hier!" / "Das ist der Boden"
✅ "100k diese Woche" / "Pump incoming" / "Crash kommt"
✅ "Bei 92k kaufen" / "95k Deckel, Short"
✅ Klare Richtungsaussagen mit Kontext

BEWERTUNGSREGELN:
1. War der Call BULLISH (Long/Pump/Buy) und BTC stieg danach? → wasCorrect=true
2. War der Call BEARISH (Short/Dump/Sell) und BTC fiel danach? → wasCorrect=true
3. War der Call falsch? → wasCorrect=false
4. Schaue auf den Preisverlauf NACH dem Call (1-4 Stunden)

═══════════════════════════════════════════════════════════════════════
SCORING SYSTEM
═══════════════════════════════════════════════════════════════════════
score (0-100):
- 100: Perfekter Call genau am Wendepunkt mit Zeitangabe
- 80-99: Richtiger Call, gut getimed
- 60-79: Richtiger Call, normal
- 40-59: Gemischte Performance
- 20-39: Mehr Fehler als Treffer
- 0-19: Chronisch falsch gelegen

BADGES:
- oracle: 80%+ winRate, mindestens 3 Calls
- analyst: 60-79% winRate, methodische Argumentation
- gambler: Viele Calls, unberechenbar
- contrarian: Meist falsch aber konsequent
- degen: Hohe Frequenz, chaotisch
- diamond_hands: Immer bullish, egal was
- top_signal: Ruft immer Bull kurz vor Dump
- bottom_feeder: Kauft immer die Dips
- newbie: Weniger als 3 bewertbare Calls

═══════════════════════════════════════════════════════════════════════
WICHTIG: WÄHLE DIE BESTEN CALLS AUS!
═══════════════════════════════════════════════════════════════════════
Du MUSST:
1. Die Calls mit den BESTEN Treffer-Quoten zuerst listen
2. Mindestens 3, maximal 20 Einträge im Leaderboard
3. Die hall_of_shame: Die 3-5 spektakulärsten Fehlcalls

Für bestCall und worstCall:
- quote: EXAKT das Original-Zitat (wortwörtlich!)
- outcome: Was passierte DANACH mit dem Preis? (z.B. "BTC pumped 8% innerhalb 2h")
- Sei konkret mit Zahlen!

commentaryText: Journalist-Stil, maximal 1 Satz, trocken und sachlich.
Beispiel: "@CryptoKing lag diese Woche 4/5 Mal richtig – einschließlich dem perfekten Bottom-Call bei $91k."

Starte sofort mit dem weekSummary.`

// ══════════════════════════════════════════════════════════════════════
// GET — return cached leaderboard
// ══════════════════════════════════════════════════════════════════════

export async function GET() {
  const supabase = await createClient()

  try {
    const { data: cached, error } = await supabase
      .from('leaderboard_analysis_cache')
      .select('data, updated_at')
      .eq('cache_key', CACHE_KEY)
      .single()

    if (error || !cached?.data) {
      return NextResponse.json({ cached: false, leaderboard: null })
    }

    const stale = !isCacheValid(cached.updated_at)
    console.log(`[LEADERBOARD GET] Returning ${stale ? 'stale' : 'fresh'} cache`)

    return NextResponse.json({
      cached: true,
      stale,
      fetchedAt: cached.updated_at,
      ...(cached.data as object),
    })
  } catch (err) {
    console.error('[LEADERBOARD GET] Error:', err)
    return NextResponse.json({ cached: false, leaderboard: null })
  }
}

// ══════════════════════════════════════════════════════════════════════
// POST — stream fresh AI analysis
// ══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const [{ messages, from, to }, ohlcData] = await Promise.all([
    fetchMessages(supabase, 7),
    fetchOHLC(supabase),
  ])

  if (messages.length === 0) {
    return NextResponse.json({ error: 'Keine Nachrichten gefunden' }, { status: 404 })
  }

  const sampled = sampleMessages(messages, 500)
  const priceTimeline = buildPriceTimeline(ohlcData)

  // Annotate messages with BTC price at time of sending
  const annotatedMessages = sampled.map((m) => {
    const price = getPriceAtTime(m.time, ohlcData)
    const d = new Date(m.time)
    const dateStr = d.toISOString().split('T')[0]
    const time = d.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    })
    return `[${dateStr} ${time}] @${m.username} (BTC:$${price > 0 ? Math.round(price) : '?'}): ${m.text}`
  })

  // Unique users for context
  const uniqueUsers = new Set(messages.map((m) => m.username)).size

  const result = streamObject({
    model: openai('gpt-5.2'),
    schema: LeaderboardResponseSchema,
    system: LEADERBOARD_PROMPT,
    providerOptions: { openai: { reasoning: { effort: 'high' } } },
    prompt: `${priceTimeline}

Zeitraum: ${from} bis ${to}
Gesamt Nachrichten: ${messages.length} (Stichprobe: ${sampled.length})
Einzigartige User: ${uniqueUsers}
Heutiges Datum: ${new Date().toISOString().split('T')[0]}

--- CHAT-NACHRICHTEN MIT BTC-PREIS ZUM ZEITPUNKT ---
${annotatedMessages.join('\n')}
--- ENDE ---

Erstelle jetzt das Leaderboard. Finde die besten und schlechtesten Trader.
Priorisiere User mit klaren, bewertbaren Preis-Calls.
Ignoriere komplett alle Nachrichten die mit "//" beginnen!`,

    onFinish: async ({ object }) => {
      if (!object) return
      try {
        await supabase.from('leaderboard_analysis_cache').upsert(
          {
            cache_key: CACHE_KEY,
            data: object,
            entry_count: object.leaderboard?.length ?? 0,
            message_count: messages.length,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'cache_key' }
        )
        console.log(`[LEADERBOARD] Cached ${object.leaderboard?.length} entries`)
      } catch (err) {
        console.error('[LEADERBOARD] Cache save error:', err)
      }
    },
  })

  return result.toTextStreamResponse()
}
