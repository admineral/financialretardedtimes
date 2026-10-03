/**
 * Shared types for TradingView chat tooling (export, people/network).
 *
 * Room ids are configuration; people are never defaults. Pages that take
 * a username start empty and only ever use what the visitor typed.
 */

export const DEFAULT_ROOM = 'bitcoin_de_DE'
export const ARCHIVE_WINDOW_DAYS = 3650
export const MESSAGE_LIST_PAGE = 250

export const ROOM_OPTIONS: { id: string; label: string }[] = [
  { id: 'bitcoin_de_DE', label: 'Bitcoin (DE)' },
  { id: 'bitcoin', label: 'Bitcoin (EN)' },
  { id: 'crypto_de_DE', label: 'Krypto (DE)' },
  { id: 'crypto', label: 'Crypto (EN)' },
  { id: 'stocks_de_DE', label: 'Aktien (DE)' },
  { id: 'stocks', label: 'Stocks (EN)' },
  { id: 'forex_de_DE', label: 'Forex (DE)' },
  { id: 'forex', label: 'Forex (EN)' }
]

export type EdgeKind = 'quote' | 'mention'

export interface QuoteBlock {
  username: string
  content: string
}

export interface RecoveredMessage {
  id: string
  text: string
  time: string
  permalink?: string
  quotes: QuoteBlock[]
  mentions: string[]
  ideaUrls: string[]
  chartUrls: string[]
  externalUrls: string[]
}

export type MessageSource = 'history' | 'live'

export interface ListedMessage extends RecoveredMessage {
  username: string
  date: string
  source: MessageSource
}

/** One calendar day of a user's activity (heatmap cell). */
export interface ActivityDay {
  date: string
  count: number
}

export interface ActivityMessage {
  id: string
  text: string
  time: string
}
