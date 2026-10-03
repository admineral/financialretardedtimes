import 'server-only'

/**
 * Room index for /newspaper/people: one read-only pass over both stored
 * sources (profile day arrays + room archive) that yields
 *
 * - per-person totals and per-day counts (deduplicated like lib/archive:
 *   same author, same second, same text = one message),
 * - every quote/@mention as a dated interaction event,
 * - cached TradingView profile rows (avatar, join date, followers).
 *
 * Message bodies are not kept; only the ~25% that contain `@` or `[quote`
 * are transferred at all. The result lives in process memory for ten
 * minutes and is rebuilt in the background when stale, so a lookup never
 * waits on a rebuild once the index exists.
 */

import { archiveDatabase } from '@/lib/archive/database'
import { readArchive } from '@/lib/archive/repository'
import { berlinDateKey, interactionsOf, toEpochMs } from './extract'
import type {
  DirectoryEntry,
  InteractionEvent,
  PersonProfile,
  PersonStats,
  YearSummary
} from './types'

const TTL_MS = 10 * 60_000

interface Person extends PersonStats {
  days: Map<string, number>
}

interface ProfileRow {
  avatar: string | null
  joinDate: string | null
  followers: number | null
  displayName: string | null
}

export interface RoomIndex {
  room: string
  people: Map<string, Person>
  /** lower-case → canonical username */
  names: Map<string, string>
  /** canonical → every spelling stored (TradingView names are case-insensitive) */
  variants: Map<string, string[]>
  profiles: Map<string, ProfileRow>
  events: InteractionEvent[]
  readAt: string
}

interface Slot {
  value?: RoomIndex
  builtAt: number
  pending?: Promise<RoomIndex>
}

const slots = new Map<string, Slot>()

