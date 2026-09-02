import { enrichMessage } from './parse'
import type { ListedMessage, MessageSource, RecoveredMessage } from './types'

export interface HistoryDay {
  date: string
  messages: Array<Partial<RecoveredMessage> & { id: string; text: string; time: string }>
}

export interface LiveRow {
  id: string
  text: string
  time: string
  username?: string | null
}

export function timeMs(time: string): number {
  const n = Number(time)
  if (Number.isFinite(n) && n > 1e9) return n > 1e12 ? n : n * 1000
  const parsed = new Date(time).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

export function dateFromTime(time: string): string {
  const ms = timeMs(time)
  if (!ms) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

function fingerprint(date: string, time: string, text: string) {
  return `${date}|${time}|${text}`
}

function toListed(
  username: string,
  source: MessageSource,
  date: string,
  raw: Partial<RecoveredMessage> & { id: string; text: string; time: string }
): ListedMessage {
  const enriched = enrichMessage({ ...raw, author: username })
  return {
    ...enriched,
    permalink: raw.permalink || enriched.permalink,
    username,
    date: date || dateFromTime(raw.time),
    source
  }
}

export function mergeListedMessages(input: {
  username: string
  historyDays: HistoryDay[]
  live: LiveRow[]
}): ListedMessage[] {
  const byId = new Map<string, ListedMessage>()
  const seen = new Set<string>()

  function add(message: ListedMessage) {
    if (!message.id || !message.text) return
    if (byId.has(message.id)) return
    const key = fingerprint(message.date, message.time, message.text)
    if (seen.has(key)) return
    seen.add(key)
    byId.set(message.id, message)
  }

  for (const day of input.historyDays) {
    for (const message of day.messages || []) {
      add(toListed(input.username, 'history', day.date, message))
    }
  }

  for (const row of input.live) {
    add(
      toListed(row.username || input.username, 'live', dateFromTime(row.time), {
        id: row.id,
        text: row.text || '',
        time: String(row.time || '')
      })
    )
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return timeMs(b.time) - timeMs(a.time)
  })
}

export function listedToDays(messages: ListedMessage[]) {
  const byDate = new Map<string, ListedMessage[]>()
  const chronological = [...messages].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return timeMs(a.time) - timeMs(b.time)
  })
  for (const message of chronological) {
    const bucket = byDate.get(message.date) || []
    bucket.push(message)
    byDate.set(message.date, bucket)
  }
  return Array.from(byDate.entries()).map(([date, dayMessages]) => ({
    date,
    messages: dayMessages
  }))
}

export function listedToMarkdown(username: string, messages: ListedMessage[]): string {
  const lines = [`# Chat export — ${username}`, '', `${messages.length} Nachrichten`, '']
  for (const day of listedToDays(messages)) {
    lines.push(`## ${day.date}`, '')
    for (const msg of day.messages) {
      for (const quote of msg.quotes) {
        lines.push(`> **${quote.username}:** ${quote.content}`, '')
      }
      lines.push(msg.text, '')
      const links = [...msg.chartUrls, ...msg.ideaUrls, ...msg.externalUrls]
      for (const url of links) lines.push(`- ${url}`)
      if (links.length) lines.push('')
    }
  }
  return lines.join('\n')
}

export function listedToJson(input: {
  username: string
  room: string
  messages: ListedMessage[]
}) {
  return {
    username: input.username,
    room: input.room,
    exportedAt: new Date().toISOString(),
    totalMessages: input.messages.length,
    oldest: input.messages.at(-1)?.date ?? null,
    newest: input.messages[0]?.date ?? null,
    messages: input.messages
  }
}
