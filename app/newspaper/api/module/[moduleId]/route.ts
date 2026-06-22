import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateDailyAIObject, getDailyAIErrorResponse } from '../../../lib/daily-ai'
import { getNewspaperDateKey } from '../../../lib/timezone'
import { DailyFearGreedSchema } from '../../../lib/types'
import { LeaderboardResponseSchema, type LeaderboardResponse } from '@/app/chart-leader/lib/schema'
import { fearGreedModule, traderLeaderboardModule } from '../../../modules'
import {
  getIssueExpiresAt,
  isIssueFresh,
  isNewspaperIssue,
  issueCacheTag,
  moduleCacheTag,
  readLatestNewspaperModuleCache,
  revalidateModuleCacheTags,
  type NewspaperIssue
} from '../../../engine'

type RouteContext = {
  params: Promise<{ moduleId: string }>
}

function cacheInfoForIssue(row: {
  updated_at: string
  message_count: number
  unique_users: number
  day_range: number | null
}, issue: NewspaperIssue) {
  return {
    updatedAt: row.updated_at,
    expiresAt: issue.meta.expiresAt,
    isFresh: issue.meta.isFresh,
    messageCount: row.message_count,
    uniqueUsers: row.unique_users,
    dayRange: row.day_range || issue.meta.dayRange,
    tag: issueCacheTag(issue.meta.issueDate, issue.meta.dayRange)
  }
}

