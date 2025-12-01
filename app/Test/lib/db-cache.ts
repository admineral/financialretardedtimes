import { createClient } from '@/lib/supabase/server'
import { ChatMessage, TradingViewUserProfile } from '../types'

// ============================================
// Types for Database Tables
// ============================================

export interface DBChatMessage {
  id: string
  room_id: string
  username: string
  user_id: number | null
  text: string
  time: string
  user_pic: string | null
  badges: Array<{ name: string; verbose_name: string }> | null
  is_moderator: boolean
  meta: Record<string, unknown> | null
  symbol: string | null
  created_at: string
}

export interface DBSyncStatus {
  room_id: string
  last_sync_at: string
  newest_message_time: string | null
  oldest_message_time: string | null
  total_messages: number
  is_full_history: boolean
  updated_at: string
}

export interface DBUserProfile {
  username: string
  user_id: number | null
  display_name: string | null
  bio: string | null
  location: string | null
  website: string | null
  followers: number | null
  following: number | null
  ideas_count: number | null
  scripts_count: number | null
  reputation: number | null
  badges: unknown[] | null
  avatar: string | null
  join_date: string | null
  is_online: boolean | null
  last_login: string | null
  social_links: unknown[] | null
  raw_data: Record<string, unknown> | null
  fetched_at: string
  updated_at: string
}

export interface DBUserActivity {
  room_id: string
  username: string
  date: string
  message_count: number
  hour_distribution: Record<string, number> | null
  updated_at: string
}

// ============================================
// Chat Messages Cache
// ============================================

/**
 * Get sync status for a room
 */
export async function getSyncStatus(roomId: string): Promise<DBSyncStatus | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tv_chat_sync_status')
    .select('*')
    .eq('room_id', roomId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found - this is fine, return null
      return null
    }
    // Table doesn't exist or other DB error - throw so caller can handle
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      console.error('[DB Cache] Table does not exist:', error)
      throw new Error('Database tables not set up')
    }
    console.error('[DB Cache] Error getting sync status:', error)
    throw error
  }
  
  return data
}

/**
 * Update sync status for a room
 */
export async function updateSyncStatus(
  roomId: string,
  updates: Partial<Omit<DBSyncStatus, 'room_id'>>
): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('tv_chat_sync_status')
    .upsert({
      room_id: roomId,
      ...updates,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'room_id'
    })
  
  if (error) {
    console.error('[DB Cache] Error updating sync status:', error)
    throw error
  }
}

/**
 * Get cached chat messages for a room
 */
export async function getCachedMessages(
  roomId: string,
  options?: {
    limit?: number
    offset?: number
    since?: Date
    until?: Date
  }
): Promise<ChatMessage[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('tv_chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('time', { ascending: true })
  
  if (options?.since) {
    query = query.gte('time', options.since.toISOString())
  }
  
  if (options?.until) {
    query = query.lte('time', options.until.toISOString())
  }
  
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 100) - 1)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('[DB Cache] Error getting cached messages:', error)
    return []
  }
  
  // Convert DB format to ChatMessage format
  return (data || []).map(dbMessageToChatMessage)
}

/**
 * Get the count of cached messages for a room
 */
