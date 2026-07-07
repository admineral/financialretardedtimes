/**
 * generate.ts (Newspaper edition v3 — mega generation engine)
 *
 * One streamObject call returns all three editions (1D/3D/7D) plus shared
 * modules. onFinish builds three NewspaperEdition envelopes (per-edition
 * activity buckets, resolved chat excerpts, id-enriched ticker/timeline)
 * and persists them — write errors are THROWN into a persistence promise
 * that the route awaits via `after()`, so failures surface even when the
 * client has disconnected.
 */

import { randomUUID } from 'crypto'
import { openai } from '@ai-sdk/openai'
import { streamObject, type DeepPartial, type StreamObjectResult } from 'ai'
import type { createClient } from '@/lib/supabase/server'
import { writeFearGreedCache, writeTickerCache, writeTimelineCache } from '../lib/cache-writers'
import type { DailyFearGreedData } from '../lib/types'
import { getNewspaperDateKey } from '../lib/timezone'
import {
  computeActivityBuckets,
  dayRangeToTimelineMode,
  prepareEditionInputs,
  type EditionGenerationInputs
} from './context'
import { buildEditionPromptBlocks, EDITION_SYSTEM_PROMPT, renderEditionPrompt } from './prompt'
import { writeEditionRows } from './store'
import {
  EDITION_DAY_RANGES,
  EDITION_FORMAT_VERSION,
  EDITION_MODEL,
  EDITION_WINDOW_DAYS,
  TriEditionAISchema,
  type ChatExcerptBlock,
  type EditionAIUsage,
  type EditionBlock,
  type EditionContent,
  type EditionDayRange,
  type EditionResolvedChatMessage,
  type NewspaperEdition,
  type TriEditionAI
} from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// ═══════════════════════════════════════════════════════════════════════
// Chat excerpt resolution — replace AI refs with authentic messages
// ═══════════════════════════════════════════════════════════════════════

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@+/, '')
}

/**
 * Resolves message refs against the already-fetched 14d window first
 * (no extra queries in the common case), falling back to unmatched.
 */
export function resolveChatExcerptsFromWindow(
  inputs: Pick<EditionGenerationInputs, 'messages'>,
  blocks: EditionBlock[]
): Record<string, EditionResolvedChatMessage[]> {
  const resolved: Record<string, EditionResolvedChatMessage[]> = {}

  const byUser = new Map<string, EditionGenerationInputs['messages']>()
  for (const message of inputs.messages) {
    const key = normalizeUsername(message.username).toLowerCase()
    const list = byUser.get(key)
    if (list) list.push(message)
    else byUser.set(key, [message])
  }

  blocks.forEach((block, index) => {
    if (block.type !== 'chatExcerpt') return

    resolved[String(index)] = block.messageRefs.map(ref => {
      const fallback: EditionResolvedChatMessage = {
        username: normalizeUsername(ref.username),
        text: ref.text,
        time: ref.time,
        avatar: null,
        isModerator: false,
        matched: false
      }

      const candidates = byUser.get(normalizeUsername(ref.username).toLowerCase()) ?? []
      if (candidates.length === 0) return fallback

      const refNorm = normalizeText(ref.text)
      const refTime = new Date(ref.time).getTime()

      let best: (typeof candidates)[number] | null = null
      let bestScore = -Infinity
      for (const candidate of candidates) {
        const candidateNorm = normalizeText(candidate.text)
        let score = 0
        if (candidateNorm === refNorm) score = 3
        else if (candidateNorm.includes(refNorm) || refNorm.includes(candidateNorm)) score = 2
        else {
          const refWords = new Set(refNorm.split(' '))
          const overlap = candidateNorm.split(' ').filter(word => refWords.has(word)).length
          score = overlap >= Math.min(3, refWords.size) ? 1 : 0
        }
        if (score === 0) continue
        const distance = Number.isFinite(refTime)
          ? Math.abs(new Date(candidate.time).getTime() - refTime)
          : 0
        const weighted = score * 1e15 - distance
        if (weighted > bestScore) {
          bestScore = weighted
          best = candidate
        }
      }

      if (!best) return fallback
      return {
        username: best.username,
        text: best.text,
        time: best.time,
        avatar: best.user_pic ?? null,
        isModerator: Boolean(best.is_moderator),
        matched: true
      }
    })
  })

  return resolved
}

// ═══════════════════════════════════════════════════════════════════════
// Envelope assembly
// ═══════════════════════════════════════════════════════════════════════

interface UsageInput {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  inputTokenDetails?: { cacheReadTokens?: number }
  outputTokenDetails?: { reasoningTokens?: number }
}

