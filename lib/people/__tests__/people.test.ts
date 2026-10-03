import { describe, expect, it } from 'vitest'
import { buildEgoNetwork, partnerRanking } from '../ego'
import { berlinDateKey, interactionsOf, splitQuotes, toEpochMs } from '../extract'
import { exportFilename, exportMessage, llmExport } from '../llm-export'
import { detectCommunities, monthRange } from '../communities'
import type { InteractionEvent, PersonProfile } from '../types'

const known = new Map(['Alice', 'bob', 'Carol', 'Dave'].map(n => [n.toLowerCase(), n]))
const resolve = (name: string) => known.get(name.toLowerCase()) ?? null
const person = (username: string): PersonProfile => ({
  username, messages: 1, activeDays: 1, firstDate: null, lastDate: null, avatar: null,
  joinDate: null, followers: null, displayName: null
})

describe('extract', () => {
  it('splits top-level quotes and keeps nested ones inside', () => {
    const { own, quotes } = splitQuotes('[quote="bob"][quote="carol"]x[/quote] y[/quote] my answer')
    expect(own).toBe('my answer')
    expect(quotes).toEqual([{ user: 'bob', text: '[quote="carol"]x[/quote] y' }])
  })

  it('keeps an unclosed quote as own text', () => {
    expect(splitQuotes('hi [quote="bob"]oops').own).toBe('hi [quote="bob"]oops')
  })

  it('counts each target once and ignores unknown names, e-mails and self', () => {
    const hits = interactionsOf('Alice', '[quote="BOB"]a[/quote] @bob @Carol mail me@carol.de @ghost @alice', resolve)
    expect(hits).toEqual([
      { to: 'bob', kind: 'quote' },
      { to: 'bob', kind: 'mention' },
      { to: 'Carol', kind: 'mention' }
    ])
  })

  it('ignores mentions that only appear inside quotes', () => {
    expect(interactionsOf('Alice', '[quote="bob"]@Carol hi[/quote] ok', resolve)).toEqual([{ to: 'bob', kind: 'quote' }])
  })

  it('normalises times and Berlin days', () => {
    expect(toEpochMs('1521143845.770099')).toBe(1521143845770)
    expect(berlinDateKey(Date.parse('2025-06-10T22:30:00Z'))).toBe('2025-06-11')
    expect(berlinDateKey(Date.parse('2025-01-10T22:30:00Z'))).toBe('2025-01-10')
  })
})

const events: InteractionEvent[] = [
  { from: 'Alice', to: 'bob', kind: 'quote', date: '2024-01-01' },
  { from: 'bob', to: 'Alice', kind: 'mention', date: '2025-01-01' },
  { from: 'Carol', to: 'Alice', kind: 'quote', date: '2025-02-01' },
  { from: 'bob', to: 'Carol', kind: 'quote', date: '2025-03-01' },
  { from: 'bob', to: 'Dave', kind: 'quote', date: '2025-03-01' },
  { from: 'Carol', to: 'Dave', kind: 'mention', date: '2025-03-01' },
  { from: 'Eve', to: 'Dave', kind: 'mention', date: '2025-03-01' }
]

