export interface ChatMessage {
  id: string
  username: string
  text: string
  time: string
  avatar?: string
  userId?: string
  isBot?: boolean
  user_id?: number
  user_pic?: string
  badges?: Array<{
    name: string
    verbose_name: string
  }>
  is_moderator?: boolean
  meta?: {
    text?: string
    interval?: string
    url?: string
    preview_url?: string
    type?: string
    links?: {
      charts?: {
        occurences?: Array<{
          start: number
          end: number
          match: string
          id: string
        }>
        data?: Record<string, {
          pk: number
          image_url: string
          user_id: number
          name: string
          symbol: string
          published_chart_url: string
          is_video: boolean
          video_cam: boolean
          script_type: string
        }>
      }
    }
    version?: string
    temp?: {
      chart_likes?: Record<string, {
        voted: boolean
        count: number
      }>
    }
  }
  room_id?: string
  symbol?: string
  interval?: string
  type?: string
}

export interface WebSocketMessage {
  text?: {
    channel: string
    content: {
      data: ChatMessage
    }
  }
}

export interface TradingViewUserProfile {
  userId: string
  username: string | null
  displayName: string | null
  bio: string | null
  location: string | null
  website: string | null
  joinDate: string | null
  followers: number | null
  following: number | null
  ideas: number | null
  scripts: number | null
  reputation: number | null
  badges: string[]
  avatar: string | null
  isOwner: boolean | null
  isFollowed: boolean | null
  isInactive: boolean | null
  isOnline: boolean | null
  lastLogin: string | null
  socialLinks: Array<{name?: string; url?: string} | string>
  canEditBio: boolean | null
  canCreateScriptsPackages: boolean | null
  paidSpace: Record<string, unknown> | null
  banInfo: Record<string, unknown> | null
  metaDescription: string | null
  ogImage: string | null
  pageTitle: string | null
  extractedIdeas?: Array<{
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
  }>
  error?: string
}

export interface ChatState {
  messages: ChatMessage[]
  isConnected: boolean
  isLoading: boolean
  error: string | null
}

export interface ChatConfig {
  roomId: string
  origin: string
  wsUrl: string
  pollingInterval?: number // in milliseconds
  enablePolling?: boolean
}

export interface PollingConfig {
  enabled: boolean
  interval: number // in milliseconds
  minInterval: number
  maxInterval: number
}

export interface TradingViewIdea {
  id: string
  title: string
  description: string
  symbol: string
  timeframe: string
  createdAt: string
  updatedAt: string
  likesCount: number
  commentsCount: number
  viewsCount: number
  url: string
  previewUrl: string | null
  imageUrl: string | null
  tags: string[]
  status: string
  isPrivate: boolean
  author: {
    id: number
    username: string
    displayName: string | null
    avatar: string | null
    isPro: boolean
    badges: string[]
  }
}

export interface UserIdeasResponse {
  ideas: TradingViewIdea[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  userId: string
  username: string | null
}
