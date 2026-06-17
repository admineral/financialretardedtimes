/**
 * route.ts (summarize API)
 *
 * Streams the unified daily AI response. The newspaper module remains the
 * user-facing payload for this page, while completed ticker/timeline/F&G
 * modules are written into their existing caches when requested.
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createDailyAIStream } from '../../lib/daily-ai'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  await headers()

  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const {
      selectedDates,
      dayRange = 1,
      timelineMode = '24h',
      includeTicker,
      includeTimeline,
      includeFearGreed
    }: {
      selectedDates?: string[]
      dayRange?: number
      timelineMode?: '24h' | '3d' | '7d'
      includeTicker?: boolean
      includeTimeline?: boolean
      includeFearGreed?: boolean
    } = body

    const { result } = await createDailyAIStream({
      selectedDates,
      dayRange,
      timelineMode,
      includeNewspaper: true,
      includeTicker,
      includeTimeline,
      includeFearGreed,
      source: 'newspaper'
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('[SUMMARIZE API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
