/**
 * route.ts (OHLC API)
 * 
 * Fetches BTC OHLC (candlestick) data from Binance API (free, no auth).
 * Supports fine granularity: 15m, 1H, 4H, 1D, 1W
 * 
 * ENDPOINT: GET /chart-timeline/api/ohlc?timeframe=15m|1H|4H|1D|1W&force=true
 * 
 * RESPONSE:
 * - 200: { ohlc: OHLCData[], count: number, timeframe: string, cached: boolean, fetchedAt: string }
 * - 500: Error fetching data
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

// Binance kline response format:
// [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore]
type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string]

// Cache validity in minutes
const CACHE_TTL_MINUTES = 5

/**
 * Check if cache is still valid (within TTL)
 */
function isCacheValid(updatedAt: string, ttlMinutes: number = CACHE_TTL_MINUTES): boolean {
  const cacheTime = new Date(updatedAt).getTime()
  const now = Date.now()
  const diffMinutes = (now - cacheTime) / (1000 * 60)
  return diffMinutes < ttlMinutes
}

/**
 * Map timeframe to Binance interval and limit
 * Binance intervals: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
 */
function getTimeframeParams(timeframe: string): { interval: string; limit: number } {
  switch (timeframe) {
    case '15m':
      // 15-minute candles, ~11 days = 1056 candles (extra days for zoomed out view)
      return { interval: '15m', limit: 1056 }
    case '1H':
      // 1-hour candles, ~14 days = 336 candles
      return { interval: '1h', limit: 336 }
    case '4H':
      // 4-hour candles, ~30 days = 180 candles
      return { interval: '4h', limit: 180 }
    case '1D':
      // Daily candles, ~90 days
      return { interval: '1d', limit: 90 }
    case '1W':
      // Weekly candles, ~52 weeks
      return { interval: '1w', limit: 52 }
    default:
      return { interval: '15m', limit: 1056 }
  }
}

/**
 * Map timeframe to Kraken interval (in minutes) and limit
 * Kraken intervals: 1, 5, 15, 30, 60, 240, 1440, 10080, 21600
 */
function getKrakenParams(timeframe: string): { interval: number; since?: number } {
  const now = Math.floor(Date.now() / 1000)
  switch (timeframe) {
    case '15m':
      // 15-min candles, ~11 days
      return { interval: 15, since: now - 11 * 24 * 60 * 60 }
    case '1H':
      // 1-hour candles, ~14 days
      return { interval: 60, since: now - 14 * 24 * 60 * 60 }
    case '4H':
      // 4-hour candles, ~30 days
      return { interval: 240, since: now - 30 * 24 * 60 * 60 }
    case '1D':
      // Daily candles, ~90 days
      return { interval: 1440, since: now - 90 * 24 * 60 * 60 }
    case '1W':
      // Weekly candles, ~52 weeks
      return { interval: 10080, since: now - 52 * 7 * 24 * 60 * 60 }
    default:
      return { interval: 15, since: now - 11 * 24 * 60 * 60 }
  }
}

/**
 * Fetch OHLC data from Kraken API (free, no auth, no geo-restrictions)
 */
