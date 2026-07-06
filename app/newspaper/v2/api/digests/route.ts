/**
 * Digests API (Newspaper v2 — Stage 1)
 *
 * GET  /newspaper/v2/api/digests  -> coverage status of the last 30 days
 * POST /newspaper/v2/api/digests  -> backfill a batch of missing digests
 *                                    (call repeatedly until remaining === 0)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureDigests, getDigestStatus } from '../../lib/daily-digest'

export const maxDuration = 300

export async function GET() {
  try {
    const supabase = await createClient()
    const status = await getDigestStatus(supabase)
    return NextResponse.json(status)
  } catch (error) {
    console.error('[V2 DIGESTS GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Digest status failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const maxPerRun = typeof body.maxPerRun === 'number'
      ? Math.max(1, Math.min(body.maxPerRun, 10))
      : 4

    const supabase = await createClient()
    const { generated, remaining } = await ensureDigests(supabase, { maxPerRun })

    return NextResponse.json({
      generated,
      remaining,
      done: remaining.length === 0
    })
  } catch (error) {
    console.error('[V2 DIGESTS POST] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Digest backfill failed' },
      { status: 500 }
    )
  }
}
