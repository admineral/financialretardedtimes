/**
 * BTC Price API Route
 * 
 * Server-side proxy for CoinGecko API to avoid CORS issues
 * and handle rate limiting gracefully.
 * 
 * ROUTE: /newspaper/api/btc-price
 */

import { NextResponse } from 'next/server'

interface BTCResponse {
  price: number
  change24h: number
  change7d: number
  change30d: number
  high24h: number
  low24h: number
  ath: number
  cachedAt: number
}

// Cache the response for 30 seconds to reduce API calls
let cachedData: BTCResponse | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 30 * 1000 // 30 seconds

export async function GET() {
  try {
    // Check cache first
    const now = Date.now()
    if (cachedData && (now - cacheTimestamp) < CACHE_DURATION) {
      return NextResponse.json(cachedData)
    }

    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false',
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 30 } // Next.js cache for 30 seconds
      }
    )

    if (!response.ok) {
      // If rate limited or error, return cached data if available
      if (cachedData) {
        return NextResponse.json(cachedData)
      }
      throw new Error(`CoinGecko API error: ${response.status}`)
    }

    const data = await response.json()
    
    const btcData: BTCResponse = {
      price: data.market_data.current_price.usd,
      change24h: data.market_data.price_change_percentage_24h,
      change7d: data.market_data.price_change_percentage_7d,
      change30d: data.market_data.price_change_percentage_30d,
      high24h: data.market_data.high_24h.usd,
      low24h: data.market_data.low_24h.usd,
      ath: data.market_data.ath.usd,
      cachedAt: now
    }

    // Update cache
    cachedData = btcData
    cacheTimestamp = now

    return NextResponse.json(btcData)
  } catch (error) {
    console.error('Failed to fetch BTC data:', error)
    
    // Return cached data if available
    if (cachedData) {
      return NextResponse.json(cachedData)
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch BTC data' },
      { status: 500 }
    )
  }
}

