/**
 * freshness.ts (Newspaper edition v3)
 *
 * The noon-freshness rule that replaces the old flat 24h TTL:
 *
 * An edition for TODAY (Berlin) is fresh iff it was generated today AND
 * (it is still before 12:00 Berlin OR it was generated at/after 12:00
 * Berlin). Editions for past dates are immutable archive material and
 * always count as fresh. Anything generated on a previous Berlin day is
 * stale — this keeps the "new day => new paper" behaviour.
 *
 * Pure functions, no I/O — unit tested in __tests__/freshness.test.ts.
 */

import { getNewspaperDateKey, NEWSPAPER_TIME_ZONE } from '../lib/timezone'

/** Berlin wall-clock hour (0-23) for an instant. */
export function getBerlinHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: NEWSPAPER_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(date)
  )
}

export interface EditionFreshness {
  isFresh: boolean
  reason: 'archive-date' | 'previous-day' | 'before-noon' | 'generated-after-noon' | 'stale-after-noon' | 'future-date'
}

/**
 * @param editionDate  The Berlin date key the edition is for (cache_date).
 * @param generatedAt  ISO timestamp of the generation run.
 * @param now          Injected for tests.
 */
export function getEditionFreshness(
  editionDate: string,
  generatedAt: string,
  now: Date = new Date()
): EditionFreshness {
  const todayKey = getNewspaperDateKey(now)

  if (editionDate < todayKey) {
    // Archive editions never regenerate on their own.
    return { isFresh: true, reason: 'archive-date' }
  }
  if (editionDate > todayKey) {
    return { isFresh: false, reason: 'future-date' }
  }

  const generated = new Date(generatedAt)
  if (Number.isNaN(generated.getTime())) {
    return { isFresh: false, reason: 'previous-day' }
  }

  if (getNewspaperDateKey(generated) !== todayKey) {
    return { isFresh: false, reason: 'previous-day' }
  }

  if (getBerlinHour(now) < 12) {
    return { isFresh: true, reason: 'before-noon' }
  }

  return getBerlinHour(generated) >= 12
    ? { isFresh: true, reason: 'generated-after-noon' }
    : { isFresh: false, reason: 'stale-after-noon' }
}

export function isEditionFresh(editionDate: string, generatedAt: string, now: Date = new Date()): boolean {
  return getEditionFreshness(editionDate, generatedAt, now).isFresh
}

/**
 * Client acceptance rule after a stream finishes: only replace the
 * currently shown edition with a fetched row if that row comes from a
 * NEWER generation. Kills the old "reload overwrote fresh stream with a
 * stale DB row" race.
 */
export function shouldAcceptIncomingEdition(
  current: { generationId: string | null; updatedAt: string | null } | null,
  incoming: { generationId: string; updatedAt: string }
): boolean {
  if (!current) return true
  if (current.generationId && incoming.generationId !== current.generationId) {
    // Different generation: accept only when it is not older.
    if (!current.updatedAt) return true
    return new Date(incoming.updatedAt).getTime() >= new Date(current.updatedAt).getTime()
  }
  if (!current.updatedAt) return true
  // Same generation: accept widget patches (newer updatedAt) and identical reloads.
  return new Date(incoming.updatedAt).getTime() >= new Date(current.updatedAt).getTime()
}