export async function getCachedMessageCount(roomId: string): Promise<number> {
  const supabase = await createClient()
  
  const { count, error } = await supabase
    .from('tv_chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)
  
  if (error) {
    console.error('[DB Cache] Error getting message count:', error)
    return 0
  }
  
  return count || 0
}

/**
 * Cache chat messages (upsert)
 */
export async function cacheMessages(
  roomId: string,
  messages: ChatMessage[]
): Promise<{ inserted: number; updated: number }> {
  if (messages.length === 0) {
    return { inserted: 0, updated: 0 }
  }
  
  // Get unique usernames from messages for logging
  const uniqueUsers = [...new Set(messages.map(m => m.username))]
  console.log(`💾 [DB Cache] Caching ${messages.length} messages for room "${roomId}" from users: ${uniqueUsers.join(', ')}`)
  
  const supabase = await createClient()
  
  // Convert ChatMessage to DB format
  const dbMessages = messages.map(msg => chatMessageToDBMessage(roomId, msg))
  
  // Upsert in batches of 500
  const batchSize = 500
  let totalInserted = 0
  
  for (let i = 0; i < dbMessages.length; i += batchSize) {
    const batch = dbMessages.slice(i, i + batchSize)
    
    const { error } = await supabase
      .from('tv_chat_messages')
      .upsert(batch, {
        onConflict: 'room_id,id',
        ignoreDuplicates: false
      })
    
    if (error) {
      console.error('[DB Cache] Error caching messages batch:', error)
      throw error
    }
    
    totalInserted += batch.length
  }
  
  // Update sync status
  const times = messages.map(m => new Date(m.time).getTime())
  const newestTime = new Date(Math.max(...times))
  const oldestTime = new Date(Math.min(...times))
  
  const currentStatus = await getSyncStatus(roomId)
  
  await updateSyncStatus(roomId, {
    last_sync_at: new Date().toISOString(),
    newest_message_time: currentStatus?.newest_message_time 
      ? new Date(Math.max(new Date(currentStatus.newest_message_time).getTime(), newestTime.getTime())).toISOString()
      : newestTime.toISOString(),
    oldest_message_time: currentStatus?.oldest_message_time
      ? new Date(Math.min(new Date(currentStatus.oldest_message_time).getTime(), oldestTime.getTime())).toISOString()
      : oldestTime.toISOString(),
    total_messages: await getCachedMessageCount(roomId)
  })
  
  console.log(`✅ [DB Cache] Successfully cached ${totalInserted} messages for room "${roomId}"`)
  return { inserted: totalInserted, updated: 0 }
}

/**
 * Mark a room as having full history cached
 */
export async function markFullHistoryCached(roomId: string): Promise<void> {
  await updateSyncStatus(roomId, {
    is_full_history: true,
    last_sync_at: new Date().toISOString()
  })
}

// ============================================
// User Profiles Cache
// ============================================

/**
 * Get cached user profile
 */
export async function getCachedProfile(username: string): Promise<TradingViewUserProfile | null> {
  console.log(`🔍 [DB Cache] Looking up cached profile for user: "${username}"`)
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tv_user_profiles')
    .select('*')
    .eq('username', username)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') {
      console.log(`📭 [DB Cache] No cached profile found for user: "${username}"`)
      return null
    }
    console.error(`❌ [DB Cache] Error getting cached profile for "${username}":`, error)
    return null
  }
  
  console.log(`✅ [DB Cache] Found cached profile for user: "${username}"`)
  return dbProfileToTradingViewProfile(data)
}

/**
 * Check if a cached profile is still fresh (< 24 hours old)
 */
export async function isProfileFresh(username: string): Promise<boolean> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tv_user_profiles')
    .select('fetched_at')
    .eq('username', username)
    .single()
  
  if (error || !data) {
    return false
  }
  
  const fetchedAt = new Date(data.fetched_at)
  const now = new Date()
  const hoursDiff = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60)
  
  return hoursDiff < 24
}

/**
 * Cache user profile
 */
