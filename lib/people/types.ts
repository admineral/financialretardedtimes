/**
 * Shared shapes for the people/network page (/newspaper/people).
 *
 * Everything here is derived from what the database already stores:
 * profile day arrays (`tv_user_activity_messages`) and the room archive
 * (`tv_chat_messages`). TradingView's public history endpoint is gone,
 * so nothing is fetched live.
 */

export type InteractionKind = 'quote' | 'mention'

/** One quote or @mention found in a stored message. */
export interface InteractionEvent {
  from: string
  to: string
  kind: InteractionKind
  /** Europe/Berlin day key of the message. */
  date: string
}

/** Per-person totals, deduplicated across both stored sources. */
export interface PersonStats {
  username: string
  messages: number
  activeDays: number
  firstDate: string | null
  lastDate: string | null
  avatar: string | null
}

export interface PersonProfile extends PersonStats {
  joinDate: string | null
  followers: number | null
  displayName: string | null
}

export interface Counts {
  quotes: number
  mentions: number
}

export interface NetworkNode extends PersonProfile {
  hop: 0 | 1 | 2
  /** Interactions between this person and the centre, both directions. */
  toCenter: Counts
  fromCenter: Counts
  /** Sum of all interactions with the centre (hop 1) or with ring 1 (hop 2). */
  weight: number
  firstContact: string | null
  lastContact: string | null
}

/** Undirected pair; `ab` counts a → b, `ba` counts b → a. */
export interface NetworkLink {
  a: string
  b: string
  ab: Counts
  ba: Counts
  weight: number
  first: string
  last: string
  /** Interactions per month ('YYYY-MM'), both directions, for the timeline. */
  months: Record<string, number>
}

export interface NetworkResponse {
  username: string
  room: string
  range: { from: string | null; to: string | null }
  nodes: NetworkNode[]
  links: NetworkLink[]
  /** Contacts that exist but were cut by `limit`. */
  hiddenContacts: number
  totalContacts: number
  readAt: string
}

export interface YearSummary {
  year: number
  messages: number
  activeDays: number
}

export interface ProfileResponse {
  username: string
  room: string
  profile: PersonProfile
  days: Array<{ date: string; count: number }>
  years: YearSummary[]
  readAt: string
}

export interface CompactMessage {
  id: string
  ts: string | null
  date: string | null
  text: string
}

export interface DirectoryEntry {
  username: string
  messages: number
  lastDate: string | null
  avatar: string | null
}

export interface CoverageYear {
  year: number
  /** Calendar days in range (join date / first record → today). */
  days: number
  /** Days already looked up, with or without messages. */
  checked: number
  withMessages: number
}

export interface CoverageResponse {
  username: string
  /** Stored spellings of the name; fetches use the canonical one. */
  spellings: string[]
  room: string
  from: string
  to: string
  years: CoverageYear[]
  /** Never-fetched days, newest first. */
  missing: string[]
}
