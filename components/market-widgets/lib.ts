'use client'

/**
 * Shared client helpers for the market widgets (chart timeline, sentiment,
 * prediction market).
 *
 * The central fix for "labels never show up on the chart": the OHLC
 * timeframe is chosen so its lookback window actually COVERS the events
 * we want to plot (cached analyses can be days or weeks old), and the
 * candles are clipped to the event window so the chart zooms where the
 * story happens.
 */

export interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export type OhlcTimeframe = '15m' | '1H' | '4H' | '1D'

/** Approximate lookback of each /chart-timeline/api/ohlc timeframe. */
const TIMEFRAME_LOOKBACK_DAYS: Record<OhlcTimeframe, number> = {
  '15m': 10,
  '1H': 13,
  '4H': 29,
  '1D': 88
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Pick the finest OHLC timeframe whose lookback still covers `oldestMs`.
 * Stale caches (e.g. quotes from three weeks ago) then land on a 4H/1D
 * chart instead of falling off a 15m chart entirely.
 */
export function pickTimeframeForRange(oldestMs: number): OhlcTimeframe {
  const ageDays = (Date.now() - oldestMs) / DAY_MS
  if (ageDays <= TIMEFRAME_LOOKBACK_DAYS['15m']) return '15m'
  if (ageDays <= TIMEFRAME_LOOKBACK_DAYS['1H']) return '1H'
  if (ageDays <= TIMEFRAME_LOOKBACK_DAYS['4H']) return '4H'
  return '1D'
}

export async function fetchOhlc(
  timeframe: OhlcTimeframe,
  force = false
): Promise<{ ohlc: OHLCData[]; fetchedAt: string | null; cached: boolean }> {
  const response = await fetch(`/chart-timeline/api/ohlc?timeframe=${timeframe}${force ? '&force=true' : ''}`)
  if (!response.ok) throw new Error(`OHLC request failed (${response.status})`)
  const json = await response.json()
  return {
    ohlc: Array.isArray(json.ohlc) ? (json.ohlc as OHLCData[]) : [],
    fetchedAt: typeof json.fetchedAt === 'string' ? json.fetchedAt : null,
    cached: Boolean(json.cached)
  }
}

/**
 * Clip candles to the event window plus padding, but always keep the
 * aftermath (candles after the last event) so calls can be judged.
 */
export function clipOhlcToWindow(ohlc: OHLCData[], fromMs: number, toMs: number): OHLCData[] {
  if (ohlc.length === 0) return ohlc
  const pad = Math.max((toMs - fromMs) * 0.08, 2 * 60 * 60 * 1000)
  const clipped = ohlc.filter(c => c.timestamp >= fromMs - pad)
  return clipped.length >= 10 ? clipped : ohlc
}

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'nie'
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / DAY_MS)
  if (diffMins < 1) return 'gerade eben'
  if (diffMins < 60) return `vor ${diffMins}m`
  if (diffHours < 24) return `vor ${diffHours}h`
  return `vor ${diffDays}d`
}

export function isOlderThanHours(isoString: string | null, hours: number): boolean {
  if (!isoString) return true
  return Date.now() - new Date(isoString).getTime() > hours * 3600 * 1000
}

export function formatDateShort(isoString: string): string {
  return new Date(isoString).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })
}