export async function cacheProfile(profile: TradingViewUserProfile): Promise<void> {
  if (!profile.username) {
    console.warn('[DB Cache] Cannot cache profile without username')
    return
  }
  
  console.log(`💾 [DB Cache] Caching profile for user: "${profile.username}"`)
  const supabase = await createClient()
  
  const dbProfile: Partial<DBUserProfile> = {
    username: profile.username,
    user_id: profile.userId ? parseInt(profile.userId) : null,
    display_name: profile.displayName,
    bio: profile.bio,
    location: profile.location,
    website: profile.website,
    followers: profile.followers,
    following: profile.following,
    ideas_count: profile.ideas,
    scripts_count: profile.scripts,
    reputation: profile.reputation,
    badges: profile.badges,
    avatar: profile.avatar,
    join_date: profile.joinDate,
    is_online: profile.isOnline,
    last_login: profile.lastLogin,
    social_links: profile.socialLinks,
    raw_data: profile as unknown as Record<string, unknown>,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  
  const { error } = await supabase
    .from('tv_user_profiles')
    .upsert(dbProfile, {
      onConflict: 'username'
    })
  
  if (error) {
    console.error(`❌ [DB Cache] Error caching profile for "${profile.username}":`, error)
    throw error
  }
  
  console.log(`✅ [DB Cache] Successfully cached profile for user: "${profile.username}"`)
}

/**
 * Get multiple cached profiles
 */
export async function getCachedProfiles(usernames: string[]): Promise<Map<string, TradingViewUserProfile>> {
  if (usernames.length === 0) {
    return new Map()
  }
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tv_user_profiles')
    .select('*')
    .in('username', usernames)
  
  if (error) {
    console.error('[DB Cache] Error getting cached profiles:', error)
    return new Map()
  }
  
  const profileMap = new Map<string, TradingViewUserProfile>()
  for (const dbProfile of data || []) {
    profileMap.set(dbProfile.username, dbProfileToTradingViewProfile(dbProfile))
  }
  
  return profileMap
}

// ============================================
// User Activity Cache
// ============================================

/**
 * Get user activity for a date range
 */
export async function getUserActivity(
  roomId: string,
  username: string,
  days: number = 30
): Promise<DBUserActivity[]> {
  const supabase = await createClient()
  
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  const { data, error } = await supabase
    .from('tv_user_activity_daily')
    .select('*')
    .eq('room_id', roomId)
    .eq('username', username)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false })
  
  if (error) {
    console.error('[DB Cache] Error getting user activity:', error)
    return []
  }
  
  return data || []
}

/**
 * Get activity for multiple users
 */
export async function getMultipleUsersActivity(
  roomId: string,
  usernames: string[],
  days: number = 30
): Promise<Map<string, DBUserActivity[]>> {
  if (usernames.length === 0) {
    return new Map()
  }
  
  const supabase = await createClient()
  
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  const { data, error } = await supabase
    .from('tv_user_activity_daily')
    .select('*')
    .eq('room_id', roomId)
    .in('username', usernames)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false })
  
  if (error) {
    console.error('[DB Cache] Error getting multiple users activity:', error)
    return new Map()
  }
  
  const activityMap = new Map<string, DBUserActivity[]>()
  for (const activity of data || []) {
    const existing = activityMap.get(activity.username) || []
    existing.push(activity)
    activityMap.set(activity.username, existing)
  }
  
  return activityMap
}

/**
 * Manually refresh activity for a user (triggers the SQL function)
 */
export async function refreshUserActivity(
  roomId: string,
  username: string,
  date: Date
): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase.rpc('aggregate_user_activity', {
    p_room_id: roomId,
    p_username: username,
    p_date: date.toISOString().split('T')[0]
  })
  
  if (error) {
    console.error('[DB Cache] Error refreshing user activity:', error)
    throw error
  }
}

/**
 * Refresh all activity for a room on a specific date
 */
export async function refreshRoomActivity(roomId: string, date: Date): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase.rpc('refresh_room_activity', {
    p_room_id: roomId,
    p_date: date.toISOString().split('T')[0]
  })
  
  if (error) {
    console.error('[DB Cache] Error refreshing room activity:', error)
    throw error
  }
}

// ============================================
// Activity Messages Cache (for hover cards)
// ============================================

export interface DBActivityMessage {
  id: string
  text: string
  time: string
  avatar?: string
}

export interface DBActivityWithMessages {
  room_id: string
  username: string
  date: string
  message_count: number
  messages: DBActivityMessage[]
  fetched_at: string
}

/**
 * Get cached activity data for a user on specific dates
 */
