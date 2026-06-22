import type { createClient } from '@/lib/supabase/server'

export interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export interface LeaderboardChatMessage {
  id: string
  username: string
  text: string
  time: string
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export const LEADERBOARD_SYSTEM_PROMPT = `Du bist der Chef-Analyst der "Financial Retarded Times".
Deine Aufgabe: Erstelle ein LEADERBOARD der besten und schlechtesten Trader im Bitcoin-Chat.

═══════════════════════════════════════════════════════════════════════
ABSOLUT IGNORIEREN
═══════════════════════════════════════════════════════════════════════
- Nachrichten die mit "//" beginnen -> Das sind SPIELTIPPS, KEIN echter Trade-Call!
- Fragen ohne Behauptung ("Denkt ihr wir gehen auf 100k?")
- Allgemeines Gerede ohne Richtungsaussage

═══════════════════════════════════════════════════════════════════════
WAS DU BEWERTEST
═══════════════════════════════════════════════════════════════════════
Bewerte nur ECHTE Preis-Calls:
- "LONG JETZT!" / "SHORT hier!" / "Das ist der Boden"
- "100k diese Woche" / "Pump incoming" / "Crash kommt"
- "Bei 92k kaufen" / "95k Deckel, Short"
- Klare Richtungsaussagen mit Kontext

BEWERTUNGSREGELN:
1. War der Call BULLISH (Long/Pump/Buy) und BTC stieg danach? -> wasCorrect=true
2. War der Call BEARISH (Short/Dump/Sell) und BTC fiel danach? -> wasCorrect=true
3. War der Call falsch? -> wasCorrect=false
4. Schaue auf den Preisverlauf NACH dem Call (1-4 Stunden)

SCORING SYSTEM:
- score: 0-100, ganzzahlig
- winRate: 0-100, ganzzahlig, niemals als Dezimalwert
- Mindestens 3, maximal 20 Leaderboard-Einträge
- hallOfShame: 3-5 spektakuläre Fehlcalls

Für bestCall und worstCall:
- quote: EXAKT das Original-Zitat
- outcome: Was passierte danach mit dem Preis, konkret mit Zahlen
- commentaryText: Journalist-Stil, maximal 1 Satz, trocken und sachlich.

Starte sofort mit dem weekSummary.`

const CACHE_TTL_MINUTES = 120

export function isLeaderboardCacheFresh(updatedAt: string): boolean {
  const diffMinutes = (Date.now() - new Date(updatedAt).getTime()) / 60000
  return diffMinutes < CACHE_TTL_MINUTES
}

export async function fetchLeaderboardMessages(
  supabase: SupabaseServerClient,
  daysBack = 7
): Promise<{ messages: LeaderboardChatMessage[]; from: string; to: string }> {
  const now = new Date()
  const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)
  return fetchLeaderboardMessagesForRange(supabase, from, now)
}

export async function fetchLeaderboardMessagesForRange(
  supabase: SupabaseServerClient,
  from: Date,
  to: Date
): Promise<{ messages: LeaderboardChatMessage[]; from: string; to: string }> {
  const allMessages: LeaderboardChatMessage[] = []
  let lastTime: string | null = null
  let batchCount = 0
  const batchSize = 1000
  const maxBatches = 10

  while (batchCount < maxBatches) {
    let query = supabase
      .from('tv_chat_messages')
      .select('id, username, text, time')
      .gte('time', from.toISOString())
      .lte('time', to.toISOString())
      .not('text', 'is', null)
      .order('time', { ascending: true })
      .limit(batchSize)

    if (lastTime) {
      query = query.gt('time', lastTime)
    }

    const { data: batch, error } = await query
    if (error) {
      console.error('[LEADERBOARD] Batch fetch error:', error.message)
      break
    }
    if (!batch || batch.length === 0) break

    allMessages.push(...(batch as LeaderboardChatMessage[]))
    lastTime = batch[batch.length - 1].time
    batchCount += 1
    if (batch.length < batchSize) break
  }

  return {
    messages: allMessages.filter(message => message.text?.trim().length > 3),
    from: from.toISOString(),
    to: to.toISOString()
  }
}

export async function fetchLeaderboardOHLC(
  supabase: SupabaseServerClient,
  daysBack = 7
): Promise<OHLCData[]> {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000

  try {
    const { data: cached } = await supabase
      .from('chart_timeline_ohlc_cache')
      .select('candles, updated_at')
      .eq('timeframe', '1H')
      .single()

    if (cached?.candles && Array.isArray(cached.candles) && cached.candles.length > 0) {
      const filtered = (cached.candles as OHLCData[]).filter(candle => candle.timestamp >= cutoff)
      if (filtered.length > 0) return filtered
    }

    const limit = Math.min(daysBack * 24, 1000)
    const mirrors = [
      `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=${limit}`,
      `https://api2.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=${limit}`,
      `https://api3.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=${limit}`
    ]

    type BinanceKline = [number, string, string, string, string, ...unknown[]]
    for (const url of mirrors) {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) continue
        const raw: BinanceKline[] = await res.json()
        return raw.map(kline => ({
          timestamp: kline[0],
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4])
        }))
      } catch {
        continue
      }
    }
  } catch (error) {
    console.error('[LEADERBOARD] OHLC fetch error:', error)
  }

  return []
}

