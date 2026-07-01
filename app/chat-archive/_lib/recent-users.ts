import type { RecentUser } from './types'

const RECENT_USERS_KEY = 'chat-archive-recent-users'
const MAX_RECENT_USERS = 10

export function getRecentUsers(): RecentUser[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(RECENT_USERS_KEY)
    return stored ? (JSON.parse(stored) as RecentUser[]) : []
  } catch {
    return []
  }
}

export function saveRecentUser(username: string, room: string): void {
  if (typeof window === 'undefined') return
  try {
    const users = getRecentUsers().filter(
      (u) => !(u.username === username && u.room === room)
    )
    const updated: RecentUser[] = [
      { username, room, lastVisited: Date.now() },
      ...users,
    ].slice(0, MAX_RECENT_USERS)
    localStorage.setItem(RECENT_USERS_KEY, JSON.stringify(updated))
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

export function removeRecentUser(username: string, room: string): void {
  if (typeof window === 'undefined') return
  try {
    const users = getRecentUsers().filter(
      (u) => !(u.username === username && u.room === room)
    )
    localStorage.setItem(RECENT_USERS_KEY, JSON.stringify(users))
  } catch {
    // Ignore storage errors
  }
}
