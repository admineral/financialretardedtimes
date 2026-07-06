/**
 * generate.ts (Newspaper v2 — Stage 2 engine)
 *
 * Creates the streaming monthly-issue generation, resolves chatExcerpt
 * references against real tv_chat_messages rows, and reads/writes the
 * composed issue in `newspaper_v2_cache`.
 */

import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import type { createClient } from '@/lib/supabase/server'
import { prepareV2Inputs, type V2GenerationInputs } from './context'
import { buildStage2Blocks, renderPromptBlocks, V2_SYSTEM_PROMPT } from './prompt'
import {
  MonthlyIssueAISchema,
  V2_ISSUE_TTL_SECONDS,
  V2_ISSUE_VERSION,
  V2_MODEL,
  type ChatExcerptBlock,
  type MonthlyIssueAI,
  type V2AIUsage,
  type V2Issue,
  type V2ResolvedChatMessage
} from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// ═══════════════════════════════════════════════════════════════════════
// Issue cache
// ═══════════════════════════════════════════════════════════════════════

export function isV2IssueFresh(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < V2_ISSUE_TTL_SECONDS * 1000
}

export async function readLatestV2Issue(
  supabase: SupabaseServerClient
): Promise<{ issue: V2Issue; updatedAt: string } | null> {
  const { data, error } = await supabase
    .from('newspaper_v2_cache')
    .select('issue_date, data, updated_at')
    .order('issue_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.data) return null

  const issue = data.data as V2Issue
  if (issue.meta?.version !== V2_ISSUE_VERSION) return null

  const isFresh = isV2IssueFresh(data.updated_at)
  return {
    issue: {
      ...issue,
      meta: {
        ...issue.meta,
        isFresh,
        source: 'cache'
      }
    },
    updatedAt: data.updated_at
  }
}

export async function writeV2Issue(
  supabase: SupabaseServerClient,
  issue: V2Issue
): Promise<void> {
  const { error } = await supabase
    .from('newspaper_v2_cache')
    .upsert({
      issue_date: issue.meta.issueDate,
      data: issue,
      message_count: issue.data.totals.messageCount,
      unique_users: issue.data.totals.uniqueUsers,
      updated_at: issue.meta.updatedAt
    }, { onConflict: 'issue_date' })

  if (error) {
    console.error('[V2-GENERATE] Issue cache write failed:', error.message)
  }
}

export async function deleteV2Issue(
  supabase: SupabaseServerClient,
  issueDate: string
): Promise<void> {
  await supabase.from('newspaper_v2_cache').delete().eq('issue_date', issueDate)
}

// ═══════════════════════════════════════════════════════════════════════
// Chat excerpt resolution — replace AI refs with authentic messages
// ═══════════════════════════════════════════════════════════════════════

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@+/, '')
}

