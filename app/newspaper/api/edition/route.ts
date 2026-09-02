/**
 * Edition read API (Newspaper edition v3)
 *
 * GET /newspaper/api/edition?date=YYYY-MM-DD|latest&range=1|3|7[&all=1]
 *
 * `date=latest` resolves to the newest cached paper in the same request;
 * every response echoes the resolved `date` and Berlin `today`.
 *
 * Serves cached edition rows with the noon-freshness rule applied at read
 * time (never a flat TTL):
 * - Past dates are immutable archive → always fresh.
 * - Today's edition is fresh iff generated today AND (before 12:00 Berlin
 *   OR generated at/after 12:00 Berlin). The "new Berlin day → new paper"
 *   behaviour follows from the same rule.
 *
 * Pre-rewrite rows are adapted through the legacy adapter so the archive
 * renders without regeneration. `all=1` returns every cached range for
 * the date in one round-trip (instant 1D/3D/7D switching).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEditionFreshness } from '../../edition/freshness'
import { adaptLegacyRow } from '../../edition/legacy'
import {
  isGenerationLocked,
  readAllEditionRows,
  readEditionRow,
  readLatestCacheDate,
  type EditionReadResult
} from '../../edition/store'
import {
  EDITION_DAY_RANGES,
  isEditionDayRange,
  type EditionCacheInfo,
  type EditionDayRange,
  type NewspaperEdition
} from '../../edition/types'
import { getNewspaperDateKey } from '../../lib/timezone'

interface EditionPayload {
  cached: boolean
  edition: NewspaperEdition | null
  cacheInfo: EditionCacheInfo | null
  freshness: { isFresh: boolean; reason: string } | null
  legacy: boolean
}

function toPayload(
  date: string,
  dayRange: EditionDayRange,
  result: EditionReadResult
): EditionPayload {
  if (result.kind === 'edition') {
    const { row } = result
    const freshness = getEditionFreshness(date, row.generatedAt)
    return {
      cached: true,
      edition: {
        ...row.edition,
        meta: {
          ...row.edition.meta,
          updatedAt: row.updatedAt,
          isFresh: freshness.isFresh,
          source: 'cache'
        }
      },
      cacheInfo: {
        updatedAt: row.updatedAt,
        generatedAt: row.generatedAt,
        generationId: row.generationId,
        isFresh: freshness.isFresh,
        messageCount: row.messageCount,
        uniqueUsers: row.uniqueUsers,
        dayRange
      },
      freshness,
      legacy: false
    }
  }

  if (result.kind === 'legacy') {
    const adapted = adaptLegacyRow({
      date,
      dayRange,
      legacyData: result.row.legacyData,
      updatedAt: result.row.updatedAt,
      messageCount: result.row.messageCount,
      uniqueUsers: result.row.uniqueUsers
    })
    if (adapted) {
      // Legacy rows only exist for past content; when they are for today
      // the noon rule still decides whether a v3 regeneration is due.
      const freshness = getEditionFreshness(date, result.row.updatedAt)
      return {
        cached: true,
        edition: {
          ...adapted,
          meta: { ...adapted.meta, isFresh: freshness.isFresh }
        },
        cacheInfo: {
          updatedAt: result.row.updatedAt,
          generatedAt: adapted.meta.generatedAt,
          generationId: adapted.meta.generationId,
          isFresh: freshness.isFresh,
          messageCount: result.row.messageCount,
          uniqueUsers: result.row.uniqueUsers,
          dayRange
        },
        freshness,
        legacy: true
      }
    }
  }

  return { cached: false, edition: null, cacheInfo: null, freshness: null, legacy: false }
}

const EMPTY_PAYLOAD: EditionPayload = { cached: false, edition: null, cacheInfo: null, freshness: null, legacy: false }

export async function GET(request: NextRequest) {
  const requestedDate = request.nextUrl.searchParams.get('date') || getNewspaperDateKey()
  const rangeParam = Number(request.nextUrl.searchParams.get('range') || request.nextUrl.searchParams.get('dayRange') || '1')
  const includeAll = request.nextUrl.searchParams.get('all') === '1'

  if (!isEditionDayRange(rangeParam)) {
    return NextResponse.json({ error: 'Invalid range. Must be 1, 3, or 7' }, { status: 400 })
  }
  if (requestedDate !== 'latest' && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const today = getNewspaperDateKey()

    // `date=latest` collapses "which paper is newest?" and "give me that
    // paper" into one round-trip. The client learns the resolved `date`
    // and `today` from the response and decides whether a newer paper
    // has to be printed.
    let date = requestedDate
    if (requestedDate === 'latest') {
      const latest = await readLatestCacheDate(supabase)
      if (!latest) {
        return NextResponse.json({
          ...EMPTY_PAYLOAD,
          editions: includeAll ? {} : undefined,
          lockActive: await isGenerationLocked(supabase, today),
          date: null,
          today
        }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
      }
      date = latest
    }

    if (includeAll) {
      const [rows, lockActive] = await Promise.all([
        readAllEditionRows(supabase, date),
        isGenerationLocked(supabase, date)
      ])

      const editions: Partial<Record<EditionDayRange, EditionPayload>> = {}
      for (const dayRange of EDITION_DAY_RANGES) {
        editions[dayRange] = toPayload(date, dayRange, rows[dayRange] ?? { kind: 'missing' })
      }

      const active = editions[rangeParam]!
      return NextResponse.json({
        ...active,
        editions,
        lockActive,
        date,
        today
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const [result, lockActive] = await Promise.all([
      readEditionRow(supabase, date, rangeParam),
      isGenerationLocked(supabase, date)
    ])

    const payload = toPayload(date, rangeParam, result)
    return NextResponse.json({
      ...payload,
      lockActive,
      date,
      today
    }, {
      status: payload.cached ? 200 : 404,
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (error) {
    console.error('[EDITION-READ] GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
