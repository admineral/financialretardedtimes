/**
 * route.ts (refresh-newspaper cron)
 *
 * Cron endpoint to pre-generate today's tri-edition newspaper (1D/3D/7D)
 * so first visitors get an instant cached page.
 *
 * Uses the v3 edition pipeline directly (no internal HTTP hop):
 * - checks the noon-freshness rule first and skips if today's edition
 *   is already fresh
 * - respects the single-flight generation lock (skips if another
 *   generation is running)
 * - drains the AI stream in-process and awaits persistence, so a cron
 *   run only reports success once all three edition rows are written
 *
 * ENDPOINT: GET /api/cron/refresh-newspaper
 * CRON: see vercel.json — `5 4,5,10,11 * * *` (UTC). Vercel cron has no
 * timezone, so each Berlin print time is scheduled at both its CET and
 * CEST UTC offsets and the noon rule skips the duplicate:
 *   06:05 Berlin → Morgenausgabe (first paper of the new Berlin day)
 *   12:05 Berlin → Mittagsausgabe (the after-noon paper)
 * Result: at most two AI print runs per day, regardless of DST.
 */

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { cronLogger as log } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { getNewspaperDateKey } from '@/app/newspaper/lib/timezone'
import { createEditionStream } from '@/app/newspaper/edition/generate'
import { getEditionFreshness } from '@/app/newspaper/edition/freshness'
import {
  acquireGenerationLock,
  readEditionRow,
  releaseGenerationLock
} from '@/app/newspaper/edition/store'

export const maxDuration = 800

export async function GET() {
  const headersList = await headers()
  const authHeader = headersList.get('authorization')

  if (process.env.VERCEL_ENV === 'production') {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'OpenAI API key not configured' },
      { status: 500 }
    )
  }

  const today = getNewspaperDateKey()
  const supabase = await createClient()

  try {
    // Skip when today's 1D edition already satisfies the noon rule —
    // the 3D/7D rows share the same generation, so 1D is representative.
    const existing = await readEditionRow(supabase, today, 1)
    if (existing.kind === 'edition') {
      const freshness = getEditionFreshness(today, existing.row.generatedAt)
      if (freshness.isFresh) {
        log.info('Newspaper refresh skipped — edition fresh', {
          date: today,
          generatedAt: existing.row.generatedAt
        })
        return NextResponse.json({ success: true, skipped: true, reason: 'fresh', date: today })
      }
    }

    const holder = `cron-${randomUUID()}`
    const locked = await acquireGenerationLock(supabase, today, holder)
    if (!locked) {
      log.info('Newspaper refresh skipped — generation already in progress', { date: today })
      return NextResponse.json({ success: true, skipped: true, reason: 'locked', date: today })
    }

    log.info('Starting newspaper tri-edition refresh', { date: today })

    try {
      const handle = await createEditionStream({ supabase, anchorDate: today })

      // Drain the stream (single consumer) so onFinish fires, then wait
      // for all three edition rows to be persisted.
      for await (const _chunk of handle.result.textStream) {
        // drain only
      }
      const { editions } = await handle.persisted

      log.info('Newspaper refresh completed', {
        date: today,
        generationId: handle.generationId,
        editions: editions.length
      })

      return NextResponse.json({
        success: true,
        date: today,
        generationId: handle.generationId,
        editions: editions.map(edition => edition.meta.dayRange)
      })
    } finally {
      await releaseGenerationLock(supabase, today, holder)
    }
  } catch (error) {
    log.error('Newspaper refresh error', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