describe('ego network', () => {
  it('builds both directions, the shared circle and links among visible people', () => {
    const graph = buildEgoNetwork('Alice', events, person, { limit: 10, secondRing: 5 })
    const byName = new Map(graph.nodes.map(n => [n.username, n]))
    expect(byName.get('bob')).toMatchObject({ hop: 1, weight: 2, toCenter: { quotes: 0, mentions: 1 }, fromCenter: { quotes: 1, mentions: 0 } })
    expect(byName.get('Dave')?.hop).toBe(2)
    expect(byName.has('Eve')).toBe(false)
    expect(graph.links.map(l => `${l.a}-${l.b}`).sort()).toEqual(['Alice-Carol', 'Alice-bob', 'Carol-Dave', 'Carol-bob', 'Dave-bob'])
  })

  it('filters by period and kind, and reports hidden contacts', () => {
    const graph = buildEgoNetwork('Alice', events, person, { from: '2025-01-01', to: '2025-12-31', kind: 'quote', limit: 1, secondRing: 0 })
    expect(graph.nodes.map(n => n.username)).toEqual(['Alice', 'Carol'])
    expect(graph.totalContacts).toBe(1)
    expect(buildEgoNetwork('Alice', events, person, { limit: 1, secondRing: 0 }).hiddenContacts).toBe(1)
  })

  it('ranks partners per direction', () => {
    const ranking = partnerRanking('Alice', events)
    expect(ranking.quotes).toEqual([{ user: 'bob', count: 1 }])
    expect(ranking.quotedBy).toEqual([{ user: 'Carol', count: 1 }])
    expect(ranking.mentionedBy).toEqual([{ user: 'bob', count: 1 }])
  })
})

describe('llm export', () => {
  it('produces valid JSON with readme, stats and compact messages', () => {
    const text = Array.from(
      llmExport({
        subject: person('Alice'),
        room: 'bitcoin_de_DE',
        from: '2016-10-06',
        to: '2026-10-03',
        messages: [
          { timestamp: '2025-01-01T10:00:00.000Z', date: '2025-01-01', text: '[quote="bob"]up?[/quote] yes @Carol https://x.y/z.' },
          { timestamp: '2025-01-02T10:00:00.000Z', date: '2025-01-02', text: 'plain "quoted" \\ text\nline2' }
        ],
        events,
        btcDaily: { '2025-01-01': 94000.5, '2024-01-01': 1 },
        exportedAt: '2026-10-03T00:00:00.000Z'
      })
    ).join('')
    const data = JSON.parse(text)
    expect(data.schema).toBe('frt.user-chat.v2')
    expect(data.range.days).toBe(3650)
    expect(data.stats).toMatchObject({ messages: 2, activeDays: 2, messagesPerYear: { 2025: 2 } })
    expect(data.btcCloseUsd).toEqual({ '2025-01-01': 94000.5 })
    expect(data.messages[0]).toEqual({
      ts: '2025-01-01T10:00:00.000Z',
      day: '2025-01-01',
      text: 'yes @Carol https://x.y/z.',
      replyTo: [{ user: 'bob', text: 'up?' }],
      mentions: ['Carol'],
      links: ['https://x.y/z']
    })
    expect(data.messages[1].text).toBe('plain "quoted" \\ text\nline2')
  })

  it('omits empty optional fields', () => {
    expect(Object.keys(exportMessage({ timestamp: null, date: null, text: 'hi' }))).toEqual(['ts', 'day', 'text'])
  })

  it('sanitises filenames', () => {
    expect(exportFilename('../evil"name\r\n', '2025-01-01', '2025-12-31')).toBe('frt-..evilname-2025-01-01_2025-12-31.json')
  })
})

describe('communities', () => {
  it('separates two cliques and ignores the centre', () => {
    const clique = (names: string[]) =>
      names.flatMap((a, i) => names.slice(i + 1).map(b => ({ a, b, weight: 5 })))
    const left = ['a1', 'a2', 'a3', 'a4']
    const right = ['b1', 'b2', 'b3']
    const links = [
      ...clique(left),
      ...clique(right),
      { a: 'a1', b: 'b1', weight: 1 },
      ...[...left, ...right].map(n => ({ a: 'C', b: n, weight: 9 }))
    ]
    const groups = detectCommunities(['C', ...left, ...right, 'lonely'], links, 'C')
    expect(groups.has('C')).toBe(false)
    expect(new Set(left.map(n => groups.get(n)))).toEqual(new Set([0]))
    expect(new Set(right.map(n => groups.get(n)))).toEqual(new Set([1]))
    expect(groups.get('lonely')).toBe(-1)
  })

  it('lists months across a year boundary', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})
