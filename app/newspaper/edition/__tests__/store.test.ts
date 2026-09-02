/**
 * Cache write error propagation (the "silent save failure" fix) and
 * widget patching semantics, with a minimal chainable Supabase mock.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  acquireGenerationLock,
  patchEditionRow,
  readEditionRow,
  readLatestCacheDate,
  writeEditionRow,
  writeEditionRows
} from '../store'
import { EDITION_FORMAT_VERSION, type NewspaperEdition } from '../types'
import { ANCHOR_DATE, makeEdition } from './fixtures'

type QueryResult = { data?: unknown; error: { message: string } | null }

/**
 * Chainable query stub: every builder method returns the chain, awaiting
 * it (or calling maybeSingle/select) resolves the configured result.
 */
function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {}
  for (const method of ['insert', 'upsert', 'update', 'delete', 'select', 'eq', 'lt', 'in', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

/** Supabase stub returning per-call results for a table, in order. */
function makeSupabase(resultsByTable: Record<string, QueryResult[]>) {
  const counters: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    const results = resultsByTable[table] ?? [{ error: null }]
    const index = Math.min(counters[table] ?? 0, results.length - 1)
    counters[table] = (counters[table] ?? 0) + 1
    return makeChain(results[index])
  })
  return { client: { from } as never, from }
}

const ok: QueryResult = { error: null }
const boom: QueryResult = { error: { message: 'connection reset' } }

describe('writeEditionRow / writeEditionRows — errors THROW', () => {
  it('resolves when the upsert succeeds', async () => {
    const { client } = makeSupabase({ newspaper_cache: [ok] })
    await expect(writeEditionRow(client, makeEdition())).resolves.toBeUndefined()
  })

  it('throws with date/range context when the upsert fails', async () => {
    const { client } = makeSupabase({ newspaper_cache: [boom] })
    await expect(writeEditionRow(client, makeEdition())).rejects.toThrow(
      `Edition cache write failed (${ANCHOR_DATE}/1d): connection reset`
    )
  })

  it('writeEditionRows surfaces partial failures instead of pretending success', async () => {
    const { client } = makeSupabase({ newspaper_cache: [ok, boom, ok] })
    const editions = [
      makeEdition({ dayRange: 1 }),
      makeEdition({ dayRange: 3 }),
      makeEdition({ dayRange: 7 })
    ]
    await expect(writeEditionRows(client, editions)).rejects.toThrow(
      /Edition persistence failed for 1\/3 rows/
    )
  })
})

describe('readEditionRow — format detection', () => {
  function rawRow(data: unknown, formatVersion: string | null) {
    return {
      data,
      message_count: 900,
      unique_users: 45,
      updated_at: '2026-07-07T10:31:00.000Z',
      day_range: 1,
      generation_id: 'gen-1',
      generated_at: '2026-07-07T10:30:00.000Z',
      format_version: formatVersion
    }
  }

  it('maps a current-format row to kind=edition', async () => {
    const edition = makeEdition()
    const { client } = makeSupabase({
      newspaper_cache: [{ data: rawRow(edition, EDITION_FORMAT_VERSION), error: null }]
    })
    const result = await readEditionRow(client, ANCHOR_DATE, 1)
    expect(result.kind).toBe('edition')
    if (result.kind === 'edition') {
      expect(result.row.generationId).toBe('gen-1')
      expect(result.row.edition.meta.dayRange).toBe(1)
    }
  })

  it('maps an old-format row to kind=legacy (archive adapter path)', async () => {
    const { client } = makeSupabase({
      newspaper_cache: [{ data: rawRow({ featuredArticle: { headline: 'alt' } }, null), error: null }]
    })
    const result = await readEditionRow(client, '2026-06-01', 1)
    expect(result.kind).toBe('legacy')
  })

  it('maps missing rows to kind=missing and throws on read errors', async () => {
    const { client } = makeSupabase({ newspaper_cache: [{ data: null, error: null }] })
    expect((await readEditionRow(client, ANCHOR_DATE, 1)).kind).toBe('missing')

    const { client: broken } = makeSupabase({ newspaper_cache: [{ data: null, error: { message: 'boom' } }] })
    await expect(readEditionRow(broken, ANCHOR_DATE, 1)).rejects.toThrow('Edition read failed')
  })
})

