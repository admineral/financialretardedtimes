/**
 * Prompt Preview API (Newspaper v2 — Prompt Inspector backend)
 *
 * GET /newspaper/v2/api/prompt-preview?digestDate=YYYY-MM-DD
 *
 * Returns BOTH pipeline stages as structured blocks without calling the
 * model: the stage-1 daily-digest prompt for a selectable day and the full
 * stage-2 monthly composition prompt. Reuses the exact same code paths as
 * the real generation so the preview cannot drift.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addDaysToDateKey, getNewspaperDateKey, getNewspaperDayBounds } from '../../../lib/timezone'
import {
  buildDigestPrompt,
  fetchMessagesForRange,
  getDigestStatus
} from '../../lib/daily-digest'
import { prepareV2Inputs } from '../../lib/context'
import {
  buildStage2Blocks,
  estimateTokens,
  type V2PromptBlock
} from '../../lib/prompt'
import { V2_MODEL } from '../../lib/types'

export const maxDuration = 120

function totals(blocks: V2PromptBlock[]) {
  return {
    tokenEstimate: blocks.reduce((sum, block) => sum + block.tokenEstimate, 0),
    activeTokenEstimate: blocks
      .filter(block => block.active)
      .reduce((sum, block) => sum + block.tokenEstimate, 0),
    charCount: blocks.reduce((sum, block) => sum + block.charCount, 0)
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const digestDate = searchParams.get('digestDate') || addDaysToDateKey(getNewspaperDateKey(), -1)

    // Stage 1 — sample digest prompt for the selected day
    const { startDate, endDate } = getNewspaperDayBounds(digestDate)
    const dayMessages = await fetchMessagesForRange(supabase, startDate, endDate)
    const digestPrompt = buildDigestPrompt({ dateKey: digestDate, messages: dayMessages, btc: null })
    const uniqueUsers = new Set(dayMessages.map(m => m.username)).size

    const stage1Blocks: V2PromptBlock[] = [
      {
        id: 'digest_prompt',
        group: 'input',
        groupLabel: '01 — Tagesdigest',
        title: `Digest-Prompt fuer ${digestDate}`,
        description: 'Kompletter Stage-1-Prompt: Archivar-Briefing plus voller Chat-Tag (ungekuerzt).',
        active: true,
        cadence: 'Einmal pro Tag (Vergangenheit unveraenderlich)',
        refreshedBy: ['digest-backfill'],
        body: digestPrompt,
        charCount: digestPrompt.length,
        tokenEstimate: estimateTokens(digestPrompt),
        meta: [
          { label: 'Tag', value: digestDate },
          { label: 'Nachrichten', value: dayMessages.length.toLocaleString('de-DE') },
          { label: 'User', value: String(uniqueUsers) }
        ]
      },
      {
        id: 'digest_contract',
        group: 'contract',
        groupLabel: '02 — Output-Contract',
        title: 'Digest Output-Contract',
        description: 'Struktur des Tagesdigests, der in newspaper_v2_daily_digests landet.',
        active: true,
        cadence: 'Statisch — aendert sich nur bei Deploy',
        refreshedBy: [],
        body: `DIGEST_OUTPUT_CONTRACT/
- summary: 4-8 Saetze Tages-Chronik
- topics: 1-8 konkrete Themen
- sentiment: { score 0-100, label }
- notableQuotes: max 6 { username, text (EXAKT), time (ISO) }
- keyEvents: max 6 { title, description, participants }
- topUsers: max 5
- btcNote: Satz zum Tages-Preisverlauf oder null

Gespeichert wird zusaetzlich (deterministisch, nicht vom Modell):
- stats: { messageCount, uniqueUsers }
- btc: { open, close, high, low } aus 1H-Kerzen des Tages`,
        charCount: 0,
        tokenEstimate: 0,
        meta: []
      }
    ]
    stage1Blocks[1].charCount = stage1Blocks[1].body.length
    stage1Blocks[1].tokenEstimate = estimateTokens(stage1Blocks[1].body)

    // Stage 2 — full monthly composition prompt (no digest backfill!)
    const inputs = await prepareV2Inputs(supabase, { backfillDigests: false })
    const stage2Blocks = buildStage2Blocks(inputs)

    const digestStatus = await getDigestStatus(supabase)

    return NextResponse.json({
      meta: {
        issueDate: inputs.issueDate,
        rangeStart: inputs.v2Data.range.startDate,
        rangeEnd: inputs.v2Data.range.endDate,
        days: inputs.dateKeys.length,
        digestDate,
        model: V2_MODEL,
        generatedAt: new Date().toISOString(),
        counts: {
          digests: inputs.dateKeys.filter(key => inputs.digests.has(key)).length,
          digestsMissing: inputs.digestsMissing.length,
          recentMessages: inputs.recentMessages.length,
          candles: inputs.v2Data.btc.candles.length,
          leaderboardMessages: inputs.leaderboardMessages.length
        }
      },
      stage1: {
        blocks: stage1Blocks,
        totals: totals(stage1Blocks)
      },
      stage2: {
        blocks: stage2Blocks,
        totals: totals(stage2Blocks)
      },
      digestCoverage: digestStatus.coverage
    })
  } catch (error) {
    console.error('[V2 PROMPT-PREVIEW] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Prompt preview failed' },
      { status: 500 }
    )
  }
}
