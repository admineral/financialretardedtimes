/**
 * Ego network from interaction events. Pure: the route feeds it the cached
 * room index, tests feed it literals.
 *
 * Ring 1: everyone the centre quoted/mentioned or was quoted/mentioned by.
 * Ring 2: people linked to at least two ring-1 contacts (the shared circle),
 * strongest first. Links between visible people are always included, so
 * the drawing shows clusters instead of a star.
 */

import type {
  Counts,
  InteractionEvent,
  NetworkLink,
  NetworkNode,
  PersonProfile
} from './types'

export interface EgoOptions {
  from?: string | null
  to?: string | null
  kind?: 'all' | 'quote' | 'mention'
  /** Max ring-1 contacts. */
  limit: number
  /** Max ring-2 people. 0 disables the second ring. */
  secondRing: number
}

const zero = (): Counts => ({ quotes: 0, mentions: 0 })
const total = (c: Counts) => c.quotes + c.mentions

function bump(c: Counts, kind: InteractionEvent['kind']) {
  if (kind === 'quote') c.quotes++
  else c.mentions++
}

interface PairAgg {
  a: string
  b: string
  ab: Counts
  ba: Counts
  first: string
  last: string
  months: Record<string, number>
}

function pairKey(x: string, y: string) {
  return x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`
}

export function buildEgoNetwork(
  center: string,
  events: InteractionEvent[],
  people: (username: string) => PersonProfile,
  options: EgoOptions
): { nodes: NetworkNode[]; links: NetworkLink[]; hiddenContacts: number; totalContacts: number } {
  const { from, to, kind = 'all' } = options

  // 1) Aggregate pairs once for the selected window.
  const pairs = new Map<string, PairAgg>()
  const neighbours = new Map<string, Set<string>>()
  for (const event of events) {
    if (from && event.date < from) continue
    if (to && event.date > to) continue
    if (kind !== 'all' && event.kind !== kind) continue
    if (event.from === event.to) continue
    const key = pairKey(event.from, event.to)
    let pair = pairs.get(key)
    if (!pair) {
      const [a, b] = event.from < event.to ? [event.from, event.to] : [event.to, event.from]
      pair = { a, b, ab: zero(), ba: zero(), first: event.date, last: event.date, months: {} }
      pairs.set(key, pair)
      for (const [x, y] of [[a, b], [b, a]]) {
        const set = neighbours.get(x) ?? new Set<string>()
        set.add(y)
        neighbours.set(x, set)
      }
    }
    bump(event.from === pair.a ? pair.ab : pair.ba, event.kind)
    const month = event.date.slice(0, 7)
    pair.months[month] = (pair.months[month] ?? 0) + 1
    if (event.date < pair.first) pair.first = event.date
    if (event.date > pair.last) pair.last = event.date
  }

  const pairOf = (x: string, y: string) => pairs.get(pairKey(x, y))

  // 2) Ring 1, ranked by interaction volume with the centre.
  const contacts = Array.from(neighbours.get(center) ?? [])
    .map(name => {
      const pair = pairOf(center, name)!
      const toCenter = pair.a === name ? pair.ab : pair.ba
      const fromCenter = pair.a === center ? pair.ab : pair.ba
      return { name, pair, toCenter, fromCenter, weight: total(toCenter) + total(fromCenter) }
    })
    .sort((x, y) => y.weight - x.weight || x.name.localeCompare(y.name))

  const ring1 = contacts.slice(0, options.limit)
  const ring1Set = new Set(ring1.map(c => c.name))

  // 3) Ring 2: people tied to ≥2 ring-1 contacts, by summed weight.
  const candidates = new Map<string, { ties: number; weight: number; first: string; last: string }>()
  if (options.secondRing > 0) {
    for (const contact of ring1) {
      for (const other of neighbours.get(contact.name) ?? []) {
        if (other === center || ring1Set.has(other)) continue
        const pair = pairOf(contact.name, other)!
        const entry = candidates.get(other) ?? { ties: 0, weight: 0, first: pair.first, last: pair.last }
        entry.ties++
        entry.weight += total(pair.ab) + total(pair.ba)
        if (pair.first < entry.first) entry.first = pair.first
        if (pair.last > entry.last) entry.last = pair.last
        candidates.set(other, entry)
      }
    }
  }
  const ring2 = Array.from(candidates.entries())
    .filter(([, entry]) => entry.ties >= 2)
    .sort((x, y) => y[1].ties - x[1].ties || y[1].weight - x[1].weight || x[0].localeCompare(y[0]))
    .slice(0, options.secondRing)

  const nodes: NetworkNode[] = [
    {
      ...people(center),
      hop: 0,
      toCenter: zero(),
      fromCenter: zero(),
      weight: contacts.reduce((sum, c) => sum + c.weight, 0),
      firstContact: null,
      lastContact: null
    },
    ...ring1.map(c => ({
      ...people(c.name),
      hop: 1 as const,
      toCenter: { ...c.toCenter },
      fromCenter: { ...c.fromCenter },
      weight: c.weight,
      firstContact: c.pair.first,
      lastContact: c.pair.last
    })),
    ...ring2.map(([name, entry]) => ({
      ...people(name),
      hop: 2 as const,
      toCenter: zero(),
      fromCenter: zero(),
      weight: entry.weight,
      firstContact: entry.first,
      lastContact: entry.last
    }))
  ]

  // 4) Every pair among visible people.
  const visible = nodes.map(n => n.username)
  const links: NetworkLink[] = []
  for (let i = 0; i < visible.length; i++) {
    const near = neighbours.get(visible[i])
    if (!near) continue
    for (let j = i + 1; j < visible.length; j++) {
      if (!near.has(visible[j])) continue
      const pair = pairOf(visible[i], visible[j])!
      links.push({
        a: pair.a,
        b: pair.b,
        ab: { ...pair.ab },
        ba: { ...pair.ba },
        weight: total(pair.ab) + total(pair.ba),
        first: pair.first,
        last: pair.last,
        months: { ...pair.months }
      })
    }
  }

  return {
    nodes,
    links,
    hiddenContacts: Math.max(contacts.length - ring1.length, 0),
    totalContacts: contacts.length
  }
}

/** Top partners per direction, for summaries (export, side list). */
export function partnerRanking(center: string, events: InteractionEvent[], from?: string | null, to?: string | null) {
  const out = new Map<string, Counts>()
  const inbound = new Map<string, Counts>()
  for (const event of events) {
    if (from && event.date < from) continue
    if (to && event.date > to) continue
    if (event.from === center && event.to !== center) {
      const c = out.get(event.to) ?? zero()
      bump(c, event.kind)
      out.set(event.to, c)
    } else if (event.to === center && event.from !== center) {
      const c = inbound.get(event.from) ?? zero()
      bump(c, event.kind)
      inbound.set(event.from, c)
    }
  }
  const rank = (map: Map<string, Counts>, pick: keyof Counts) =>
    Array.from(map.entries())
      .filter(([, c]) => c[pick] > 0)
      .map(([user, c]) => ({ user, count: c[pick] }))
      .sort((a, b) => b.count - a.count || a.user.localeCompare(b.user))
  return {
    quotes: rank(out, 'quotes'),
    mentions: rank(out, 'mentions'),
    quotedBy: rank(inbound, 'quotes'),
    mentionedBy: rank(inbound, 'mentions')
  }
}
