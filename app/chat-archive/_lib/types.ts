// Single source of truth for all Chat Archive data shapes.

export type HourCounts = Record<number, number>

export interface ActivityMessageSample {
  id: string
  text: string
  time: string
  avatar?: string
}

export interface ActivityData {
  /** YYYY-MM-DD */
  date: string
  count: number
  messages?: ActivityMessageSample[]
  fromCache?: boolean
}

export interface HourStat {
  hour: number
  count: number
  percentage: number
}

export interface ActivityPatterns {
  totalMessages: number
  peakHour: HourStat
  topHours: HourStat[]
  hourCounts: HourCounts
  daysWithFullData: number
  daysWithSampleData: number
  isComprehensive: boolean
}

export interface ActivityResponse {
  activities: ActivityData[]
  room: string
  username: string
  totalDays?: number
  totalMessages?: number
  cachedCount?: number
  fetchedCount?: number
}

export interface Profile {
  username: string | null
  displayName?: string | null
  followers: number | null
  following: number | null
  ideas: number | null
  scripts?: number | null
  reputation?: number | null
  joinDate: string | null
  avatar: string | null
  bio: string | null
  badges?: string[]
  error?: string
}

export interface Idea {
  index: number
  title: string | null
  url: string | null
  content: string | null
  symbol: string | null
  imageUrl: string | null
  author: string | null
  publishedAt: string | null
  comments: number
  boosts: number
  isEditorsPick: boolean
  strategy: string | null
  chartId: string | null
  page: number
}

export interface IdeasResponse {
  username: string
  page: number
  ideas: Idea[]
  hasNextPage: boolean
  source?: string
  timestamp?: string
  cacheAge?: number
  error?: string
}

export interface ChatMessage {
  id: string
  username: string
  text: string
  time: string
  avatar?: string
  permalink?: string
  userProfileUrl?: string
}

export interface ChatPaginationInfo {
  currentPage: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
  pageLinks: Array<{ page: number; url: string; isCurrent: boolean }>
}

export interface ChatArchiveData {
  messages: ChatMessage[]
  room: string
  date: string
  username: string
  totalMessages: number
  totalPages: number
  pagesProcessed: number
  paginationInfo?: ChatPaginationInfo
}

export interface Room {
  value: string
  label: string
}

export interface RecentUser {
  username: string
  room: string
  lastVisited: number
}

export type ArchiveTab = 'activity' | 'ideas'

export type ActivityWindow = 30 | 90 | 180 | 360
