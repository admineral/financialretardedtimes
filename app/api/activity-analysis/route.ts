import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * API endpoint to analyze available activity data in the cache
 * Used by the activity tracker to show available day range options
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { room, username, action } = body

    if (!room || !username) {
      return NextResponse.json(
        { error: 'Missing required parameters: room and username' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    if (action === 'check-available') {
      // Query the database to find how much data we have cached
      const { data, error } = await supabase
        .from('tv_user_activity_daily')
        .select('date, message_count')
        .eq('room_id', room)
        .eq('username', username)
        .order('date', { ascending: true })

      if (error) {
        console.error('[activity-analysis] Database error:', error)
        return NextResponse.json({
          totalDays: 0,
          oldestDate: null,
          newestDate: null,
          availableRanges: [30]
        })
      }

      if (!data || data.length === 0) {
        return NextResponse.json({
          totalDays: 0,
          oldestDate: null,
          newestDate: null,
          availableRanges: [30]
        })
      }

      // Calculate available ranges based on cached data
      const totalDays = data.length
      const oldestDate = data[0].date
      const newestDate = data[data.length - 1].date
      
      // Count days with actual messages
      const daysWithMessages = data.filter(d => d.message_count > 0).length
      
      // Determine which ranges we can show based on data
      // Note: 0 represents "MAX" (all available data) - handled on frontend
      const ranges: number[] = [30] // Always show 30 days
      
      if (totalDays >= 60) ranges.push(60)
      if (totalDays >= 90) ranges.push(90)
      if (totalDays >= 180) ranges.push(180)
      // MAX is handled dynamically on frontend based on totalDays

      console.log(`[activity-analysis] ${username}: ${totalDays} days cached, ranges: ${ranges.join(', ')}${totalDays > 180 ? ', MAX' : ''}`)

      return NextResponse.json({
        totalDays,
        oldestDate,
        newestDate,
        daysWithMessages,
        availableRanges: ranges,
        // Also return the total message count
        totalMessages: data.reduce((sum, d) => sum + d.message_count, 0)
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('[activity-analysis] Error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze activity data' },
      { status: 500 }
    )
  }
}
