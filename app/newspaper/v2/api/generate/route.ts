/**
 * Generate API (Newspaper v2 — Stage 2)
 *
 * POST /newspaper/v2/api/generate -> streams the full monthly issue
 * (ensures stage-1 digests exist, builds the global context, one generation).
 */

import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createV2Stream } from '../../lib/generate'

export const maxDuration = 300

export async function POST() {
  await connection()
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabase = await createClient()
    const { result } = await createV2Stream({ supabase })
    return result.toTextStreamResponse()
  } catch (error) {
    console.error('[V2 GENERATE] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Monthly generation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
