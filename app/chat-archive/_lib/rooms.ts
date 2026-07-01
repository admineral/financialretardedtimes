import type { ActivityWindow, Room } from './types'

export const DEFAULT_ROOM = 'bitcoin_de_DE'

export const ROOMS: Room[] = [
  { value: 'bitcoin_de_DE', label: 'Bitcoin (DE)' },
  { value: 'bitcoin', label: 'Bitcoin (EN)' },
  { value: 'crypto_de_DE', label: 'Crypto (DE)' },
  { value: 'crypto', label: 'Crypto (EN)' },
  { value: 'stocks_de_DE', label: 'Stocks (DE)' },
  { value: 'stocks', label: 'Stocks (EN)' },
  { value: 'forex_de_DE', label: 'Forex (DE)' },
  { value: 'forex', label: 'Forex (EN)' },
]

export function roomLabel(value: string): string {
  return ROOMS.find((r) => r.value === value)?.label ?? value
}

export const ACTIVITY_WINDOWS: Array<{ value: ActivityWindow; label: string }> = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 180 days' },
  { value: 360, label: 'Last year' },
]

export const DEFAULT_WINDOW: ActivityWindow = 360
