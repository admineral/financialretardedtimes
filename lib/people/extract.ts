/**
 * Who a stored message talks to. Pure helpers shared by the room index,
 * the LLM export and tests.
 *
 * - Quotes: only top-level `[quote="X"]` blocks count as a reply to X;
 *   quotes nested inside a quote belong to someone else's message.
 * - Mentions: `@name` outside quote blocks, and only when `resolve` knows
 *   the name, so e-mail addresses and typos do not invent people.
 */

import { NEWSPAPER_TIME_ZONE } from '@/app/newspaper/lib/timezone'
import type { InteractionKind } from './types'

const TOKEN_RE = /\[quote(?:="([^"\]]*)")?\]|\[\/quote\]/gi
const MENTION_RE = /(^|[^A-Za-z0-9_.@-])@([A-Za-z0-9_][A-Za-z0-9_.-]{0,39})/g
const URL_RE = /https?:\/\/[^\s<>"'\])]+/gi

export interface QuoteBlock {
  user: string
  text: string
}

export interface SplitMessage {
  /** Text with top-level quote blocks removed. */
  own: string
  quotes: QuoteBlock[]
}

/** Separate the author's own words from top-level quote blocks. */
export function splitQuotes(text: string): SplitMessage {
  if (!/\[quote/i.test(text)) return { own: text, quotes: [] }
  const quotes: QuoteBlock[] = []
  let own = ''
  let depth = 0
  let cursor = 0
  let blockStart = 0
  let tokenStart = 0
  let blockUser = ''
  const re = new RegExp(TOKEN_RE)
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const closing = match[0].startsWith('[/')
    if (!closing) {
      if (depth === 0) {
        own += text.slice(cursor, match.index)
        tokenStart = match.index
        blockStart = match.index + match[0].length
        blockUser = (match[1] ?? '').trim()
      }
      depth++
    } else if (depth > 0) {
      depth--
      if (depth === 0) {
        quotes.push({ user: blockUser, text: text.slice(blockStart, match.index).trim() })
        cursor = match.index + match[0].length
      }
    }
  }
  if (depth > 0) {
    // Unclosed block: keep the remainder as the author's text, unchanged.
    own += text.slice(tokenStart)
  } else {
    own += text.slice(cursor)
  }
  return { own: own.replace(/\n{3,}/g, '\n\n').trim(), quotes }
}

export function findMentions(text: string): string[] {
  const names: string[] = []
  const re = new RegExp(MENTION_RE)
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    names.push(match[2].replace(/[.-]+$/, ''))
  }
  return names
}

export function findLinks(text: string): string[] {
  return Array.from(new Set((text.match(URL_RE) ?? []).map(url => url.replace(/[.,;:!?]+$/, ''))))
}

/**
 * Interactions of one message. Each target counts once per kind per message.
 * `resolve` maps a raw name to the canonical username, or null if unknown.
 */
export function interactionsOf(
  author: string,
  text: string,
  resolve: (name: string) => string | null
): Array<{ to: string; kind: InteractionKind }> {
  const { own, quotes } = splitQuotes(text)
  const seen = new Set<string>()
  const out: Array<{ to: string; kind: InteractionKind }> = []
  const authorKey = author.toLowerCase()
  for (const quote of quotes) {
    if (!quote.user) continue
    const to = resolve(quote.user) ?? quote.user
    const key = `q:${to.toLowerCase()}`
    if (to.toLowerCase() === authorKey || seen.has(key)) continue
    seen.add(key)
    out.push({ to, kind: 'quote' })
  }
  for (const name of findMentions(own)) {
    const to = resolve(name)
    if (!to) continue
    const key = `m:${to.toLowerCase()}`
    if (to.toLowerCase() === authorKey || seen.has(key)) continue
    seen.add(key)
    out.push({ to, kind: 'mention' })
  }
  return out
}

const berlinDay = new Intl.DateTimeFormat('sv-SE', {
  timeZone: NEWSPAPER_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})
const dayByHour = new Map<number, string>()

/** Europe/Berlin day key. Offsets change on whole hours, so memoise per hour. */
export function berlinDateKey(ms: number): string {
  const hour = Math.floor(ms / 3_600_000)
  let key = dayByHour.get(hour)
  if (!key) {
    key = berlinDay.format(new Date(hour * 3_600_000))
    if (dayByHour.size > 200_000) dayByHour.clear()
    dayByHour.set(hour, key)
  }
  return key
}

/** Unix seconds/ms or ISO → epoch ms, or null. */
export function toEpochMs(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric > 1e9) return numeric < 1e12 ? Math.round(numeric * 1000) : numeric
  const parsed = Date.parse(String(raw))
  return Number.isNaN(parsed) ? null : parsed
}
