/**
 * Issue API (Newspaper v2)
 *
 * GET  /newspaper/v2/api/issue -> latest cached monthly issue (404 if none)
 * POST /newspaper/v2/api/issue -> invalidate today's cached issue (force regen)
 */

import { connection, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNewspaperDateKey } from '../../../lib/timezone'
import { deleteV2Issue, readLatestV2Issue } from '../../lib/generate'

export async function GET() {
  await connection()
  try {
    const supabase = await createClient()
    const cached = await readLatestV2Issue(supabase)

    if (!cached) {
      return NextResponse.json({ error: 'No monthly issue cached yet' }, { status: 404 })
    }

    return NextResponse.json({
      issue: cached.issue,
      cacheInfo: {
        updatedAt: cached.updatedAt,
        expiresAt: cached.issue.meta.expiresAt,
        isFresh: cached.issue.meta.isFresh,
        issueDate: cached.issue.meta.issueDate,
        messageCount: cached.issue.data.totals.messageCount,
        uniqueUsers: cached.issue.data.totals.uniqueUsers
      }
    })
  } catch (error) {
    console.error('[V2 ISSUE GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Issue read failed' },
      { status: 500 }
    )
  }
}

export async function POST() {
  await connection()
  try {
    const supabase = await createClient()
    await deleteV2Issue(supabase, getNewspaperDateKey())
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[V2 ISSUE POST] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Issue invalidate failed' },
      { status: 500 }
    )
  }
}