async function buildIndex(room: string): Promise<RoomIndex> {
  return archiveDatabase().begin('isolation level repeatable read read only', async sql => {
    // Keyed by lower-case name; the most frequent spelling becomes canonical.
    const people = new Map<string, Person>()
    const spellings = new Map<string, Map<string, number>>()
    const seen = new Set<string>()
    const pendingTexts: Array<{ author: string; date: string; text: string }> = []
    const avatars = new Map<string, string>()

    const add = (username: string, rawTime: unknown, fallbackDay: string | null, hash: string, text: string | null) => {
      if (!username) return
      const ms = toEpochMs(rawTime)
      const key = `${username}\u0000${ms === null ? `d${fallbackDay}` : Math.floor(ms / 1000)}\u0000${hash}`
      if (seen.has(key)) return
      seen.add(key)
      const date = ms === null ? fallbackDay : berlinDateKey(ms)
      if (!date) return
      const lower = username.toLowerCase()
      let person = people.get(lower)
      if (!person) {
        person = { username, messages: 0, activeDays: 0, firstDate: null, lastDate: null, avatar: null, days: new Map() }
        people.set(lower, person)
        spellings.set(lower, new Map())
      }
      const counts = spellings.get(lower)!
      counts.set(username, (counts.get(username) ?? 0) + 1)
      person.messages++
      person.days.set(date, (person.days.get(date) ?? 0) + 1)
      if (text) pendingTexts.push({ author: username, date, text })
    }

    for await (const rows of sql`
      SELECT a.username, a.date::text AS day, m->>'time' AS time, left(md5(m->>'text'), 16) AS hash,
        CASE WHEN m->>'text' LIKE '%@%' OR m->>'text' LIKE '%[quote%' THEN m->>'text' END AS text
      FROM tv_user_activity_messages a, jsonb_array_elements(a.messages) m
      WHERE a.room_id = ${room} AND jsonb_typeof(a.messages) = 'array' AND m ? 'text'
    `.cursor(5000)) {
      for (const row of rows) add(String(row.username), row.time, row.day, row.hash, row.text)
    }

    for await (const rows of sql`
      SELECT username, extract(epoch from time)::float8 AS time, left(md5(text), 16) AS hash, user_pic,
        CASE WHEN text LIKE '%@%' OR text LIKE '%[quote%' THEN text END AS text
      FROM tv_chat_messages
      WHERE room_id = ${room} AND text IS NOT NULL
      ORDER BY time
    `.cursor(5000)) {
      for (const row of rows) {
        add(String(row.username), row.time, null, row.hash, row.text)
        if (row.user_pic) avatars.set(String(row.username), String(row.user_pic))
      }
    }

    const profiles = new Map<string, ProfileRow>()
    const profileRows = await sql`
      SELECT username, avatar, join_date, followers, display_name FROM tv_user_profiles
    `
    for (const row of profileRows) {
      if (!row.username) continue
      profiles.set(String(row.username).toLowerCase(), {
        avatar: row.avatar ?? null,
        joinDate: row.join_date ? new Date(row.join_date).toISOString().slice(0, 10) : null,
        followers: typeof row.followers === 'number' ? row.followers : null,
        displayName: row.display_name ?? null
      })
    }

    const names = new Map<string, string>()
    const variants = new Map<string, string[]>()
    const byName = new Map<string, Person>()
    for (const [lower, person] of people) {
      const counts = Array.from(spellings.get(lower)!.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      person.username = counts[0][0]
      names.set(lower, person.username)
      variants.set(person.username, counts.map(([name]) => name))
      byName.set(person.username, person)
      const dates = Array.from(person.days.keys()).sort()
      person.activeDays = dates.length
      person.firstDate = dates[0] ?? null
      person.lastDate = dates.at(-1) ?? null
      person.avatar =
        profiles.get(lower)?.avatar || counts.map(([name]) => avatars.get(name)).find(Boolean) || null
    }

    const resolve = (name: string) => names.get(name.toLowerCase()) ?? null
    const events: InteractionEvent[] = []
    for (const message of pendingTexts) {
      for (const hit of interactionsOf(message.author, message.text, resolve)) {
        events.push({ from: resolve(message.author)!, to: hit.to, kind: hit.kind, date: message.date })
      }
    }

    return { room, people: byName, names, variants, profiles, events, readAt: new Date().toISOString() }
  })
}

/** Cached index; stale values are served while a rebuild runs. */
export function roomIndex(room: string): Promise<RoomIndex> {
  const slot = slots.get(room) ?? { builtAt: 0 }
  slots.set(room, slot)
  const fresh = Date.now() - slot.builtAt < TTL_MS
  if (slot.value && fresh) return Promise.resolve(slot.value)
  if (!slot.pending) {
    slot.pending = buildIndex(room)
      .then(value => {
        slot.value = value
        slot.builtAt = Date.now()
        return value
      })
      .finally(() => {
        slot.pending = undefined
      })
    // Keep a failed background rebuild from surfacing as an unhandled rejection.
    slot.pending.catch(() => undefined)
  }
  return slot.value ? Promise.resolve(slot.value) : slot.pending
}

export function canonicalName(index: RoomIndex, username: string): string | null {
  return index.names.get(username.trim().toLowerCase()) ?? null
}

export function personProfile(index: RoomIndex, username: string): PersonProfile {
  const person = index.people.get(username)
  const profile = index.profiles.get(username.toLowerCase())
  return {
    username,
    messages: person?.messages ?? 0,
    activeDays: person?.activeDays ?? 0,
    firstDate: person?.firstDate ?? null,
    lastDate: person?.lastDate ?? null,
    avatar: person?.avatar ?? profile?.avatar ?? null,
    joinDate: profile?.joinDate ?? null,
    followers: profile?.followers ?? null,
    displayName: profile?.displayName ?? null
  }
}

export function personDays(index: RoomIndex, username: string) {
  const person = index.people.get(username)
  if (!person) return []
  return Array.from(person.days.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function yearSummaries(days: Array<{ date: string; count: number }>): YearSummary[] {
  const years = new Map<number, YearSummary>()
  for (const day of days) {
    const year = Number(day.date.slice(0, 4))
    const entry = years.get(year) ?? { year, messages: 0, activeDays: 0 }
    entry.messages += day.count
    if (day.count > 0) entry.activeDays++
    years.set(year, entry)
  }
  return Array.from(years.values()).sort((a, b) => b.year - a.year)
}

export function directory(index: RoomIndex, limit = 400): DirectoryEntry[] {
  return Array.from(index.people.values())
    .sort((a, b) => b.messages - a.messages || a.username.localeCompare(b.username))
    .slice(0, limit)
    .map(person => ({
      username: person.username,
      messages: person.messages,
      lastDate: person.lastDate,
      avatar: person.avatar
    }))
}

/** People who never wrote in the stored archive but were quoted still get a node. */
export function profileResolver(index: RoomIndex) {
  return (username: string) => personProfile(index, username)
}

/** Stored messages of every spelling of one person, chronological. */
export async function readPersonArchive(index: RoomIndex, username: string, from: string, to: string) {
  const spellings = index.variants.get(username) ?? [username]
  const corpora = await Promise.all(
    spellings.map(name => readArchive({ room: index.room, username: name, from, to }))
  )
  return corpora
    .flatMap(corpus => corpus.messages)
    .sort(
      (a, b) =>
        (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
        (a.timestamp ?? 'z').localeCompare(b.timestamp ?? 'z') ||
        a.id.localeCompare(b.id)
    )
}