export async function getCachedActivityForDates(
  roomId: string,
  username: string,
  dates: string[]
): Promise<Map<string, DBActivityWithMessages>> {
  if (dates.length === 0) {
    return new Map()
  }
  
  const supabase = await createClient()
  
  // Get activity counts
  const { data: activityData, error: activityError } = await supabase
    .from('tv_user_activity_daily')
    .select('*')
    .eq('room_id', roomId)
    .eq('username', username)
    .in('date', dates)
  
  if (activityError) {
    console.error('[DB Cache] Error getting cached activity:', activityError)
    return new Map()
  }
  
  // Get activity messages
  const { data: messagesData, error: messagesError } = await supabase
    .from('tv_user_activity_messages')
    .select('*')
    .eq('room_id', roomId)
    .eq('username', username)
    .in('date', dates)
  
  if (messagesError) {
    console.error('[DB Cache] Error getting cached activity messages:', messagesError)
  }
  
  // Combine into map
  const result = new Map<string, DBActivityWithMessages>()
  
  const messagesMap = new Map<string, DBActivityMessage[]>()
  for (const msg of messagesData || []) {
    messagesMap.set(msg.date, msg.messages || [])
  }
  
  for (const activity of activityData || []) {
    result.set(activity.date, {
      room_id: activity.room_id,
      username: activity.username,
      date: activity.date,
      message_count: activity.message_count,
      messages: messagesMap.get(activity.date) || [],
      fetched_at: activity.fetched_at || activity.updated_at
    })
  }
  
  return result
}

/**
 * Check which dates are missing from cache
 */
export async function getMissingActivityDates(
  roomId: string,
  username: string,
  dates: string[]
): Promise<string[]> {
  if (dates.length === 0) {
    return []
  }
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tv_user_activity_daily')
    .select('date')
    .eq('room_id', roomId)
    .eq('username', username)
    .in('date', dates)
  
  if (error) {
    console.error('[DB Cache] Error checking cached dates:', error)
    return dates // Return all dates as missing on error
  }
  
  const cachedDates = new Set((data || []).map(d => d.date))
  return dates.filter(date => !cachedDates.has(date))
}

/**
 * Cache activity data for a user
 */
export async function cacheActivityData(
  roomId: string,
  username: string,
  activities: Array<{
    date: string
    count: number
    messages: DBActivityMessage[]
  }>
): Promise<void> {
  if (activities.length === 0) {
    return
  }
  
  const supabase = await createClient()
  
  // Prepare activity records
  const activityRecords = activities.map(a => ({
    room_id: roomId,
    username: username,
    date: a.date,
    message_count: a.count,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }))
  
  // Prepare message records
  const messageRecords = activities.map(a => ({
    room_id: roomId,
    username: username,
    date: a.date,
    messages: a.messages,
    fetched_at: new Date().toISOString()
  }))
  
  // Upsert activity counts
  const { error: activityError } = await supabase
    .from('tv_user_activity_daily')
    .upsert(activityRecords, {
      onConflict: 'room_id,username,date'
    })
  
  if (activityError) {
    console.error('[DB Cache] Error caching activity:', activityError)
    throw activityError
  }
  
  // Upsert activity messages
  const { error: messagesError } = await supabase
    .from('tv_user_activity_messages')
    .upsert(messageRecords, {
      onConflict: 'room_id,username,date'
    })
  
  if (messagesError) {
    console.error('[DB Cache] Error caching activity messages:', messagesError)
    // Don't throw - messages are optional
  }
  
  console.log(`✅ [DB Cache] Cached ${activities.length} activity records for ${username}`)
}

/**
 * Check if activity data for today needs refresh (older than 15 minutes)
 */
export async function isActivityStale(
  roomId: string,
  username: string,
  date: string,
  maxAgeMinutes: number = 15
): Promise<boolean> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('tv_user_activity_daily')
    .select('fetched_at, updated_at')
    .eq('room_id', roomId)
    .eq('username', username)
    .eq('date', date)
    .single()
  
  if (error || !data) {
    return true // Not cached = stale
  }
  
  const fetchedAt = new Date(data.fetched_at || data.updated_at)
  const now = new Date()
  const diffMinutes = (now.getTime() - fetchedAt.getTime()) / (1000 * 60)
  
  return diffMinutes > maxAgeMinutes
}

