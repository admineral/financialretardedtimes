/**
 * One user's stored chat history as JSON for LLM analysis.
 *
 * Design: a short `readme` explains every field up front; messages are
 * chronological, one object per line, with quoted replies split out of the
 * text (so a model sees who was answered without reading the quote twice)
 * and empty fields omitted to save tokens. Original wording is never
 * truncated or rewritten beyond HTML → text.
 */

import { findLinks, findMentions, splitQuotes } from './extract'
import { partnerRanking } from './ego'
import type { InteractionEvent, PersonProfile } from './types'

export const EXPORT_SCHEMA = 'frt.user-chat.v2'
export const DEFAULT_EXPORT_DAYS = 3650

export interface ExportMessageInput {
  timestamp: string | null
  date: string | null
  text: string
}

export interface ExportInput {
  subject: PersonProfile
  room: string
  from: string
  to: string
  messages: ExportMessageInput[]
  events: InteractionEvent[]
  /** Daily BTC/USDT close by UTC day, or null when unavailable. */
  btcDaily: Record<string, number> | null
  exportedAt?: string
}

const README = [
  'Public TradingView chat history of one user, from the Financial Retarded Times archive.',
  'messages[] is chronological. ts = send time, UTC ISO-8601 (null if unknown). day = calendar day in Europe/Berlin.',
  'text = what the user wrote, with quoted messages removed. replyTo = messages the user quoted and answered: [{user, text}].',
  'mentions = @usernames addressed. links = URLs in the message (TradingView chart/idea links show what was being analysed).',
  'stats and network summarise the same range. network.repliesTo/mentions = whom this user addressed; repliedToBy/mentionedBy = who addressed this user (from other people\'s stored messages).',
  'btcCloseUsd maps UTC day → BTC/USDT daily close for days with messages; use it to relate opinions to price moves. Null if prices were unavailable.',
  'Coverage: only stored messages are included. A day without messages means unknown coverage, not proof of silence.'
].join(' ')

function hourHistogram(messages: ExportMessageInput[]) {
  const hours = new Array<number>(24).fill(0)
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' })
  for (const message of messages) {
    if (!message.timestamp) continue
    hours[Number(fmt.format(new Date(message.timestamp)))]++
  }
  return hours
}

export function exportMessage(message: ExportMessageInput) {
  const { own, quotes } = splitQuotes(message.text)
  const mentions = Array.from(new Set(findMentions(own)))
  const links = findLinks(own)
  return {
    ts: message.timestamp,
    day: message.date,
    text: own,
    ...(quotes.length ? { replyTo: quotes.map(q => ({ user: q.user || null, text: q.text })) } : {}),
    ...(mentions.length ? { mentions } : {}),
    ...(links.length ? { links } : {})
  }
}

/** Streamed as JSON text; each message on its own line. */
export function* llmExport(input: ExportInput): Generator<string> {
  const { subject, messages } = input
  const perYear: Record<string, number> = {}
  const activeDays = new Set<string>()
  for (const message of messages) {
    if (!message.date) continue
    activeDays.add(message.date)
    const year = message.date.slice(0, 4)
    perYear[year] = (perYear[year] ?? 0) + 1
  }
  const stamps = messages.map(m => m.timestamp).filter((t): t is string => Boolean(t))
  const ranking = partnerRanking(subject.username, input.events, input.from, input.to)
  const top = (list: Array<{ user: string; count: number }>) => list.slice(0, 25)

  let btc: Record<string, number> | null = null
  if (input.btcDaily) {
    btc = {}
    for (const message of messages) {
      const day = message.timestamp?.slice(0, 10)
      if (day && input.btcDaily[day] !== undefined) btc[day] = input.btcDaily[day]
    }
  }

  const head = {
    schema: EXPORT_SCHEMA,
    readme: README,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    subject: {
      username: subject.username,
      displayName: subject.displayName,
      room: input.room,
      profileUrl: `https://www.tradingview.com/u/${encodeURIComponent(subject.username)}/`,
      joinedTradingView: subject.joinDate,
      followers: subject.followers
    },
    range: {
      from: input.from,
      to: input.to,
      days: Math.round((Date.parse(input.to) - Date.parse(input.from)) / 86_400_000) + 1,
      timezone: 'Europe/Berlin'
    },
    stats: {
      messages: messages.length,
      activeDays: activeDays.size,
      firstMessageAt: stamps[0] ?? null,
      lastMessageAt: stamps.at(-1) ?? null,
      avgMessagesPerActiveDay: activeDays.size ? Math.round((messages.length / activeDays.size) * 10) / 10 : 0,
      messagesPerYear: perYear,
      messagesByHourBerlin: hourHistogram(messages)
    },
    network: {
      repliesTo: top(ranking.quotes),
      mentions: top(ranking.mentions),
      repliedToBy: top(ranking.quotedBy),
      mentionedBy: top(ranking.mentionedBy)
    },
    btcCloseUsd: btc
  }

  const json = JSON.stringify(head, null, 2)
  yield `${json.slice(0, -2)},\n  "messages": [\n`
  for (let i = 0; i < messages.length; i++) {
    yield `${i ? ',\n' : ''}    ${JSON.stringify(exportMessage(messages[i]))}`
  }
  yield '\n  ]\n}\n'
}

/** Filename safe on every OS: ASCII letters, digits, dot, dash, underscore. */
export function exportFilename(username: string, from: string, to: string) {
  const safe = username.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) || 'user'
  return `frt-${safe}-${from}_${to}.json`
}
