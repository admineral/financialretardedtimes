import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  getIssueExpiresAt,
  isIssueFresh,
  isNewspaperIssue,
  issueCacheTag,
  moduleCacheTag,
  readLatestNewspaperModuleCache
} from '../../engine'
import { getNewspaperDateKey } from '../../lib/timezone'
import type { NewspaperIssue } from '../../engine'
import { firstPartyNewspaperModules, traderLeaderboardModule } from '../../modules'
import { LeaderboardResponseSchema, type LeaderboardResponse } from '@/app/chart-leader/lib/schema'

function markIssueForResponse(issue: NewspaperIssue, updatedAt: string, source: NewspaperIssue['meta']['source']): NewspaperIssue {
  return {
    ...issue,
    meta: {
      ...issue.meta,
      updatedAt,
      expiresAt: getIssueExpiresAt(updatedAt),
      isFresh: isIssueFresh(updatedAt),
      source
    }
  }
}

async function hydrateIssueModulesFromCache(
  supabase: Awaited<ReturnType<typeof createClient>>,
  issue: NewspaperIssue
): Promise<NewspaperIssue> {
  if (issue.modules.traderLeaderboard?.data) return issue

  const cached = await readLatestNewspaperModuleCache<{
    data: LeaderboardResponse | null
    range: { startDate: string; endDate: string; cacheKey: string } | null
  }>(supabase, {
    moduleId: traderLeaderboardModule.id,
    cacheDate: issue.meta.issueDate,
    dayRange: issue.meta.dayRange,
    moduleVersion: traderLeaderboardModule.version
  })

  const parsed = cached?.data.data ? LeaderboardResponseSchema.safeParse(cached.data.data) : null
  if (!cached || !parsed?.success) return issue

  return {
    ...issue,
    modules: {
      ...issue.modules,
      traderLeaderboard: {
        data: parsed.data,
        updatedAt: cached.updatedAt,
        range: cached.data.range
      },
      custom: issue.modules.custom ?? {}
    },
    resources: {
      ...issue.resources,
      counts: {
        ...issue.resources.counts,
        traderLeaderboardMessages: cached.messageCount,
        traderLeaderboardUsers: cached.uniqueUsers
      },
      ranges: {
        ...issue.resources.ranges,
        traderLeaderboard: cached.data.range
      }
    }
  }
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') || getNewspaperDateKey()
  const dayRange = Number(request.nextUrl.searchParams.get('dayRange') || '1')

  if (![1, 3, 7].includes(dayRange)) {
    return NextResponse.json({ error: 'Invalid dayRange. Must be 1, 3, or 7' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('newspaper_cache')
      .select('data, message_count, unique_users, updated_at, day_range')
      .eq('cache_date', date)
      .eq('day_range', dayRange)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ cached: false, error: 'No issue found' }, { status: 404 })
      }
      throw error
    }

    if (!data || !isNewspaperIssue(data.data)) {
      return NextResponse.json({
        cached: false,
        legacy: Boolean(data?.data),
        error: 'Cached row is not a modular newspaper issue'
      }, { status: 404 })
    }

    const issue = await hydrateIssueModulesFromCache(
      supabase,
      markIssueForResponse(data.data, data.updated_at, 'cache')
    )
    return NextResponse.json({
      cached: true,
      issue,
      cacheInfo: {
        updatedAt: data.updated_at,
        expiresAt: issue.meta.expiresAt,
        isFresh: issue.meta.isFresh,
        messageCount: data.message_count,
        uniqueUsers: data.unique_users,
        dayRange: data.day_range || dayRange,
        tag: issueCacheTag(date, dayRange)
      }
    })
  } catch (error) {
    console.error('[NEWSPAPER ISSUE] GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const date = body.date || getNewspaperDateKey()
  const dayRange = Number(body.dayRange || 1)

  revalidateTag(issueCacheTag(date, dayRange), { expire: 0 })
  revalidateTag('newspaper:latest', { expire: 0 })
  for (const newspaperModule of firstPartyNewspaperModules) {
    for (const tag of newspaperModule.cache.tags) {
      revalidateTag(tag, { expire: 0 })
    }
    revalidateTag(moduleCacheTag(newspaperModule.id, date, dayRange), { expire: 0 })
  }

  return NextResponse.json({
    success: true,
    revalidated: [
      issueCacheTag(date, dayRange),
      'newspaper:latest',
      ...firstPartyNewspaperModules.flatMap(newspaperModule => [
        ...newspaperModule.cache.tags,
        moduleCacheTag(newspaperModule.id, date, dayRange)
      ])
    ]
  })
}