async function resolveMessageRef(
  supabase: SupabaseServerClient,
  ref: { username: string; time: string; text: string }
): Promise<V2ResolvedChatMessage> {
  const fallback: V2ResolvedChatMessage = {
    username: ref.username,
    text: ref.text,
    time: ref.time,
    avatar: null,
    isModerator: false,
    matched: false
  }

  const refTime = new Date(ref.time).getTime()
  if (!Number.isFinite(refTime)) return fallback

  const username = normalizeUsername(ref.username)
  const refNorm = normalizeText(ref.text)

  interface MessageRow {
    username: string
    text: string
    time: string
    is_moderator: boolean | null
    user_pic: string | null
  }

  const pickBest = (rows: MessageRow[]): MessageRow | null => {
    let best: MessageRow | null = null
    let bestScore = -1

    for (const row of rows) {
      const rowNorm = normalizeText(row.text ?? '')
      let score = 0
      if (rowNorm === refNorm) score = 3
      else if (rowNorm.includes(refNorm) || refNorm.includes(rowNorm)) score = 2
      else {
        const refWords = new Set(refNorm.split(' '))
        const overlap = rowNorm.split(' ').filter(word => refWords.has(word)).length
        score = overlap >= Math.min(3, refWords.size) ? 1 : 0
      }
      // Prefer closer timestamps on tie.
      const distance = Math.abs(new Date(row.time).getTime() - refTime)
      const weighted = score * 1e15 - distance
      if (score > 0 && weighted > bestScore) {
        bestScore = weighted
        best = row
      }
    }

    return best
  }

  // Pass 1: same user within ±60 minutes of the referenced timestamp.
  const windowStart = new Date(refTime - 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(refTime + 60 * 60 * 1000).toISOString()
  const windowed = await supabase
    .from('tv_chat_messages')
    .select('username, text, time, is_moderator, user_pic')
    .eq('username', username)
    .gte('time', windowStart)
    .lte('time', windowEnd)
    .order('time', { ascending: true })
    .limit(100)

  let best = windowed.error ? null : pickBest((windowed.data ?? []) as MessageRow[])

  // Pass 2: text-snippet search without time window.
  if (!best && ref.text.length >= 8) {
    const snippet = ref.text.slice(0, 40).replace(/[%_\\]/g, char => `\\${char}`)
    const wide = await supabase
      .from('tv_chat_messages')
      .select('username, text, time, is_moderator, user_pic')
      .eq('username', username)
      .ilike('text', `%${snippet}%`)
      .order('time', { ascending: true })
      .limit(20)
    if (!wide.error) {
      best = pickBest((wide.data ?? []) as MessageRow[])
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
}

export async function resolveChatExcerpts(
  supabase: SupabaseServerClient,
  content: MonthlyIssueAI
): Promise<Record<string, V2ResolvedChatMessage[]>> {
  const resolved: Record<string, V2ResolvedChatMessage[]> = {}

  const excerptBlocks = content.blocks
    .map((block, index) => ({ block, index }))
    .filter((entry): entry is { block: ChatExcerptBlock; index: number } => entry.block.type === 'chatExcerpt')

  for (const { block, index } of excerptBlocks) {
    const messages = await Promise.all(
      block.messageRefs.map(ref => resolveMessageRef(supabase, ref))
    )
    resolved[String(index)] = messages
  }

  return resolved
}

// ═══════════════════════════════════════════════════════════════════════
// Stream generation
// ═══════════════════════════════════════════════════════════════════════

interface UsageInput {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  outputTokenDetails?: { reasoningTokens?: number }
}

function summarizeUsage(usage: UsageInput | undefined, modelId?: string): V2AIUsage | null {
  if (!usage) return null
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
  return {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    totalTokens: num(usage.totalTokens),
    reasoningTokens: num(usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens),
    modelId: modelId ?? V2_MODEL
  }
}

export async function createV2Stream(options: {
  supabase: SupabaseServerClient
  inputs?: V2GenerationInputs
}) {
  const supabase = options.supabase
  const inputs = options.inputs ?? await prepareV2Inputs(supabase)
  const blocks = buildStage2Blocks(inputs)
  const prompt = renderPromptBlocks(blocks)
  const generatedAt = new Date().toISOString()

  console.log('[V2-GENERATE] Starting monthly issue generation', {
    issueDate: inputs.issueDate,
    digests: inputs.dateKeys.filter(key => inputs.digests.has(key)).length,
    recentMessages: inputs.recentMessages.length,
    promptChars: prompt.length
  })

  const result = streamObject({
    model: openai(V2_MODEL),
    schema: MonthlyIssueAISchema,
    system: V2_SYSTEM_PROMPT,
    providerOptions: { openai: { reasoning: { effort: 'high' } } },
    prompt,
    onFinish: async ({ object, error, usage, response }) => {
      if (!object) {
        if (error) console.error('[V2-GENERATE] Schema error:', error)
        return
      }

      try {
        const chatExcerpts = await resolveChatExcerpts(supabase, object)
        const updatedAt = new Date().toISOString()

        const issue: V2Issue = {
          meta: {
            issueDate: inputs.issueDate,
            rangeStart: inputs.v2Data.range.startDate,
            rangeEnd: inputs.v2Data.range.endDate,
            days: inputs.v2Data.range.days,
            generatedAt,
            updatedAt,
            expiresAt: new Date(Date.now() + V2_ISSUE_TTL_SECONDS * 1000).toISOString(),
            isFresh: true,
            source: 'generated',
            version: V2_ISSUE_VERSION,
            model: V2_MODEL,
            aiUsage: summarizeUsage(usage as UsageInput, (response as { modelId?: string } | undefined)?.modelId)
          },
          content: object,
          data: inputs.v2Data,
          chatExcerpts
        }

        await writeV2Issue(supabase, issue)
        console.log('[V2-GENERATE] Issue cached', {
          issueDate: inputs.issueDate,
          blocks: object.blocks.length,
          excerpts: Object.keys(chatExcerpts).length
        })
      } catch (cacheError) {
        console.error('[V2-GENERATE] Cache write failed:', cacheError)
      }
    },
    onError: ({ error }) => {
      console.error('[V2-GENERATE] Stream error:', error)
    }
  })

  return { result, inputs }
}
