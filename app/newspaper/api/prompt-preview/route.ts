/**
 * route.ts (prompt-preview API — edition v3)
 *
 * Returns the exact prompt lego blocks that the tri-edition mega call
 * (or a widget single-mode call) would send to the AI, for the prompt
 * inspector. Does NOT call the model — costs no tokens.
 *
 * Query params:
 * - date: anchor date (YYYY-MM-DD, defaults to today Berlin)
 * - view: 'edition' (default) for the mega call, or one of the widget
 *   ids (ticker | timeline | fearGreed | traderLeaderboard)
 * - dayRange: 1 | 3 | 7 — only relevant for widget views
 */

import { NextRequest, NextResponse, connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNewspaperDateKey } from '../../lib/timezone'
import { prepareEditionInputs } from '../../edition/context'
import {
  buildEditionPromptBlocks,
  buildWidgetPromptBlocks,
  estimateTokens,
  isEditionWidgetId,
  EDITION_SYSTEM_PROMPT,
  type EditionPromptBlock
} from '../../edition/prompt'
import { EDITION_DAY_RANGES, EDITION_MODEL, EDITION_WINDOW_DAYS, type EditionDayRange } from '../../edition/types'

export const maxDuration = 120

function systemBlock(): EditionPromptBlock {
  return {
    id: 'system_prompt',
    group: 'system',
    groupLabel: '00 — Redaktion',
    title: 'System-Prompt',
    description: 'Die Rollen-Instruktion, die als system message gesendet wird.',
    active: true,
    cadence: 'Statisch — aendert sich nur bei Deploy',
    refreshedBy: [],
    body: EDITION_SYSTEM_PROMPT,
    charCount: EDITION_SYSTEM_PROMPT.length,
    tokenEstimate: estimateTokens(EDITION_SYSTEM_PROMPT),
    meta: []
  }
}

export async function GET(request: NextRequest) {
  await connection()
  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const anchorDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : getNewspaperDateKey()

    const viewParam = searchParams.get('view') || 'edition'
    const rawDayRange = Number(searchParams.get('dayRange') || '1')
    const dayRange: EditionDayRange = (EDITION_DAY_RANGES as readonly number[]).includes(rawDayRange)
      ? (rawDayRange as EditionDayRange)
      : 1

    const supabase = await createClient()
    const inputs = await prepareEditionInputs(supabase, anchorDate)

    const promptBlocks = isEditionWidgetId(viewParam)
      ? buildWidgetPromptBlocks(inputs, viewParam, dayRange)
      : buildEditionPromptBlocks(inputs)

    const blocks = [systemBlock(), ...promptBlocks]
    const tokenEstimate = blocks.reduce((sum, block) => sum + block.tokenEstimate, 0)
    const activeTokenEstimate = blocks
      .filter(block => block.active)
      .reduce((sum, block) => sum + block.tokenEstimate, 0)
    const charCount = blocks.reduce((sum, block) => sum + block.charCount, 0)

    return NextResponse.json({
      meta: {
        anchorDate,
        view: isEditionWidgetId(viewParam) ? viewParam : 'edition',
        dayRange,
        windowDays: EDITION_WINDOW_DAYS,
        dateKeys: inputs.dateKeys,
        messageCount: inputs.messages.length,
        sampledDays: inputs.chatDays.filter(day => day.sampled).length,
        generatedAt: new Date().toISOString(),
        model: EDITION_MODEL
      },
      blocks,
      totals: { tokenEstimate, activeTokenEstimate, charCount }
    })
  } catch (error) {
    console.error('[PROMPT-PREVIEW API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Prompt preview failed' },
      { status: 500 }
    )
  }
}
