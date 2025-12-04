/**
 * Prediction Leaderboard API
 * 
 * GET: Fetch the all-time leaderboard (top players by points)
 * POST: Save daily results and update leaderboard (called at 08:00 Vienna time)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Types
interface LeaderboardEntry {
  username: string
  avatar: string | null
  total_points: number
  first_place_count: number
  second_place_count: number
  third_place_count: number
  games_played: number
  best_prediction_diff: number | null
  current_streak: number
  best_streak: number
}

interface DailyResult {
  game_date: string
  midnight_price: number
  winner_username: string
  winner_avatar?: string
  winner_prediction: number
  winner_difference: number
  winner_timestamp: string
  second_username?: string
  second_avatar?: string
  second_prediction?: number
  second_difference?: number
  second_timestamp?: string
  third_username?: string
  third_avatar?: string
  third_prediction?: number
  third_difference?: number
  third_timestamp?: string
  total_participants: number
  total_predictions: number
}

/**
 * GET /api/Rate-Chart/leaderboard
 * Fetch the all-time leaderboard
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    
    console.log(`[LEADERBOARD] Fetching top ${limit} players`)
    
    const supabase = await createClient()
    
    // Fetch leaderboard sorted by total points
    const { data: leaderboard, error } = await supabase
      .from('prediction_leaderboard')
      .select('*')
      .order('total_points', { ascending: false })
      .order('first_place_count', { ascending: false })
      .order('best_prediction_diff', { ascending: true, nullsFirst: false })
      .limit(limit)
    
    if (error) {
      console.error('[LEADERBOARD] Error fetching leaderboard:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log(`[LEADERBOARD] Found ${leaderboard?.length || 0} players`)
    
    // Also fetch recent daily results for context
    const { data: recentResults } = await supabase
      .from('prediction_daily_results')
      .select('game_date, winner_username, midnight_price')
      .order('game_date', { ascending: false })
      .limit(7)
    
    return NextResponse.json({
      leaderboard: leaderboard || [],
      recentWinners: recentResults || [],
      lastUpdated: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[LEADERBOARD] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/Rate-Chart/leaderboard
 * Save daily results (should be called at 08:00 Vienna time when winners are finalized)
 */
export async function POST(request: NextRequest) {
  try {
    const body: DailyResult = await request.json()
    
    console.log(`[LEADERBOARD] Saving results for ${body.game_date}`)
    console.log(`[LEADERBOARD] Winner: ${body.winner_username} with $${body.winner_prediction}`)
    
    // Validate required fields
    if (!body.game_date || !body.winner_username || !body.midnight_price) {
      return NextResponse.json(
        { error: 'Missing required fields: game_date, winner_username, midnight_price' },
        { status: 400 }
      )
    }
    
    const supabase = await createClient()
    
    // Check if results already exist for this date
    const { data: existing } = await supabase
      .from('prediction_daily_results')
      .select('id')
      .eq('game_date', body.game_date)
      .single()
    
    if (existing) {
      console.log(`[LEADERBOARD] Results already exist for ${body.game_date}`)
      return NextResponse.json(
        { message: 'Results already saved for this date', existing: true },
        { status: 200 }
      )
    }
    
    // Insert the daily results (trigger will update leaderboard automatically)
    const { data, error } = await supabase
      .from('prediction_daily_results')
      .insert({
        game_date: body.game_date,
        midnight_price: body.midnight_price,
        winner_username: body.winner_username,
        winner_avatar: body.winner_avatar,
        winner_prediction: body.winner_prediction,
        winner_difference: body.winner_difference,
        winner_timestamp: body.winner_timestamp,
        second_username: body.second_username,
        second_avatar: body.second_avatar,
        second_prediction: body.second_prediction,
        second_difference: body.second_difference,
        second_timestamp: body.second_timestamp,
        third_username: body.third_username,
        third_avatar: body.third_avatar,
        third_prediction: body.third_prediction,
        third_difference: body.third_difference,
        third_timestamp: body.third_timestamp,
        total_participants: body.total_participants,
        total_predictions: body.total_predictions
      })
      .select()
      .single()
    
    if (error) {
      console.error('[LEADERBOARD] Error saving results:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log(`[LEADERBOARD] ✅ Results saved successfully for ${body.game_date}`)
    
    return NextResponse.json({
      success: true,
      message: 'Daily results saved and leaderboard updated',
      data
    })
    
  } catch (error) {
    console.error('[LEADERBOARD] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to save results' },
      { status: 500 }
    )
  }
}

