/**
 * store.ts (Newspaper edition v3 — persistence)
 *
 * Reads/writes edition rows in `newspaper_cache` (one row per
 * cache_date + day_range, three rows per generation sharing a
 * generation_id) and manages the single-flight generation lock.
 *
 * Unlike the old engine/cache.ts, write failures THROW — a failed
 * persistence must surface, never silently pretend success.
 */

import type { createClient } from '@/lib/supabase/server'
import {
  EDITION_DAY_RANGES,
  EDITION_FORMAT_VERSION,
  isNewspaperEdition,
  type EditionDayRange,
  type NewspaperEdition
} from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface EditionRow {
  edition: NewspaperEdition
  updatedAt: string
  generatedAt: string
  generationId: string
  messageCount: number
  uniqueUsers: number
}

export interface LegacyEditionRow {
  legacyData: unknown
  updatedAt: string
  messageCount: number
  uniqueUsers: number
}

export type EditionReadResult =
  | { kind: 'edition'; row: EditionRow }
  | { kind: 'legacy'; row: LegacyEditionRow }
  | { kind: 'missing' }

const SELECT_COLUMNS = 'data, message_count, unique_users, updated_at, day_range, generation_id, generated_at, format_version'

interface RawCacheRow {
  data: unknown
  message_count: number | null
  unique_users: number | null
  updated_at: string
  day_range: number | null
  generation_id: string | null
  generated_at: string | null
  format_version: string | null
}

function mapRow(raw: RawCacheRow): EditionReadResult {
  if (raw.format_version === EDITION_FORMAT_VERSION && isNewspaperEdition(raw.data)) {
    return {
      kind: 'edition',
      row: {
        edition: raw.data,
        updatedAt: raw.updated_at,
        generatedAt: raw.generated_at ?? raw.data.meta.generatedAt,
        generationId: raw.generation_id ?? raw.data.meta.generationId,
        messageCount: raw.message_count ?? 0,
        uniqueUsers: raw.unique_users ?? 0
      }
    }
  }

  if (raw.data) {
    return {
      kind: 'legacy',
      row: {
        legacyData: raw.data,
        updatedAt: raw.updated_at,
        messageCount: raw.message_count ?? 0,
        uniqueUsers: raw.unique_users ?? 0
      }
    }
  }

  return { kind: 'missing' }
}

export async function readEditionRow(
  supabase: SupabaseServerClient,
  date: string,
  dayRange: EditionDayRange
): Promise<EditionReadResult> {
  const { data, error } = await supabase
    .from('newspaper_cache')
    .select(SELECT_COLUMNS)
    .eq('cache_date', date)
    .eq('day_range', dayRange)
    .maybeSingle()

  if (error) {
    throw new Error(`Edition read failed (${date}/${dayRange}d): ${error.message}`)
  }
  if (!data) return { kind: 'missing' }
  return mapRow(data as RawCacheRow)
}

export async function readAllEditionRows(
  supabase: SupabaseServerClient,
  date: string
): Promise<Partial<Record<EditionDayRange, EditionReadResult>>> {
  const { data, error } = await supabase
    .from('newspaper_cache')
    .select(SELECT_COLUMNS)
    .eq('cache_date', date)
    .in('day_range', [...EDITION_DAY_RANGES])

  if (error) {
    throw new Error(`Edition read failed (${date}): ${error.message}`)
  }

  const result: Partial<Record<EditionDayRange, EditionReadResult>> = {}
  for (const raw of (data ?? []) as RawCacheRow[]) {
    const dayRange = raw.day_range as EditionDayRange | null
    if (dayRange && (EDITION_DAY_RANGES as readonly number[]).includes(dayRange)) {
      result[dayRange] = mapRow(raw)
    }
  }
  return result
}

/**
 * Persists one edition row. THROWS on failure so the generate route's
 * onFinish surfaces the error instead of pretending success.
 */
