import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Force dynamic by reading headers (prevents prerender warning)
  await headers()
  
  const { searchParams } = new URL(request.url)
  const messagesLimit = parseInt(searchParams.get('messagesLimit') || '300', 10)
  
  try {
    const supabase = await createClient()
    
    // Get total message count
    const { count: totalMessages } = await supabase
      .from('tv_chat_messages')
      .select('*', { count: 'exact', head: true })
    
    // Get total profile count
    const { count: totalProfiles } = await supabase
      .from('tv_user_profiles')
      .select('*', { count: 'exact', head: true })
    
    // Get total activity records count
    const { count: totalActivityRecords } = await supabase
      .from('tv_user_activity_daily')
      .select('*', { count: 'exact', head: true })
    
    // Get all sync statuses
    const { data: syncStatuses } = await supabase
      .from('tv_chat_sync_status')
      .select('*')
      .order('last_sync_at', { ascending: false })
    
    // Get recent messages (configurable limit, default 300)
    // Use messagesLimit = 0 or 'all' to get all messages
    let recentMessagesQuery = supabase
      .from('tv_chat_messages')
      .select('id, room_id, username, text, time, user_pic, is_moderator, created_at')
      .order('time', { ascending: false })
    
    if (messagesLimit > 0) {
      recentMessagesQuery = recentMessagesQuery.limit(messagesLimit)
    }
    
    const { data: recentMessages } = await recentMessagesQuery
    
    // Get all cached profiles
    const { data: profiles } = await supabase
      .from('tv_user_profiles')
      .select('username, user_id, display_name, followers, following, ideas_count, reputation, avatar, fetched_at')
      .order('fetched_at', { ascending: false })
    
    // Get recent activity (last 100 records)
    const { data: recentActivity } = await supabase
      .from('tv_user_activity_daily')
      .select('*')
      .order('date', { ascending: false })
      .limit(100)
    
    // Get all users with their message counts
    // Using raw SQL via RPC would be better but let's aggregate in JS for now
    const { data: allMessages } = await supabase
      .from('tv_chat_messages')
      .select('username, time, user_pic')
      .order('time', { ascending: false })
    
    // Aggregate users
    const userMap = new Map<string, {
      username: string
      message_count: number
      first_message: string
      last_message: string
      avatar: string | null
    }>()
    
    if (allMessages) {
      for (const msg of allMessages) {
        const existing = userMap.get(msg.username)
        if (existing) {
          existing.message_count++
          // Update first message (oldest)
          if (new Date(msg.time) < new Date(existing.first_message)) {
            existing.first_message = msg.time
          }
        } else {
          userMap.set(msg.username, {
            username: msg.username,
            message_count: 1,
            first_message: msg.time,
            last_message: msg.time,
            avatar: msg.user_pic
          })
        }
      }
    }
    
    // Create a map of profiles for quick lookup
    const profileMap = new Map((profiles || []).map(p => [p.username, p]))
    
    // Merge user stats with profile data
    const users = Array.from(userMap.values()).map(user => {
      const profile = profileMap.get(user.username)
      return {
        ...user,
        has_profile: !!profile,
        // Include profile stats if available
        followers: profile?.followers ?? null,
        following: profile?.following ?? null,
        ideas_count: profile?.ideas_count ?? null,
        reputation: profile?.reputation ?? null,
        display_name: profile?.display_name ?? null
      }
    })
    
    // Get sync history (last 50 runs)
    const { data: syncHistory } = await supabase
      .from('tv_sync_history')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50)
    
    return NextResponse.json({
      totalMessages: totalMessages || 0,
      totalProfiles: totalProfiles || 0,
      totalActivityRecords: totalActivityRecords || 0,
      syncStatuses: syncStatuses || [],
      recentMessages: recentMessages || [],
      profiles: profiles || [],
      recentActivity: recentActivity || [],
      users,
      syncHistory: syncHistory || []
    })
    
  } catch (error) {
    console.error('[CACHE STATS API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