export function getPriceAtTime(timestamp: string, ohlcData: OHLCData[]): number {
  if (ohlcData.length === 0) return 0
  const ts = new Date(timestamp).getTime()
  let closest = ohlcData[0]
  let minDiff = Math.abs(closest.timestamp - ts)

  for (const candle of ohlcData) {
    const diff = Math.abs(candle.timestamp - ts)
    if (diff < minDiff) {
      minDiff = diff
      closest = candle
    }
  }

  return closest.close
}

export function buildPriceTimeline(ohlcData: OHLCData[], daysBack: number): { text: string; from: string; to: string } {
  if (ohlcData.length === 0) return { text: 'Keine Preisdaten verfügbar.', from: '', to: '' }

  const lines: string[] = []
  const first = ohlcData[0]
  const last = ohlcData[ohlcData.length - 1]
  const change = (((last.close - first.open) / first.open) * 100).toFixed(2)
  const high = Math.max(...ohlcData.map(candle => candle.high))
  const low = Math.min(...ohlcData.map(candle => candle.low))
  const fromDate = new Date(first.timestamp).toISOString()
  const toDate = new Date(last.timestamp).toISOString()

  lines.push(`## BTC Preis (letzte ${daysBack} Tage)`)
  lines.push(`Start: $${first.open.toFixed(0)} -> Ende: $${last.close.toFixed(0)} (${change}%)`)
  lines.push(`${daysBack}-Tage-Hoch: $${high.toFixed(0)} | ${daysBack}-Tage-Tief: $${low.toFixed(0)}`)
  lines.push(`Zeitraum: ${fromDate.split('T')[0]} bis ${toDate.split('T')[0]}`)
  lines.push('')
  lines.push(`## 1H Preisuebersicht (alle ${ohlcData.length} Kerzen):`)

  for (const candle of ohlcData) {
    const pct = (((candle.close - candle.open) / candle.open) * 100).toFixed(1)
    const direction = candle.close >= candle.open ? 'up' : 'down'
    const date = new Date(candle.timestamp).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin'
    })
    lines.push(`${date}: $${candle.open.toFixed(0)} -> $${candle.close.toFixed(0)} ${direction} ${pct}%`)
  }

  return { text: lines.join('\n'), from: fromDate, to: toDate }
}

export function sampleLeaderboardMessages(messages: LeaderboardChatMessage[], maxTotal = 500): LeaderboardChatMessage[] {
  const byDay = new Map<string, LeaderboardChatMessage[]>()
  for (const message of messages) {
    const day = message.time.split('T')[0]
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(message)
  }

  const maxPerDay = Math.ceil(maxTotal / Math.max(byDay.size, 1))
  const result: LeaderboardChatMessage[] = []

  for (const [, dayMessages] of [...byDay.entries()].sort()) {
    const step = Math.max(1, Math.floor(dayMessages.length / maxPerDay))
    for (let i = 0; i < dayMessages.length && result.length < maxTotal; i += step) {
      result.push(dayMessages[i])
    }
  }

  return result
}

export function buildLeaderboardUserPrompt(params: {
  messages: LeaderboardChatMessage[]
  ohlcData: OHLCData[]
  from: string
  to: string
  daysBack: number
  today?: string
}): string {
  const sampled = sampleLeaderboardMessages(params.messages, 500)
  const { text: priceTimeline, from: priceFrom, to: priceTo } = buildPriceTimeline(params.ohlcData, params.daysBack)
  const uniqueUsers = new Set(params.messages.map(message => message.username)).size
  const annotatedMessages = sampled.map(message => {
    const price = getPriceAtTime(message.time, params.ohlcData)
    const d = new Date(message.time)
    const dateStr = d.toISOString().split('T')[0]
    const time = d.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin'
    })
    return `[${dateStr} ${time}] @${message.username} (BTC:$${price > 0 ? Math.round(price) : '?'}): ${message.text}`
  })

  return `${priceTimeline}

Analysierter Zeitraum (Chat): ${params.from} bis ${params.to}
Preisdaten verfuegbar: ${priceFrom || params.from} bis ${priceTo || params.to}
Gesamt Nachrichten: ${params.messages.length} (Stichprobe: ${sampled.length})
Einzigartige User: ${uniqueUsers}
Heutiges Datum: ${params.today ?? new Date().toISOString().split('T')[0]}

--- CHAT-NACHRICHTEN MIT BTC-PREIS ZUM ZEITPUNKT ---
${annotatedMessages.join('\n')}
--- ENDE ---

Erstelle jetzt das Leaderboard. Finde die besten und schlechtesten Trader.
Priorisiere User mit klaren, bewertbaren Preis-Calls.
Ignoriere komplett alle Nachrichten die mit "//" beginnen!`
}