async function fetchFromKraken(timeframe: string): Promise<OHLCData[]> {
  const { interval, since } = getKrakenParams(timeframe)
  const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${interval}${since ? `&since=${since}` : ''}`

  console.log(`[OHLC API] Fetching from Kraken: ${url}`)

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error(`Kraken API error: ${response.status}`)
  }

  const json = await response.json()

  if (json.error && json.error.length > 0) {
    throw new Error(`Kraken API error: ${json.error.join(', ')}`)
  }

  // Kraken returns { result: { XXBTZUSD: [[time, open, high, low, close, vwap, volume, count], ...], last: ... } }
  const pairData: (string | number)[][] = json.result?.XXBTZUSD ?? json.result?.XBTUSD ?? []

  if (!Array.isArray(pairData) || pairData.length === 0) {
    throw new Error('Kraken returned empty OHLC data')
  }

  // Kraken format: [time, open, high, low, close, vwap, volume, count]
  // Timestamps are in seconds — convert to ms
  const ohlcData: OHLCData[] = pairData.map(kline => ({
    timestamp: Number(kline[0]) * 1000,
    open: parseFloat(String(kline[1])),
    high: parseFloat(String(kline[2])),
    low: parseFloat(String(kline[3])),
    close: parseFloat(String(kline[4]))
  }))

  console.log(`[OHLC API] Received ${ohlcData.length} candles from Kraken`)

  return ohlcData
}

/**
 * Fetch OHLC data from Binance API mirrors with Kraken fallback
 */
async function fetchFromBinance(timeframe: string): Promise<OHLCData[]> {
  const { interval, limit } = getTimeframeParams(timeframe)

  const mirrors = [
    `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`,
    `https://api2.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`,
    `https://api3.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`,
  ]

  for (const url of mirrors) {
    try {
      console.log(`[OHLC API] Trying Binance mirror: ${url}`)

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      })

      if (!response.ok) {
        console.warn(`[OHLC API] Binance mirror failed with ${response.status}: ${url}`)
        continue
      }

      const rawData: BinanceKline[] = await response.json()

      const ohlcData: OHLCData[] = rawData.map(kline => ({
        timestamp: kline[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4])
      }))

      console.log(`[OHLC API] Received ${ohlcData.length} candles from Binance mirror`)
      return ohlcData
    } catch (err) {
      console.warn(`[OHLC API] Binance mirror error: ${err}`)
    }
  }

  // All Binance mirrors failed — fall back to Kraken
  console.warn('[OHLC API] All Binance mirrors failed, falling back to Kraken')
  return fetchFromKraken(timeframe)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const timeframe = searchParams.get('timeframe') || '15m' // Default to 15m now
  const forceRefresh = searchParams.get('force') === 'true'
  
  try {
    const supabase = await createClient()
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      console.log(`[OHLC API] Checking cache for timeframe: ${timeframe}`)
      
      const { data: cached, error: cacheError } = await supabase
        .from('chart_timeline_ohlc_cache')
        .select('*')
        .eq('timeframe', timeframe)
        .single()
      
      if (!cacheError && cached && isCacheValid(cached.updated_at)) {
        console.log(`[OHLC API] Cache hit! Returning ${cached.candle_count} cached candles`)
        
        return NextResponse.json({
          ohlc: cached.candles as OHLCData[],
          count: cached.candle_count,
          timeframe,
          cached: true,
          fetchedAt: cached.updated_at,
          source: 'binance'
        }, {
      headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          }
    })
      }
      
      console.log(`[OHLC API] Cache miss or stale for ${timeframe}`)
    } else {
      console.log(`[OHLC API] Force refresh requested for ${timeframe}`)
    }
    
    // Fetch fresh data from Binance
    const ohlcData = await fetchFromBinance(timeframe)
    
    // Calculate metadata
    const firstTimestamp = ohlcData.length > 0 ? ohlcData[0].timestamp : null
    const lastTimestamp = ohlcData.length > 0 ? ohlcData[ohlcData.length - 1].timestamp : null
    
    // Store in cache (upsert)
    const { error: upsertError } = await supabase
      .from('chart_timeline_ohlc_cache')
      .upsert({
        timeframe,
        candles: ohlcData,
        candle_count: ohlcData.length,
        first_timestamp: firstTimestamp,
        last_timestamp: lastTimestamp,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'timeframe'
      })
    
    if (upsertError) {
      console.error('[OHLC API] Cache upsert error:', upsertError)
    } else {
      console.log(`[OHLC API] Cached ${ohlcData.length} candles for ${timeframe}`)
    }
    
    const fetchedAt = new Date().toISOString()
    
    return NextResponse.json({
      ohlc: ohlcData,
      count: ohlcData.length,
      timeframe,
      cached: false,
      fetchedAt,
      source: 'binance'
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      }
    })
    
  } catch (error) {
    console.error('[OHLC API] Error:', error)
    
    // On error, try to return stale cache
    try {
      const supabase = await createClient()
      const { data: staleCache } = await supabase
        .from('chart_timeline_ohlc_cache')
        .select('*')
        .eq('timeframe', timeframe)
        .single()
      
      if (staleCache) {
        console.log('[OHLC API] Returning stale cache due to error')
        return NextResponse.json({
          ohlc: staleCache.candles as OHLCData[],
          count: staleCache.candle_count,
          timeframe,
          cached: true,
          stale: true,
          fetchedAt: staleCache.updated_at,
          source: 'binance',
          error: 'Using stale cache due to fetch error'
        })
      }
    } catch {
      // Ignore cache fallback errors
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch OHLC data' },
      { status: 500 }
    )
  }
}
