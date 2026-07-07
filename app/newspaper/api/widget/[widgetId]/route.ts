/**
 * Widget single-mode refresh API (Newspaper edition v3)
 *
 * POST /newspaper/api/widget/[widgetId]  body: { date?, dayRange? }
 *
 * widgetId: ticker | timeline | fearGreed | traderLeaderboard
 *
 * Regenerates exactly ONE widget with a widget-scoped prompt built from
 * the same lego blocks (same system prompt + editorial briefing, only the
 * inputs the widget needs), then patches the stored edition row(s) in
 * place. Ticker/timeline are per-edition (only the requested dayRange row
 * is patched); fearGreed/traderLeaderboard are shared modules (all three
 * rows are patched) and their side caches are refreshed too.
 *
 * Patches bump updated_at but keep generation_id/generated_at, so a
 * widget refresh never masquerades as a full regeneration.
 */

import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { writeFearGreedCache, writeTickerCache, writeTimelineCache } from '../../../lib/cache-writers'
import type { DailyFearGreedData } from '../../../lib/types'
import { DailyFearGreedSchema, DailyTickerEventSchema, DailyTimelineEventSchema } from '../../../lib/types'
import { getNewspaperDateKey } from '../../../lib/timezone'
import {
  dayRangeToTimelineMode,
  prepareEditionInputs,
  type EditionGenerationInputs
} from '../../../edition/context'
import {
  buildWidgetPromptBlocks,
  EDITION_SYSTEM_PROMPT,
  isEditionWidgetId,
  renderEditionPrompt,
  type EditionWidgetId
} from '../../../edition/prompt'
import { patchEditionRow } from '../../../edition/store'
import {
  EDITION_DAY_RANGES,
  EDITION_MODEL,
  EditionLeaderboardSchema,
  isEditionDayRange,
  type EditionDayRange,
  type NewspaperEdition
} from '../../../edition/types'

export const maxDuration = 300

const TickerWidgetSchema = z.object({
  events: z.array(DailyTickerEventSchema).min(4).max(30)
})

const TimelineWidgetSchema = z.object({
  events: z.array(DailyTimelineEventSchema).min(3).max(20),
  summary: z.string().nullable(),
  activityLevel: z.enum(['low', 'medium', 'high']).nullable(),
  dominantSentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).nullable()
})

const FearGreedWidgetSchema = z.object({
  data: DailyFearGreedSchema
})

const LeaderboardWidgetSchema = z.object({
  data: EditionLeaderboardSchema.nullable()
})

const WIDGET_SCHEMAS = {
  ticker: TickerWidgetSchema,
  timeline: TimelineWidgetSchema,
  fearGreed: FearGreedWidgetSchema,
  traderLeaderboard: LeaderboardWidgetSchema
} as const

function rangeBounds(inputs: EditionGenerationInputs, dayRange: EditionDayRange): { startDate: Date; endDate: Date } {
  const endDate = inputs.windowEnd
  return { startDate: new Date(endDate.getTime() - dayRange * 24 * 60 * 60 * 1000), endDate }
}