function summarizeUsage(usage: UsageInput | undefined, modelId?: string): EditionAIUsage | null {
  if (!usage) return null
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
  return {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    totalTokens: num(usage.totalTokens),
    cachedInputTokens: num(usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens),
    reasoningTokens: num(usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens),
    modelId: modelId ?? EDITION_MODEL
  }
}

function withEventIds(content: EditionContent, dayRange: EditionDayRange): NewspaperEdition['content'] {
  return {
    ...content,
    ticker: {
      events: (content.ticker?.events ?? []).map((event, index) => ({
        ...event,
        id: `ticker-${dayRange}d-${index}`
      }))
    },
    timeline: {
      ...content.timeline,
      events: (content.timeline?.events ?? []).map((event, index) => ({
        ...event,
        id: `timeline-${dayRange}d-${index}`,
        description: event.description ?? ''
      })),
      summary: content.timeline?.summary ?? null,
      activityLevel: content.timeline?.activityLevel ?? null,
      dominantSentiment: content.timeline?.dominantSentiment ?? null
    }
  }
}

function rangeBounds(inputs: EditionGenerationInputs, dayRange: EditionDayRange): { startDate: Date; endDate: Date } {
  const endDate = inputs.windowEnd
  const startDate = new Date(endDate.getTime() - dayRange * 24 * 60 * 60 * 1000)
  return { startDate, endDate }
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

export function buildEditionEnvelopes(params: {
  inputs: EditionGenerationInputs
  object: TriEditionAI
  generationId: string
  generatedAt: string
  aiUsage: EditionAIUsage | null
}): NewspaperEdition[] {
  const { inputs, object, generationId, generatedAt, aiUsage } = params
  const updatedAt = new Date().toISOString()

  const fearGreedDateRange = {
    oldestDate: inputs.dateKeys[0],
    newestDate: inputs.anchorDate,
    todayMessageCount: inputs.chatDays[inputs.chatDays.length - 1]?.totalMessages ?? 0
  }

  const shared: NewspaperEdition['shared'] = {
    trendingTopics: object.trendingTopics,
    topContributors: object.topContributors.map(contributor => ({
      ...contributor,
      avatar: inputs.userAvatarMap.get(contributor.username)
    })),
    fearGreed: { data: object.fearGreed, dateRange: fearGreedDateRange, updatedAt },
    traderLeaderboard: { data: object.traderLeaderboard, updatedAt: object.traderLeaderboard ? updatedAt : null },
    activeChatters: inputs.activeChatters
  }

  const editionContents: Record<EditionDayRange, EditionContent> = {
    1: object.edition1d,
    3: object.edition3d,
    7: object.edition7d
  }

  return EDITION_DAY_RANGES.map(dayRange => {
    const content = editionContents[dayRange]
    const mode = dayRangeToTimelineMode(dayRange)
    const activity = computeActivityBuckets(inputs.messages, rangeBounds(inputs, dayRange), mode)
    const stats = countRangeStats(inputs, dayRange)

    return {
      meta: {
        formatVersion: EDITION_FORMAT_VERSION,
        editionDate: inputs.anchorDate,
        selectedDates: [inputs.anchorDate],
        dayRange,
        windowDays: EDITION_WINDOW_DAYS,
        generationId,
        generatedAt,
        updatedAt,
        isFresh: true,
        source: 'generated' as const,
        model: EDITION_MODEL,
        aiUsage
      },
      shared,
      content: withEventIds(content, dayRange),
      activity,
      data: inputs.data,
      chatExcerpts: resolveChatExcerptsFromWindow(inputs, content.blocks),
      stats
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════
// Side caches (fear/greed history + ticker/timeline caches other pages use)
// ═══════════════════════════════════════════════════════════════════════

async function writeSideCaches(
  supabase: SupabaseServerClient,
  inputs: EditionGenerationInputs,
  object: TriEditionAI
): Promise<void> {
  // Only today's generation feeds the live widget caches.
  if (inputs.anchorDate !== getNewspaperDateKey()) return

  const tasks: Promise<void>[] = []

  const stats1d = countRangeStats(inputs, 1)
  tasks.push(writeFearGreedCache(
    supabase,
    object.fearGreed as DailyFearGreedData,
    inputs.data.totals.messageCount,
    inputs.data.totals.uniqueUsers,
    {
      oldestDate: inputs.dateKeys[0],
      newestDate: inputs.anchorDate,
      todayMessageCount: stats1d.messageCount
    }
  ))

  const bounds1d = rangeBounds(inputs, 1)
  tasks.push(writeTickerCache(
    supabase,
    (object.edition1d.ticker?.events ?? []).map((event, index) => ({ ...event, id: `ticker-1d-${index}` })),
    bounds1d.startDate,
    bounds1d.endDate,
    stats1d.messageCount,
    stats1d.uniqueUsers
  ))

  for (const dayRange of EDITION_DAY_RANGES) {
    const content = dayRange === 1 ? object.edition1d : dayRange === 3 ? object.edition3d : object.edition7d
    const mode = dayRangeToTimelineMode(dayRange)
    const bounds = rangeBounds(inputs, dayRange)
    const stats = countRangeStats(inputs, dayRange)
    tasks.push(writeTimelineCache(
      supabase,
      mode,
      {
        events: content.timeline?.events ?? [],
        summary: content.timeline?.summary ?? null,
        activityLevel: content.timeline?.activityLevel ?? null,
        dominantSentiment: content.timeline?.dominantSentiment ?? null
      },
      bounds.startDate,
      bounds.endDate,
      stats.messageCount,
      stats.uniqueUsers
    ))
  }

  await Promise.all(tasks)
}

// ═══════════════════════════════════════════════════════════════════════
// Stream creation
// ═══════════════════════════════════════════════════════════════════════

export interface EditionStreamHandle {
  result: StreamObjectResult<DeepPartial<TriEditionAI>, TriEditionAI, never>
  inputs: EditionGenerationInputs
  generationId: string
  generatedAt: string
  /**
   * Resolves when all three edition rows are persisted, rejects if the
   * generation produced no object or any write failed. The route must
   * await this via `after()`/waitUntil so persistence survives client
   * disconnects and errors are surfaced in logs/monitoring.
   */
  persisted: Promise<{ editions: NewspaperEdition[] }>
}

export async function createEditionStream(options: {
  supabase: SupabaseServerClient
  anchorDate?: string
  inputs?: EditionGenerationInputs
}): Promise<EditionStreamHandle> {
  const { supabase } = options
  const inputs = options.inputs ?? await prepareEditionInputs(supabase, options.anchorDate)
  const blocks = buildEditionPromptBlocks(inputs)
  const prompt = renderEditionPrompt(blocks)
  const generationId = randomUUID()
  const generatedAt = new Date().toISOString()

  console.log('[EDITION-GENERATE] Starting tri-edition generation', {
    anchorDate: inputs.anchorDate,
    generationId,
    messages: inputs.messages.length,
    promptChars: prompt.length,
    sampledDays: inputs.chatDays.filter(day => day.sampled).length
  })

  let resolvePersisted!: (value: { editions: NewspaperEdition[] }) => void
  let rejectPersisted!: (reason: Error) => void
  const persisted = new Promise<{ editions: NewspaperEdition[] }>((resolve, reject) => {
    resolvePersisted = resolve
    rejectPersisted = reject
  })
  // The route always awaits `persisted` via after(); this guard only
  // prevents unhandled-rejection noise if it does not.
  persisted.catch(() => {})

  const result = streamObject({
    model: openai(EDITION_MODEL),
    schema: TriEditionAISchema,
    system: EDITION_SYSTEM_PROMPT,
    providerOptions: { openai: { reasoning: { effort: 'high' } } },
    prompt,
    onFinish: async ({ object, error, usage, response }) => {
      if (!object) {
        const reason = new Error(
          `Tri-edition generation returned no valid object: ${error instanceof Error ? error.message : String(error ?? 'schema validation failed')}`
        )
        console.error('[EDITION-GENERATE]', reason.message)
        rejectPersisted(reason)
        return
      }

      try {
        const editions = buildEditionEnvelopes({
          inputs,
          object,
          generationId,
          generatedAt,
          aiUsage: summarizeUsage(usage as UsageInput, (response as { modelId?: string } | undefined)?.modelId)
        })

        await writeEditionRows(supabase, editions)
        await writeSideCaches(supabase, inputs, object)

        console.log('[EDITION-GENERATE] Persisted 3 edition rows', {
          anchorDate: inputs.anchorDate,
          generationId,
          blocks1d: object.edition1d.blocks.length,
          blocks3d: object.edition3d.blocks.length,
          blocks7d: object.edition7d.blocks.length,
          leaderboard: object.traderLeaderboard ? object.traderLeaderboard.leaderboard.length : 0
        })
        resolvePersisted({ editions })
      } catch (persistError) {
        const reason = persistError instanceof Error ? persistError : new Error(String(persistError))
        console.error('[EDITION-GENERATE] Persistence failed:', reason.message)
        rejectPersisted(reason)
      }
    },
    onError: ({ error }) => {
      console.error('[EDITION-GENERATE] Stream error:', error)
    }
  })

  return { result, inputs, generationId, generatedAt, persisted }
}

export type { ChatExcerptBlock }
