/**
 * Leaderboard API
 *
 * AI-powered leaderboard that scores users by prediction accuracy.
 *
 * ENDPOINTS:
 * - GET  /chart-leader/api/leaderboard          -> cached leaderboard
 * - POST /chart-leader/api/leaderboard          -> stream fresh AI analysis
 */

import { openai } from '@ai-sdk/openai'
import { createTextStreamResponse, Output, streamText, toTextStream } from 'ai'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildLeaderboardUserPrompt,
  fetchLeaderboardMessages,
  fetchLeaderboardOHLC,
  isLeaderboardCacheFresh,
  LEADERBOARD_SYSTEM_PROMPT
} from '../../lib/analysis'
import { LeaderboardResponseSchema } from '../../lib/schema'
import { AI_MODEL } from '@/lib/ai/model'

const CACHE_KEY = 'leaderboard_7d'
const DAYS_BACK = 7

export async function GET() {
  const supabase = await createClient()

  try {
    const { data: cached, error } = await supabase
      .from('leaderboard_analysis_cache')
      .select('data, updated_at')
      .eq('cache_key', CACHE_KEY)
      .maybeSingle()

    if (error) {
      console.error('[LEADERBOARD GET] Supabase error:', error.message, error.code)
      return NextResponse.json({ cached: false, leaderboard: null })
    }

    if (!cached?.data) {
      return NextResponse.json({ cached: false, leaderboard: null })
    }

    let payload: Record<string, unknown>
    if (typeof cached.data === 'string') {
      try {
        payload = JSON.parse(cached.data)
      } catch {
        return NextResponse.json({ cached: false, leaderboard: null })
      }
    } else {
      payload = cached.data as Record<string, unknown>
    }

    const leaderboard = payload?.leaderboard
    if (!leaderboard || !Array.isArray(leaderboard) || leaderboard.length === 0) {
      return NextResponse.json({ cached: false, leaderboard: null })
    }

    return NextResponse.json({
      cached: true,
      stale: !isLeaderboardCacheFresh(cached.updated_at),
      fetchedAt: cached.updated_at,
      ...payload
    })
  } catch (err) {
    console.error('[LEADERBOARD GET] Unexpected error:', err)
    return NextResponse.json({ cached: false, leaderboard: null })
  }
}

export async function POST() {
  const supabase = await createClient()
  const [{ messages, from, to }, ohlcData] = await Promise.all([
    fetchLeaderboardMessages(supabase, DAYS_BACK),
    fetchLeaderboardOHLC(supabase, DAYS_BACK)
  ])

  if (messages.length === 0) {
    return NextResponse.json({ error: 'Keine Nachrichten gefunden' }, { status: 404 })
  }

  const prompt = buildLeaderboardUserPrompt({
    messages,
    ohlcData,
    from,
    to,
    daysBack: DAYS_BACK
  })

  const result = streamText({
    model: openai(AI_MODEL),
    output: Output.object({ schema: LeaderboardResponseSchema }),
    instructions: LEADERBOARD_SYSTEM_PROMPT,
    providerOptions: { openai: { reasoningEffort: 'high' } },
    prompt,
    onEnd: async ({ output }) => {
      if (!output) return
      try {
        await supabase.from('leaderboard_analysis_cache').upsert(
          {
            cache_key: CACHE_KEY,
            data: output,
            entry_count: output.leaderboard?.length ?? 0,
            message_count: messages.length,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'cache_key' }
        )
      } catch (err) {
        console.error('[LEADERBOARD] Cache save error:', err)
      }
    }
  })

  return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) })
}
