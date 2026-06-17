import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * DELETE /api/cache-management
 * Clears ALL cached data for a specific user/room combination
 * 
 * Query params:
 * - room: The room ID (e.g., "bitcoin_de_DE")
 * - username: The username to clear cache for
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const room = searchParams.get('room')
    const username = searchParams.get('username')

    if (!room || !username) {
      return NextResponse.json(
        { error: 'Missing required parameters: room and username' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const results: Record<string, number> = {}
    const errors: string[] = []

    console.log(`\n🗑️ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`🗑️ DELETING ALL CACHE for ${username} in ${room}`)
    console.log(`🗑️ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

    // Debug: Check what exists before deleting
    console.log(`  📋 Checking existing data...`)
    const { count: existingDaily } = await supabase
      .from('tv_user_activity_daily')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room)
      .eq('username', username)
    console.log(`     tv_user_activity_daily: ${existingDaily ?? 0} rows exist`)

    const { count: existingMessages } = await supabase
      .from('tv_user_activity_messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room)
      .eq('username', username)
    console.log(`     tv_user_activity_messages: ${existingMessages ?? 0} rows exist`)

    const { count: existingProfile } = await supabase
      .from('tv_user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('username', username)
    console.log(`     tv_user_profiles: ${existingProfile ?? 0} rows exist`)

    const { count: existingChat } = await supabase
      .from('tv_chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room)
      .eq('username', username)
    console.log(`     tv_chat_messages: ${existingChat ?? 0} rows exist`)
    console.log(``)

    // 1. Delete from tv_user_activity_daily
    try {
      const { error, count } = await supabase
        .from('tv_user_activity_daily')
        .delete({ count: 'exact' })
        .eq('room_id', room)
        .eq('username', username)
      
      if (error) {
        console.error('  ❌ tv_user_activity_daily:', error.message)
        errors.push(`tv_user_activity_daily: ${error.message}`)
      } else {
        results.activityDaily = count || 0
        console.log(`  ✅ tv_user_activity_daily: ${count} rows deleted`)
      }
    } catch {
      console.error('  ❌ tv_user_activity_daily: Table may not exist')
    }

    // 2. Delete from tv_user_activity_messages
    try {
      const { error, count } = await supabase
        .from('tv_user_activity_messages')
        .delete({ count: 'exact' })
        .eq('room_id', room)
        .eq('username', username)
      
      if (error) {
        console.error('  ❌ tv_user_activity_messages:', error.message)
        errors.push(`tv_user_activity_messages: ${error.message}`)
      } else {
        results.activityMessages = count || 0
        console.log(`  ✅ tv_user_activity_messages: ${count} rows deleted`)
      }
    } catch {
      console.error('  ❌ tv_user_activity_messages: Table may not exist')
    }

    // 3. Delete from tv_user_profiles
    try {
      const { error, count } = await supabase
        .from('tv_user_profiles')
        .delete({ count: 'exact' })
        .eq('username', username)
      
      if (error) {
        console.error('  ❌ tv_user_profiles:', error.message)
        errors.push(`tv_user_profiles: ${error.message}`)
      } else {
        results.profile = count || 0
        console.log(`  ✅ tv_user_profiles: ${count} rows deleted`)
      }
    } catch {
      console.error('  ❌ tv_user_profiles: Table may not exist')
    }

    // 4. Delete from tv_chat_messages (all chat messages for this user in this room)
    try {
      const { error, count } = await supabase
        .from('tv_chat_messages')
        .delete({ count: 'exact' })
        .eq('room_id', room)
        .eq('username', username)
      
      if (error) {
        console.error('  ❌ tv_chat_messages:', error.message)
        errors.push(`tv_chat_messages: ${error.message}`)
      } else {
        results.chatMessages = count || 0
        console.log(`  ✅ tv_chat_messages: ${count} rows deleted`)
      }
    } catch {
      console.error('  ❌ tv_chat_messages: Table may not exist')
    }

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0)

    console.log(`\n🗑️ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`🗑️ TOTAL DELETED: ${totalDeleted} rows`)
    if (errors.length > 0) {
      console.log(`🗑️ ERRORS: ${errors.length}`)
    }
    console.log(`🗑️ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

    return NextResponse.json({
      success: errors.length === 0,
      message: `Cleared cache for ${username} in ${room}`,
      deleted: results,
      totalDeleted,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Error clearing cache:', error)
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    )
  }
}
