/**
 * route.ts (prompt-preview API)
 *
 * Returns the exact prompt that the newspaper would send to the AI, broken
 * into structured blocks for the prompt inspector. This route does NOT call
 * the model, so it costs no tokens. The include flags mirror the newspaper's
 * "Kuratiere" request: a 1-day issue regenerates every module, longer ranges
 * only regenerate the newspaper itself.
 */

import { NextRequest, NextResponse, connection } from 'next/server'
import { buildDailyAIPromptPreview, getDailyAIErrorResponse } from '../../lib/daily-ai'
import { addDaysToDateKey, getNewspaperDateKey } from '../../lib/timezone'

export const maxDuration = 60

function resolveSelectedDates(datesParam: string | null, date: string, dayRange: number): string[] {
  if (datesParam) {
    const parsed = datesParam
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
    if (parsed.length > 0) return parsed
  }

  if (dayRange <= 1) return [date]

  const dates: string[] = []
  for (let offset = dayRange - 1; offset >= 0; offset--) {
    dates.push(addDaysToDateKey(date, -offset))
  }
  return dates
}

export async function GET(request: NextRequest) {
  await connection()
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || getNewspaperDateKey()
    const rawDayRange = Number(searchParams.get('dayRange') || '1')
    const dayRange = Number.isFinite(rawDayRange) && rawDayRange > 0 ? Math.floor(rawDayRange) : 1
    const timelineMode = (searchParams.get('timelineMode') || '24h') as '24h' | '3d' | '7d'
    const selectedDates = resolveSelectedDates(searchParams.get('dates'), date, dayRange)
    const isOneDay = dayRange === 1

    const preview = await buildDailyAIPromptPreview({
      selectedDates,
      dayRange,
      timelineMode,
      includeNewspaper: true,
      includeTicker: isOneDay,
      includeTimeline: isOneDay,
      includeFearGreed: isOneDay,
      includeTraderLeaderboard: isOneDay,
      source: 'newspaper'
    })

    return NextResponse.json(preview)
  } catch (error) {
    console.error('[PROMPT-PREVIEW API] Error:', error)
    const response = getDailyAIErrorResponse(error)
    return NextResponse.json(response.body, { status: response.status })
  }
}
