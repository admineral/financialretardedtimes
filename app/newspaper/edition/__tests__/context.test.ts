/**
 * Budget-guarded raw chat window: 14 days untouched under budget,
 * deterministic downsampling of the OLDEST days only when over budget.
 */

import { describe, expect, it } from 'vitest'
import {
  buildChatDays,
  formatChatLine,
  formatRawChatSection,
  getEditionDateKeys,
  type EditionChatMessage
} from '../context'
import { EDITION_PROTECTED_RECENT_DAYS, EDITION_WINDOW_DAYS } from '../types'
import { ANCHOR_DATE } from './fixtures'

function messagesForDay(dateKey: string, count: number): EditionChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    username: `user${i % 7}`,
    // Noon UTC == afternoon Berlin, safely inside the same Berlin day.
    time: `${dateKey}T12:${String(i % 60).padStart(2, '0')}:00.000Z`,
    text: `nachricht ${i} am ${dateKey}`,
    is_moderator: false
  }))
}

describe('getEditionDateKeys', () => {
  it('returns 14 Berlin day keys, oldest first, ending at the anchor', () => {
    const keys = getEditionDateKeys(ANCHOR_DATE)
    expect(keys).toHaveLength(EDITION_WINDOW_DAYS)
    expect(keys[0]).toBe('2026-06-24')
    expect(keys[keys.length - 1]).toBe(ANCHOR_DATE)
  })
})

describe('buildChatDays', () => {
  const dateKeys = getEditionDateKeys(ANCHOR_DATE)

  it('keeps every message when the budget is not exceeded (no AI compaction)', () => {
    const messages = dateKeys.flatMap(key => messagesForDay(key, 50))
    const days = buildChatDays(dateKeys, messages)

    expect(days).toHaveLength(EDITION_WINDOW_DAYS)
    expect(days.every(day => !day.sampled)).toBe(true)
    expect(days.reduce((sum, day) => sum + day.messages.length, 0)).toBe(messages.length)
  })

  it('groups messages into the correct Berlin day', () => {
    // 23:30 UTC on 07-06 is 01:30 Berlin on 07-07.
    const crossover: EditionChatMessage = {
      username: 'nightowl',
      time: '2026-07-06T23:30:00.000Z',
      text: 'noch wach',
      is_moderator: false
    }
    const days = buildChatDays(dateKeys, [crossover])
    const today = days.find(day => day.dateKey === ANCHOR_DATE)
    expect(today?.messages).toHaveLength(1)
  })

  it('downsamples only the oldest days when over budget, protecting recent days', () => {
    const perDay = 200
    const messages = dateKeys.flatMap(key => messagesForDay(key, perDay))
    // Force a budget roughly half the total size.
    const total = messages.reduce((sum, m) => sum + m.text.length + 50, 0)
    const days = buildChatDays(dateKeys, messages, Math.floor(total / 2))

    const protectedDays = days.slice(-EDITION_PROTECTED_RECENT_DAYS)
    expect(protectedDays.every(day => !day.sampled && day.messages.length === perDay)).toBe(true)

    const oldest = days[0]
    expect(oldest.sampled).toBe(true)
    expect(oldest.messages.length).toBeLessThan(perDay)
    expect(oldest.totalMessages).toBe(perDay)

    // Deterministic: same inputs → same sampling.
    const again = buildChatDays(dateKeys, dateKeys.flatMap(key => messagesForDay(key, perDay)), Math.floor(total / 2))
    expect(again[0].messages.map(m => m.text)).toEqual(oldest.messages.map(m => m.text))
  })

  it('keeps first and last message of a sampled day (story bookends)', () => {
    const perDay = 300
    const messages = dateKeys.flatMap(key => messagesForDay(key, perDay))
    const days = buildChatDays(dateKeys, messages, 100_000)
    const sampledDay = days.find(day => day.sampled)
    expect(sampledDay).toBeDefined()
    expect(sampledDay!.messages[0].text).toContain('nachricht 0 ')
    expect(sampledDay!.messages[sampledDay!.messages.length - 1].text).toContain(`nachricht ${perDay - 1} `)
  })
})

describe('formatChatLine', () => {
  it('uses a compact Berlin stamp, username, and BTC price like Marktdaten', () => {
    const line = formatChatLine(
      {
        username: 'TofuZz',
        text: 'in dem fall meinte ich den RSI',
        time: '2026-08-19T22:05:09.000Z',
        is_moderator: false
      },
      [{ timestamp: Date.parse('2026-08-19T22:00:00.000Z'), open: 71_000, high: 72_000, low: 70_500, close: 71_724 }]
    )

    expect(line).toBe('[2026-08-20 00:05] @TofuZz (BTC:$71724): in dem fall meinte ich den RSI')
    expect(line).not.toContain('T22:')
    expect(line).not.toContain('mod=')
  })

  it('falls back to BTC:$? when no candles are available', () => {
    expect(formatChatLine({
      username: 'bulldude',
      text: 'long',
      time: '2026-07-07T09:00:00.000Z',
      is_moderator: false
    })).toBe('[2026-07-07 11:00] @bulldude (BTC:$?): long')
  })
})

describe('formatRawChatSection', () => {
  it('emits compact lines inside the day wrapper', () => {
    const days = buildChatDays(
      ['2026-08-20'],
      [{ username: 'werkannderwird', text: 'es reimt iss fett!', time: '2026-08-20T08:54:00.000Z', is_moderator: false }]
    )
    const section = formatRawChatSection(days, [
      { timestamp: Date.parse('2026-08-20T08:00:00.000Z'), open: 71_700, high: 71_800, low: 71_600, close: 71_724 }
    ])

    expect(section).toContain('<day date="2026-08-20"')
    expect(section).toContain('[2026-08-20 10:54] @werkannderwird (BTC:$71724): es reimt iss fett!')
    expect(section).not.toContain('mod=false')
  })
})
