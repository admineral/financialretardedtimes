/**
 * Data API (Newspaper v2)
 *
 * GET /newspaper/v2/api/data -> deterministic 30-day data payload
 * (candles, sentiment series, activity, F&G history, predictions).
 * Used by the client to bind dataComponent blocks while the AI stream
 * is still running.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildV2Data } from '../../lib/data'

export async function GET() {
  try {
    const supabase = await createClient()
    const data = await buildV2Data(supabase)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[V2 DATA GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Data build failed' },
      { status: 500 }
    )
  }
}
