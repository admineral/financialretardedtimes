/**
 * route.ts (refresh-newspaper cron)
 * 
 * Cron endpoint to automatically refresh today's newspaper content.
 * 
 * LOCAL: Triggered by Vercel cron to pre-generate and cache today's newspaper.
 * Calls the summarize API internally and waits for completion.
 * 
 * GLOBAL: Ensures users always have fresh newspaper content available.
 * Reduces latency for first visitors by pre-caching the AI-generated content.
 * 
 * ENDPOINT: GET /api/cron/refresh-newspaper
 * 
 * CRON: Runs daily at a configured time (see vercel.json)
 * 
 * RESPONSE:
 * - 200: Successfully refreshed newspaper
 * - 401: Unauthorized (missing cron secret in production)
 * - 500: Error during refresh
 */

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { cronLogger as log } from '@/lib/logger'

export const maxDuration = 60 // Allow up to 60 seconds for AI generation

export async function GET() {
  // Verify cron authorization in production
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  
  // In production, verify the cron secret
  if (process.env.VERCEL_ENV === 'production') {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]
    
    log.info('Starting newspaper refresh', { date: today })
    
    // Get the base URL for internal API call
    const protocol = process.env.VERCEL_ENV === 'production' ? 'https' : 'http'
    const host = headersList.get('host') || 'localhost:3000'
    const baseUrl = `${protocol}://${host}`
    
    // Call the summarize endpoint for today (1-day summary only)
    
    const response = await fetch(`${baseUrl}/newspaper/api/summarize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selectedDates: [today],
        dayRange: 1,
        timelineMode: '24h',
        includeTicker: true,
        includeTimeline: true,
        includeFearGreed: true
      }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      log.error('Newspaper refresh failed', new Error(errorText))
      return NextResponse.json({ success: false, error: errorText }, { status: 500 })
    }
    
    // Consume the streaming response to ensure it completes
    // The summarize endpoint caches on completion via onFinish
    const reader = response.body?.getReader()
    if (reader) {
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    }
    
    log.info('Newspaper refresh completed', { date: today })
    
    return NextResponse.json({
      success: true,
      date: today,
      unifiedDailyAI: true
    })
    
  } catch (error) {
    log.error('Newspaper refresh error', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