describe('readLatestCacheDate — date=latest resolution', () => {
  it('returns the newest cache_date when a 1D row exists', async () => {
    const { client, from } = makeSupabase({
      newspaper_cache: [{ data: { cache_date: ANCHOR_DATE }, error: null }]
    })
    expect(await readLatestCacheDate(client)).toBe(ANCHOR_DATE)
    expect(from).toHaveBeenCalledWith('newspaper_cache')
  })

  it('returns null on an empty table', async () => {
    const { client } = makeSupabase({ newspaper_cache: [{ data: null, error: null }] })
    expect(await readLatestCacheDate(client)).toBeNull()
  })

  it('throws on read errors instead of silently reporting no editions', async () => {
    const { client } = makeSupabase({ newspaper_cache: [boom] })
    await expect(readLatestCacheDate(client)).rejects.toThrow('Latest edition lookup failed')
  })
})

describe('patchEditionRow — widget single-mode semantics', () => {
  function editionRow(edition: NewspaperEdition): QueryResult {
    return {
      data: {
        data: edition,
        message_count: 900,
        unique_users: 45,
        updated_at: edition.meta.updatedAt,
        day_range: edition.meta.dayRange,
        generation_id: edition.meta.generationId,
        generated_at: edition.meta.generatedAt,
        format_version: edition.meta.formatVersion
      },
      error: null
    }
  }

  it('applies the patch, bumps updatedAt, keeps generationId/generatedAt', async () => {
    const edition = makeEdition()
    const { client } = makeSupabase({ newspaper_cache: [editionRow(edition), ok] })

    const patched = await patchEditionRow(client, ANCHOR_DATE, 1, current => ({
      ...current,
      shared: { ...current.shared, trendingTopics: ['patched-topic'] }
    }))

    expect(patched).not.toBeNull()
    expect(patched?.shared.trendingTopics).toEqual(['patched-topic'])
    expect(patched?.meta.generationId).toBe(edition.meta.generationId)
    expect(patched?.meta.generatedAt).toBe(edition.meta.generatedAt)
    expect(new Date(patched!.meta.updatedAt).getTime()).toBeGreaterThan(
      new Date(edition.meta.updatedAt).getTime()
    )
  })

  it('returns null for legacy/missing rows instead of corrupting them', async () => {
    const { client } = makeSupabase({
      newspaper_cache: [{ data: { data: { old: true }, updated_at: 'x', message_count: 0, unique_users: 0, day_range: 1, generation_id: null, generated_at: null, format_version: null }, error: null }]
    })
    const patched = await patchEditionRow(client, ANCHOR_DATE, 1, edition => edition)
    expect(patched).toBeNull()
  })

  it('throws when the update write fails', async () => {
    const { client } = makeSupabase({ newspaper_cache: [editionRow(makeEdition()), boom] })
    await expect(patchEditionRow(client, ANCHOR_DATE, 1, edition => edition)).rejects.toThrow('Edition patch failed')
  })
})

describe('acquireGenerationLock — single flight', () => {
  it('wins when the insert succeeds', async () => {
    const { client } = makeSupabase({ newspaper_generation_lock: [ok] })
    expect(await acquireGenerationLock(client, ANCHOR_DATE, 'holder-a')).toBe(true)
  })

  it('loses when the row exists and is not expired', async () => {
    const { client } = makeSupabase({
      newspaper_generation_lock: [
        { error: { message: 'duplicate key' } },
        { data: [], error: null } // steal attempt matches no expired row
      ]
    })
    expect(await acquireGenerationLock(client, ANCHOR_DATE, 'holder-b')).toBe(false)
  })

  it('steals an expired lock', async () => {
    const { client } = makeSupabase({
      newspaper_generation_lock: [
        { error: { message: 'duplicate key' } },
        { data: [{ lock_key: 'edition:2026-07-07' }], error: null }
      ]
    })
    expect(await acquireGenerationLock(client, ANCHOR_DATE, 'holder-c')).toBe(true)
  })
})
