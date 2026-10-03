import 'server-only'

/**
 * Daily BTC/USDT closes (Binance, UTC days) for the LLM export. Ten years
 * are four requests; results are kept for an hour. Failure returns null and
 * the export says so instead of inventing prices.
 */

const DAY = 86_400_000
let cache: { at: number; closes: Record<string, number> } | null = null

async function fetchRange(start: number, end: number): Promise<Record<string, number>> {
  const closes: Record<string, number> = {}
  for (let cursor = start; cursor <= end;) {
    const params = new URLSearchParams({
      symbol: 'BTCUSDT',
      interval: '1d',
      startTime: String(cursor),
      endTime: String(end),
      limit: '1000'
    })
    let rows: unknown[] | null = null
    for (const host of ['api.binance.com', 'api1.binance.com', 'data-api.binance.vision']) {
      try {
        const response = await fetch(`https://${host}/api/v3/klines?${params}`, {
          signal: AbortSignal.timeout(8000)
        })
        if (response.ok) {
          rows = (await response.json()) as unknown[]
          break
        }
      } catch {
        // next host
      }
    }
    if (!rows) throw new Error('BTC prices unavailable')
    if (!rows.length) break
    for (const row of rows as Array<[number, string, string, string, string]>) {
      closes[new Date(row[0]).toISOString().slice(0, 10)] = Number(row[4])
    }
    const last = (rows.at(-1) as [number])[0]
    if (last + DAY <= cursor) break
    cursor = last + DAY
  }
  return closes
}

export async function btcDailyCloses(from: string, to: string): Promise<Record<string, number> | null> {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Math.min(Date.parse(`${to}T00:00:00Z`), Date.now())
  try {
    if (!cache || Date.now() - cache.at > 60 * 60_000) {
      // Always load the full ten-year window once; ranges are then sliced locally.
      cache = { at: Date.now(), closes: await fetchRange(Date.now() - 3660 * DAY, Date.now()) }
    }
    const out: Record<string, number> = {}
    for (const [day, close] of Object.entries(cache.closes)) {
      const t = Date.parse(`${day}T00:00:00Z`)
      if (t >= start && t <= end) out[day] = close
    }
    return out
  } catch {
    return null
  }
}