// ============================================
// Chatters List (derived from messages)
// ============================================

export interface ChatterStats {
  username: string
  message_count: number
  last_message_time: string
  avatar: string | null
  is_moderator: boolean
}

/**
 * Get chatters list from cached messages
 */
export async function getChatters(roomId: string): Promise<ChatterStats[]> {
  const supabase = await createClient()
  
  // Get aggregated chatter stats
  const { data, error } = await supabase
    .from('tv_chat_messages')
    .select('username, user_pic, is_moderator, time')
    .eq('room_id', roomId)
    .order('time', { ascending: false })
  
  if (error) {
    console.error('[DB Cache] Error getting chatters:', error)
    return []
  }
  
  // Aggregate in JS (Supabase doesn't support complex aggregations easily)
  const chatterMap = new Map<string, ChatterStats>()
  
  for (const msg of data || []) {
    const existing = chatterMap.get(msg.username)
    if (existing) {
      existing.message_count++
      // Keep the most recent avatar and moderator status
    } else {
      chatterMap.set(msg.username, {
        username: msg.username,
        message_count: 1,
        last_message_time: msg.time,
        avatar: msg.user_pic,
        is_moderator: msg.is_moderator
      })
    }
  }
  
  // Sort by message count descending
  return Array.from(chatterMap.values())
    .sort((a, b) => b.message_count - a.message_count)
}

// ============================================
// Conversion Helpers
// ============================================

function chatMessageToDBMessage(roomId: string, msg: ChatMessage): Omit<DBChatMessage, 'created_at'> {
  return {
    id: msg.id || `${msg.username}-${msg.time}`,
    room_id: roomId,
    username: msg.username,
    user_id: msg.user_id || null,
    text: msg.text,
    time: msg.time,
    user_pic: msg.user_pic || msg.avatar || null,
    badges: msg.badges || null,
    is_moderator: msg.is_moderator || false,
    meta: msg.meta as Record<string, unknown> || null,
    symbol: msg.symbol || null
  }
}

function dbMessageToChatMessage(dbMsg: DBChatMessage): ChatMessage {
  return {
    id: dbMsg.id,
    username: dbMsg.username,
    text: dbMsg.text,
    time: dbMsg.time,
    avatar: dbMsg.user_pic || undefined,
    user_id: dbMsg.user_id || undefined,
    user_pic: dbMsg.user_pic || undefined,
    badges: dbMsg.badges || undefined,
    is_moderator: dbMsg.is_moderator,
    meta: dbMsg.meta as ChatMessage['meta'],
    symbol: dbMsg.symbol || undefined
  }
}

function dbProfileToTradingViewProfile(dbProfile: DBUserProfile): TradingViewUserProfile {
  return {
    userId: dbProfile.user_id?.toString() || dbProfile.username,
    username: dbProfile.username,
    displayName: dbProfile.display_name,
    bio: dbProfile.bio,
    location: dbProfile.location,
    website: dbProfile.website,
    joinDate: dbProfile.join_date,
    followers: dbProfile.followers,
    following: dbProfile.following,
    ideas: dbProfile.ideas_count,
    scripts: dbProfile.scripts_count,
    reputation: dbProfile.reputation,
    badges: (dbProfile.badges as string[]) || [],
    avatar: dbProfile.avatar,
    isOwner: null,
    isFollowed: null,
    isInactive: null,
    isOnline: dbProfile.is_online,
    lastLogin: dbProfile.last_login,
    socialLinks: (dbProfile.social_links as Array<{name?: string; url?: string} | string>) || [],
    canEditBio: null,
    canCreateScriptsPackages: null,
    paidSpace: null,
    banInfo: null,
    metaDescription: null,
    ogImage: null,
    pageTitle: null
  }
}