function countRangeStats(inputs: EditionGenerationInputs, dayRange: EditionDayRange): { messageCount: number; uniqueUsers: number } {
  const { startDate, endDate } = rangeBounds(inputs, dayRange)
  const users = new Set<string>()
  let count = 0
  for (const message of inputs.messages) {
    const t = new Date(message.time).getTime()
    if (t >= startDate.getTime() && t <= endDate.getTime()) {
      count++
      users.add(message.username)
    }
  }
  return { messageCount: count, uniqueUsers: users.size }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ widgetId: string }> }
) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  const { widgetId } = await params
  if (!isEditionWidgetId(widgetId)) {
    return NextResponse.json({ error: `Unknown widget: ${widgetId}` }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const date: string = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : getNewspaperDateKey()
  const dayRange = Number(body.dayRange ?? 1)
  if (!isEditionDayRange(dayRange)) {
    return NextResponse.json({ error: 'Invalid dayRange. Must be 1, 3, or 7' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const inputs = await prepareEditionInputs(supabase, date)
    const blocks = buildWidgetPromptBlocks(inputs, widgetId, dayRange)
    const prompt = renderEditionPrompt(blocks)

    console.log('[EDITION-WIDGET] Refreshing widget', { widgetId, date, dayRange, promptChars: prompt.length })

    const { object } = await generateObject({
      model: openai(EDITION_MODEL),
      schema: WIDGET_SCHEMAS[widgetId] as z.ZodType,
      system: EDITION_SYSTEM_PROMPT,
      providerOptions: { openai: { reasoning: { effort: 'medium' } } },
      prompt
    })

    const updatedAt = new Date().toISOString()
    const patchedEditions: NewspaperEdition[] = []

    const applyPatch = async (
      range: EditionDayRange,
      patch: (edition: NewspaperEdition) => NewspaperEdition
    ) => {
      const patched = await patchEditionRow(supabase, date, range, patch)
      if (patched) patchedEditions.push(patched)
    }

    if (widgetId === 'ticker') {
      const parsed = TickerWidgetSchema.parse(object)
      await applyPatch(dayRange, edition => ({
        ...edition,
        content: {
          ...edition.content,
          ticker: {
            events: parsed.events.map((event, index) => ({ ...event, id: `ticker-${dayRange}d-${index}` }))
          }
        }
      }))
      if (date === getNewspaperDateKey() && dayRange === 1) {
        const bounds = rangeBounds(inputs, 1)
        const stats = countRangeStats(inputs, 1)
        await writeTickerCache(
          supabase,
          parsed.events.map((event, index) => ({ ...event, id: `ticker-1d-${index}` })),
          bounds.startDate,
          bounds.endDate,
          stats.messageCount,
          stats.uniqueUsers
        )
      }
    } else if (widgetId === 'timeline') {
      const parsed = TimelineWidgetSchema.parse(object)
      await applyPatch(dayRange, edition => ({
        ...edition,
        content: {
          ...edition.content,
          timeline: {
            events: parsed.events.map((event, index) => ({
              ...event,
              id: `timeline-${dayRange}d-${index}`,
              description: event.description ?? ''
            })),
            summary: parsed.summary,
            activityLevel: parsed.activityLevel,
            dominantSentiment: parsed.dominantSentiment
          }
        }
      }))
      if (date === getNewspaperDateKey()) {
        const bounds = rangeBounds(inputs, dayRange)
        const stats = countRangeStats(inputs, dayRange)
        await writeTimelineCache(
          supabase,
          dayRangeToTimelineMode(dayRange),
          {
            events: parsed.events,
            summary: parsed.summary,
            activityLevel: parsed.activityLevel,
            dominantSentiment: parsed.dominantSentiment
          },
          bounds.startDate,
          bounds.endDate,
          stats.messageCount,
          stats.uniqueUsers
        )
      }
    } else if (widgetId === 'fearGreed') {
      const parsed = FearGreedWidgetSchema.parse(object)
      const dateRange = {
        oldestDate: inputs.dateKeys[0],
        newestDate: date,
        todayMessageCount: inputs.chatDays[inputs.chatDays.length - 1]?.totalMessages ?? 0
      }
      for (const range of EDITION_DAY_RANGES) {
        await applyPatch(range, edition => ({
          ...edition,
          shared: {
            ...edition.shared,
            fearGreed: { data: parsed.data, dateRange, updatedAt }
          }
        }))
      }
      if (date === getNewspaperDateKey()) {
        await writeFearGreedCache(
          supabase,
          parsed.data as DailyFearGreedData,
          inputs.data.totals.messageCount,
          inputs.data.totals.uniqueUsers,
          dateRange
        )
      }
    } else {
      const parsed = LeaderboardWidgetSchema.parse(object)
      for (const range of EDITION_DAY_RANGES) {
        await applyPatch(range, edition => ({
          ...edition,
          shared: {
            ...edition.shared,
            traderLeaderboard: { data: parsed.data, updatedAt: parsed.data ? updatedAt : null }
          }
        }))
      }
    }

    const activeEdition = patchedEditions.find(edition => edition.meta.dayRange === dayRange) ?? patchedEditions[0] ?? null

    return NextResponse.json({
      success: true,
      widgetId: widgetId satisfies EditionWidgetId,
      date,
      dayRange,
      updatedAt,
      patchedRanges: patchedEditions.map(edition => edition.meta.dayRange),
      edition: activeEdition
    })
  } catch (error) {
    console.error('[EDITION-WIDGET] Refresh failed:', widgetId, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Widget refresh failed' },
      { status: 500 }
    )
  }
}
