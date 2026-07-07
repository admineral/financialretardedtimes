/**
 * Noon-freshness rule + client "only accept newer generation" rule.
 * July dates → Berlin is UTC+2, so 12:00 Berlin == 10:00 UTC.
 */

import { describe, expect, it } from 'vitest'
import { getBerlinHour, getEditionFreshness, isEditionFresh, shouldAcceptIncomingEdition } from '../freshness'

const TODAY = '2026-07-07'

const utc = (iso: string) => new Date(iso)

describe('getBerlinHour', () => {
  it('converts UTC instants to Berlin wall-clock hours (CEST)', () => {
    expect(getBerlinHour(utc('2026-07-07T10:00:00.000Z'))).toBe(12)
    expect(getBerlinHour(utc('2026-07-07T22:30:00.000Z'))).toBe(0) // already next Berlin day
  })
})

describe('getEditionFreshness — noon rule', () => {
  it('past edition dates are immutable archive material (always fresh)', () => {
    const result = getEditionFreshness('2026-07-01', '2026-07-01T05:00:00.000Z', utc(`${TODAY}T15:00:00.000Z`))
    expect(result).toEqual({ isFresh: true, reason: 'archive-date' })
  })

  it('future edition dates are never fresh', () => {
    const result = getEditionFreshness('2026-07-08', `${TODAY}T05:00:00.000Z`, utc(`${TODAY}T15:00:00.000Z`))
    expect(result).toEqual({ isFresh: false, reason: 'future-date' })
  })

  it('keeps the new-day logic: yesterday-generated paper is stale today', () => {
    const result = getEditionFreshness(TODAY, '2026-07-06T20:00:00.000Z', utc(`${TODAY}T06:00:00.000Z`))
    expect(result).toEqual({ isFresh: false, reason: 'previous-day' })
  })

  it('before noon Berlin, any same-day generation is fresh', () => {
    // Generated 07:00 Berlin, visited 10:00 Berlin.
    const result = getEditionFreshness(TODAY, `${TODAY}T05:00:00.000Z`, utc(`${TODAY}T08:00:00.000Z`))
    expect(result).toEqual({ isFresh: true, reason: 'before-noon' })
  })

  it('after noon Berlin, a before-noon generation is stale (the 14h bug case)', () => {
    // Generated 07:00 Berlin, visited 15:00 Berlin.
    const result = getEditionFreshness(TODAY, `${TODAY}T05:00:00.000Z`, utc(`${TODAY}T13:00:00.000Z`))
    expect(result).toEqual({ isFresh: false, reason: 'stale-after-noon' })
  })

  it('after noon Berlin, an after-noon generation is fresh', () => {
    // Generated 12:30 Berlin, visited 15:00 Berlin.
    const result = getEditionFreshness(TODAY, `${TODAY}T10:30:00.000Z`, utc(`${TODAY}T13:00:00.000Z`))
    expect(result).toEqual({ isFresh: true, reason: 'generated-after-noon' })
  })

  it('exactly 12:00 Berlin counts as after noon on both sides', () => {
    // Generated exactly 12:00 Berlin, visited exactly 12:00 Berlin.
    const result = getEditionFreshness(TODAY, `${TODAY}T10:00:00.000Z`, utc(`${TODAY}T10:00:00.000Z`))
    expect(result).toEqual({ isFresh: true, reason: 'generated-after-noon' })
  })

  it('treats an unparseable generatedAt as stale', () => {
    expect(isEditionFresh(TODAY, 'not-a-date', utc(`${TODAY}T08:00:00.000Z`))).toBe(false)
  })

  it('handles Berlin day boundaries: 23:30 UTC belongs to the next Berlin day', () => {
    // 2026-07-06T23:30Z is already 2026-07-07 01:30 Berlin → same day, before noon.
    const result = getEditionFreshness(TODAY, '2026-07-06T23:30:00.000Z', utc(`${TODAY}T06:00:00.000Z`))
    expect(result).toEqual({ isFresh: true, reason: 'before-noon' })
  })
})

describe('shouldAcceptIncomingEdition — kill the reload race', () => {
  const incoming = { generationId: 'gen-new', updatedAt: '2026-07-07T12:00:00.000Z' }

  it('accepts anything when nothing is shown yet', () => {
    expect(shouldAcceptIncomingEdition(null, incoming)).toBe(true)
  })

  it('rejects a fetched row that is OLDER than the streamed generation', () => {
    const current = { generationId: 'gen-streamed', updatedAt: '2026-07-07T12:05:00.000Z' }
    expect(shouldAcceptIncomingEdition(current, incoming)).toBe(false)
  })

  it('accepts a different generation that is not older', () => {
    const current = { generationId: 'gen-old', updatedAt: '2026-07-07T11:00:00.000Z' }
    expect(shouldAcceptIncomingEdition(current, incoming)).toBe(true)
  })

  it('accepts widget patches within the same generation (newer updatedAt)', () => {
    const current = { generationId: 'gen-new', updatedAt: '2026-07-07T11:59:00.000Z' }
    expect(shouldAcceptIncomingEdition(current, incoming)).toBe(true)
  })

  it('rejects same-generation rows with an older updatedAt', () => {
    const current = { generationId: 'gen-new', updatedAt: '2026-07-07T12:01:00.000Z' }
    expect(shouldAcceptIncomingEdition(current, incoming)).toBe(false)
  })

  it('accepts when the current state has no timestamps to compare', () => {
    expect(shouldAcceptIncomingEdition({ generationId: null, updatedAt: null }, incoming)).toBe(true)
  })
})
