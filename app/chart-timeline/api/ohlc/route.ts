/**
 * route.ts (OHLC API)
 * 
 * Fetches BTC OHLC (candlestick) data from CoinGecko API.
 * 
 * ENDPOINT: GET /chart-timeline/api/ohlc?timeframe=1D|1W|1M
 * 
 * RESPONSE:
 * - 200: { ohlc: OHLCData[], count: number, timeframe: string }
 * - 500: Error fetching data
 */

import { NextRequest, NextResponse } from 'next/server'

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

// CoinGecko OHLC endpoint returns data in format: [timestamp, open, high, low, close]
type CoinGeckoOHLC = [number, number, number, number, number]

/**
 * Map timeframe to CoinGecko days parameter
 * CoinGecko OHLC granularity:
 * - 1-2 days: 30-minute candles
 * - 3-30 days: 4-hour candles  
 * - 31+ days: 4-day candles (we aggregate for daily/weekly/monthly)
 * 
 * For 15m: Use 7 days (4H candles) - best balance of granularity and history
 * For 1H: Use 14 days of 4H candles
 * For 1D: Use 90 days
 * For 1W/1M: Aggregate daily candles
 */
function getTimeframeParams(timeframe: string): { days: string; aggregate?: number; isHourly?: boolean } {
  switch (timeframe) {
    case '15m':
      return { days: '7' } // 7 days of 4H candles (more history, shows context)
    case '1H':
      return { days: '14', isHourly: true } // 14 days of 4H candles
    case '1D':
      return { days: '90' } // 90 daily candles
    case '1W':
      return { days: '365', aggregate: 7 } // ~52 weekly candles
    case '1M':
      return { days: 'max', aggregate: 30 } // Monthly candles
    default:
      return { days: '7' }
  }
}

/**
 * Aggregate OHLC data into larger timeframes
 */
function aggregateOHLC(data: OHLCData[], period: number): OHLCData[] {
  if (period <= 1) return data
  
  const result: OHLCData[] = []
  
  for (let i = 0; i < data.length; i += period) {
    const chunk = data.slice(i, Math.min(i + period, data.length))
    if (chunk.length === 0) continue
    
    result.push({
      timestamp: chunk[0].timestamp,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close
    })
  }
  
  return result
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const timeframe = searchParams.get('timeframe') || '1D'
  
  try {
    const { days, aggregate } = getTimeframeParams(timeframe)
    
    // CoinGecko OHLC endpoint
    // Note: Free tier has rate limits, but should be fine for this use case
    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`
    
    console.log(`[OHLC API] Fetching ${timeframe} data from CoinGecko: ${url}`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      // Cache for 5 minutes
      next: { revalidate: 300 }
    })
    
    if (!response.ok) {
      // Check for rate limiting
      if (response.status === 429) {
        console.error('[OHLC API] Rate limited by CoinGecko')
        return NextResponse.json(
          { error: 'Rate limited, please try again later' },
          { status: 429 }
        )
      }
      throw new Error(`CoinGecko API error: ${response.status}`)
    }
    
    const rawData: CoinGeckoOHLC[] = await response.json()
    
    // Transform to our format
    let ohlcData: OHLCData[] = rawData.map(([timestamp, open, high, low, close]) => ({
      timestamp,
      open,
      high,
      low,
      close
    }))
    
    // Aggregate if needed for larger timeframes
    if (aggregate && aggregate > 1) {
      ohlcData = aggregateOHLC(ohlcData, aggregate)
    }
    
    console.log(`[OHLC API] Returning ${ohlcData.length} ${timeframe} candles`)
    
    return NextResponse.json({
      ohlc: ohlcData,
      count: ohlcData.length,
      timeframe,
      fetchedAt: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    })
    
  } catch (error) {
    console.error('[OHLC API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch OHLC data' },
      { status: 500 }
    )
  }
}