async function readLatestFearGreedCache(supabase: Awaited<ReturnType<typeof createClient>>) {
  const today = getNewspaperDateKey()
  const { data, error } = await supabase
    .from('fear_greed_cache')
    .select('*')
    .eq('cache_date', today)
    .single()

  if (error) throw error

  const parsed = DailyFearGreedSchema.safeParse({
    today: {
      index: data.today_index,
      classification: data.today_classification,
      classificationDE: data.today_classification_de
    },
    last3Days: {
      index: data.last_3_days_index,
      classification: data.last_3_days_classification,
      classificationDE: data.last_3_days_classification_de
    },
    last7Days: {
      index: data.last_7_days_index,
      classification: data.last_7_days_classification,
      classificationDE: data.last_7_days_classification_de
    },
    trend: data.trend,
    insight: data.insight || data.full_data?.insight || '',
    topDrivers: data.top_drivers || data.full_data?.topDrivers || []
  })

  if (!parsed.success) {
    throw new Error('Latest Fear & Greed cache has invalid shape')
  }

  return {
    data: parsed.data,
    dateRange: data.full_data?.dateRange ?? null,
    messageCount: data.message_count || 0,
    uniqueUsers: data.unique_users || 0
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { moduleId } = await context.params
  const body = await request.json().catch(() => ({}))
  const date = body.date || getNewspaperDateKey()
  const dayRange = Number(body.dayRange || 1)
  const useLatestCache = Boolean(body.useLatestCache)

  if (!['sentiment.fearGreed', 'trading.traderLeaderboard'].includes(moduleId)) {
    return NextResponse.json(
      { error: `Module refresh is not implemented for ${moduleId}` },
      { status: 400 }
    )
  }

  if (![1, 3, 7].includes(dayRange)) {
    return NextResponse.json({ error: 'Invalid dayRange. Must be 1, 3, or 7' }, { status: 400 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  try {
    const supabase = await createClient()
    const { data: cachedIssueRow, error: readError } = await supabase
      .from('newspaper_cache')
      .select('data, message_count, unique_users, updated_at, day_range')
      .eq('cache_date', date)
      .eq('day_range', dayRange)
      .single()

    if (readError) {
      if (readError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'No composed newspaper issue found for this date/range' },
          { status: 404 }
        )
      }
      throw readError
    }

    if (!cachedIssueRow || !isNewspaperIssue(cachedIssueRow.data)) {
      return NextResponse.json(
        { error: 'Cached row is not a modular newspaper issue' },
        { status: 409 }
      )
    }

    const generated = useLatestCache ? null : await generateDailyAIObject({
      selectedDates: body.selectedDates?.length ? body.selectedDates : [date],
      dayRange,
      includeNewspaper: false,
      includeTicker: false,
      includeTimeline: false,
      includeFearGreed: moduleId === fearGreedModule.id,
      includeTraderLeaderboard: moduleId === traderLeaderboardModule.id,
      source: 'manual'
    })

    const latestFearGreedCache = moduleId === fearGreedModule.id && useLatestCache
      ? await readLatestFearGreedCache(supabase)
      : null
    const latestTraderCache = moduleId === traderLeaderboardModule.id && useLatestCache
      ? await readLatestNewspaperModuleCache<{
          data: LeaderboardResponse | null
          range: { startDate: string; endDate: string; cacheKey: string } | null
        }>(supabase, {
          moduleId: traderLeaderboardModule.id,
          cacheDate: date,
          dayRange,
          moduleVersion: traderLeaderboardModule.version
        })
      : null

    const now = new Date().toISOString()
    const nextCounts = { ...cachedIssueRow.data.resources.counts }
    const nextRanges = { ...cachedIssueRow.data.resources.ranges }
    const nextAIUsage = generated?.aiUsage ?? cachedIssueRow.data.resources.aiUsage ?? null
    const nextModules: NewspaperIssue['modules'] = {
      ...cachedIssueRow.data.modules,
      custom: cachedIssueRow.data.modules.custom ?? {}
    }

    if (moduleId === fearGreedModule.id) {
      const fearGreedData = latestFearGreedCache?.data ?? generated?.object.fearGreed.data
      const fearGreedDateRange = latestFearGreedCache?.dateRange ?? generated?.context.fearGreedDateRangeInfo ?? null
      const fearGreedMessages = latestFearGreedCache?.messageCount ?? generated?.context.counts.fearGreedMessages ?? 0
      const fearGreedUsers = latestFearGreedCache?.uniqueUsers ?? generated?.context.counts.fearGreedUsers ?? 0
      const fearGreedRange = generated?.context.ranges.fearGreed

      if (!fearGreedData) {
        return NextResponse.json({ error: 'Fear & Greed refresh returned no data' }, { status: 502 })
      }

      nextModules.fearGreed = {
        data: fearGreedData,
        dateRange: fearGreedDateRange
      }
      nextCounts.fearGreedMessages = fearGreedMessages
      nextCounts.fearGreedUsers = fearGreedUsers
      nextRanges.fearGreed = fearGreedRange
        ? {
            startDate: fearGreedRange.startDate.toISOString(),
            endDate: fearGreedRange.endDate.toISOString(),
            cacheKey: fearGreedRange.cacheKey
          }
        : cachedIssueRow.data.resources.ranges.fearGreed ?? null
    }

    if (moduleId === traderLeaderboardModule.id) {
      if (useLatestCache && !latestTraderCache) {
        return NextResponse.json({
          success: true,
          moduleId,
          pending: true,
          cacheInfo: cacheInfoForIssue(cachedIssueRow, cachedIssueRow.data)
        })
      }

      const traderLeaderboardData = latestTraderCache?.data.data ?? generated?.object.traderLeaderboard.data
      const parsed = LeaderboardResponseSchema.safeParse(traderLeaderboardData)
      const traderRange = latestTraderCache?.data.range ?? (
        generated?.context.ranges.traderLeaderboard
          ? {
              startDate: generated.context.ranges.traderLeaderboard.startDate.toISOString(),
              endDate: generated.context.ranges.traderLeaderboard.endDate.toISOString(),
              cacheKey: generated.context.ranges.traderLeaderboard.cacheKey
            }
          : cachedIssueRow.data.modules.traderLeaderboard?.range ?? null
      )

      if (!parsed.success) {
        return NextResponse.json({ error: 'Trader Leaderboard refresh returned no valid data' }, { status: 502 })
      }

      nextModules.traderLeaderboard = {
        data: parsed.data,
        updatedAt: latestTraderCache?.updatedAt ?? now,
        range: traderRange
      }
      nextCounts.traderLeaderboardMessages = latestTraderCache?.messageCount ?? generated?.context.counts.traderLeaderboardMessages ?? 0
      nextCounts.traderLeaderboardUsers = latestTraderCache?.uniqueUsers ?? generated?.context.counts.traderLeaderboardUsers ?? 0
      nextRanges.traderLeaderboard = traderRange

      if (!useLatestCache && generated?.context.ranges.traderLeaderboard) {
        await revalidateModuleCacheTags(traderLeaderboardModule.id, date, dayRange, traderLeaderboardModule.cache)
      }
    }

    const patchedIssue: NewspaperIssue = {
      ...cachedIssueRow.data,
      meta: {
        ...cachedIssueRow.data.meta,
        updatedAt: now,
        expiresAt: getIssueExpiresAt(now),
        isFresh: isIssueFresh(now),
        source: 'generated'
      },
      modules: nextModules,
      resources: {
        ...cachedIssueRow.data.resources,
        counts: nextCounts,
        ranges: nextRanges,
        aiUsage: nextAIUsage
      }
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('newspaper_cache')
      .update({
        data: patchedIssue,
        updated_at: now
      })
      .eq('cache_date', date)
      .eq('day_range', dayRange)
      .select('data, message_count, unique_users, updated_at, day_range')
      .single()

    if (updateError) throw updateError

    const issue = isNewspaperIssue(updatedRow.data) ? updatedRow.data : patchedIssue
    revalidateTag(issueCacheTag(date, dayRange), { expire: 0 })
    revalidateTag(moduleCacheTag(moduleId, date, dayRange), { expire: 0 })
    revalidateModuleCacheTags(
      moduleId,
      date,
      dayRange,
      moduleId === traderLeaderboardModule.id ? traderLeaderboardModule.cache : fearGreedModule.cache
    )

    return NextResponse.json({
      success: true,
      moduleId,
      issue,
      cacheInfo: cacheInfoForIssue(updatedRow, issue)
    })
  } catch (error) {
    console.error('[NEWSPAPER MODULE] Module refresh failed:', moduleId, error)
    const response = getDailyAIErrorResponse(error)
    return NextResponse.json(response.body, { status: response.status })
  }
}