export async function writeEditionRow(
  supabase: SupabaseServerClient,
  edition: NewspaperEdition
): Promise<void> {
  const { error } = await supabase
    .from('newspaper_cache')
    .upsert({
      cache_date: edition.meta.editionDate,
      day_range: edition.meta.dayRange,
      data: edition,
      message_count: edition.stats.messageCount,
      unique_users: edition.stats.uniqueUsers,
      updated_at: edition.meta.updatedAt,
      generation_id: edition.meta.generationId,
      generated_at: edition.meta.generatedAt,
      format_version: edition.meta.formatVersion
    }, { onConflict: 'cache_date,day_range' })

  if (error) {
    throw new Error(`Edition cache write failed (${edition.meta.editionDate}/${edition.meta.dayRange}d): ${error.message}`)
  }
}

export async function writeEditionRows(
  supabase: SupabaseServerClient,
  editions: NewspaperEdition[]
): Promise<void> {
  const results = await Promise.allSettled(
    editions.map(edition => writeEditionRow(supabase, edition))
  )
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failures.length > 0) {
    throw new Error(
      `Edition persistence failed for ${failures.length}/${editions.length} rows: ` +
      failures.map(f => (f.reason instanceof Error ? f.reason.message : String(f.reason))).join(' | ')
    )
  }
}

/**
 * Patches parts of a stored edition row in place (widget single-mode).
 * Bumps updated_at but keeps generation_id/generated_at — a widget patch
 * must not make the whole edition look freshly generated.
 */
export async function patchEditionRow(
  supabase: SupabaseServerClient,
  date: string,
  dayRange: EditionDayRange,
  patch: (edition: NewspaperEdition) => NewspaperEdition
): Promise<NewspaperEdition | null> {
  const existing = await readEditionRow(supabase, date, dayRange)
  if (existing.kind !== 'edition') return null

  const updatedAt = new Date().toISOString()
  const patched = patch(existing.row.edition)
  const next: NewspaperEdition = {
    ...patched,
    meta: { ...patched.meta, updatedAt }
  }

  const { error } = await supabase
    .from('newspaper_cache')
    .update({ data: next, updated_at: updatedAt })
    .eq('cache_date', date)
    .eq('day_range', dayRange)

  if (error) {
    throw new Error(`Edition patch failed (${date}/${dayRange}d): ${error.message}`)
  }
  return next
}

// ═══════════════════════════════════════════════════════════════════════
// Generation lock (single-flight across visitors + cron)
// ═══════════════════════════════════════════════════════════════════════

const LOCK_TTL_MS = 15 * 60 * 1000

export function generationLockKey(date: string): string {
  return `edition:${date}`
}

/**
 * Tries to acquire the lock. Atomic enough for this use case:
 * 1. INSERT — wins if no row exists.
 * 2. UPDATE ... WHERE locked_until < now — wins if the old lock expired.
 */
export async function acquireGenerationLock(
  supabase: SupabaseServerClient,
  date: string,
  holder: string
): Promise<boolean> {
  const lockKey = generationLockKey(date)
  const now = new Date()
  const lockedUntil = new Date(now.getTime() + LOCK_TTL_MS).toISOString()

  const insert = await supabase
    .from('newspaper_generation_lock')
    .insert({ lock_key: lockKey, locked_until: lockedUntil, holder, updated_at: now.toISOString() })

  if (!insert.error) return true

  // Row exists — try to steal it if expired.
  const { data, error } = await supabase
    .from('newspaper_generation_lock')
    .update({ locked_until: lockedUntil, holder, updated_at: now.toISOString() })
    .eq('lock_key', lockKey)
    .lt('locked_until', now.toISOString())
    .select('lock_key')

  if (error) {
    console.error('[EDITION-LOCK] Acquire failed:', error.message)
    return false
  }
  return Boolean(data && data.length > 0)
}

export async function releaseGenerationLock(
  supabase: SupabaseServerClient,
  date: string,
  holder: string
): Promise<void> {
  const { error } = await supabase
    .from('newspaper_generation_lock')
    .delete()
    .eq('lock_key', generationLockKey(date))
    .eq('holder', holder)

  if (error) {
    console.error('[EDITION-LOCK] Release failed:', error.message)
  }
}

export async function isGenerationLocked(
  supabase: SupabaseServerClient,
  date: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('newspaper_generation_lock')
    .select('locked_until')
    .eq('lock_key', generationLockKey(date))
    .maybeSingle()

  if (error || !data) return false
  return new Date(data.locked_until).getTime() > Date.now()
}
