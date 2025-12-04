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
  total_bonus_points?: number
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
 * Calculate time bonus based on Vienna time of prediction
 * 00:00-08:00 = 100% bonus (multiplier 1.0)
 * 08:00-12:00 = 50% bonus (multiplier 0.5)
 * 12:00-18:00 = 25% bonus (multiplier 0.25)
 * 18:00-23:00 = 0% bonus (multiplier 0)
 */
function calculateTimeBonus(timestamp: string): number {
  const date = new Date(timestamp)
  // Convert to Vienna time
  const viennaTime = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
  const hour = viennaTime.getHours()
  
  if (hour >= 0 && hour < 8) {
    return 1.0 // 100% bonus
  } else if (hour >= 8 && hour < 12) {
    return 0.5 // 50% bonus
  } else if (hour >= 12 && hour < 18) {
    return 0.25 // 25% bonus
  } else {
    return 0 // No bonus (18:00-23:59)
  }
}

/**
 * Calculate total points with time bonus
 * @param basePoints - Base points for placement (3, 2, or 1)
 * @param timeBonus - Time bonus multiplier (0-1)
 * @returns Total points (base * (1 + bonus))
 */
function calculateTotalPoints(basePoints: number, timeBonus: number): number {
  return basePoints * (1 + timeBonus)
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
    
    // Fetch yesterday's full results
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const yesterday = new Date(viennaTime)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayDate = yesterday.toISOString().split('T')[0]
    
    const { data: yesterdayResults } = await supabase
      .from('prediction_daily_results')
      .select('*')
      .eq('game_date', yesterdayDate)
      .single()
    
    console.log(`[LEADERBOARD] Yesterday (${yesterdayDate}) results:`, yesterdayResults ? 'found' : 'not found')
    
    return NextResponse.json({
      leaderboard: leaderboard || [],
      recentWinners: recentResults || [],
      yesterdayResults: yesterdayResults || null,
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
    
    // Validate that the game date is not in the future or today (game must be finished)
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const viennaHour = viennaTime.getHours()
    const todayVienna = viennaTime.toISOString().split('T')[0]
    
    // Game date should be yesterday or earlier (can only save after 08:00 Vienna time)
    const yesterday = new Date(viennaTime)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    
    // Only allow saving if:
    // 1. Game date is before today (past games)
    // 2. OR it's between 00:00-08:00 and game date is yesterday (winners period)
    const isWinnersPeriod = viennaHour < 8
    const isValidGameDate = body.game_date < todayVienna || (isWinnersPeriod && body.game_date === yesterdayStr)
    
    if (!isValidGameDate) {
      console.log(`[LEADERBOARD] Invalid game date: ${body.game_date} (today: ${todayVienna}, winners period: ${isWinnersPeriod})`)
      return NextResponse.json(
        { error: `Cannot save results for ${body.game_date}. Can only save results for completed games (yesterday or earlier).` },
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
    
    // Calculate time bonuses for each placement
    const winnerTimeBonus = calculateTimeBonus(body.winner_timestamp)
    const winnerTotalPoints = calculateTotalPoints(3, winnerTimeBonus)
    
    const secondTimeBonus = body.second_timestamp ? calculateTimeBonus(body.second_timestamp) : 0
    const secondTotalPoints = body.second_timestamp ? calculateTotalPoints(2, secondTimeBonus) : 2
    
    const thirdTimeBonus = body.third_timestamp ? calculateTimeBonus(body.third_timestamp) : 0
    const thirdTotalPoints = body.third_timestamp ? calculateTotalPoints(1, thirdTimeBonus) : 1
    
    console.log(`[LEADERBOARD] Time bonuses - Winner: ${winnerTimeBonus} (${winnerTotalPoints}pts), 2nd: ${secondTimeBonus} (${secondTotalPoints}pts), 3rd: ${thirdTimeBonus} (${thirdTotalPoints}pts)`)
    
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
        winner_time_bonus: winnerTimeBonus,
        winner_total_points: winnerTotalPoints,
        second_username: body.second_username,
        second_avatar: body.second_avatar,
        second_prediction: body.second_prediction,
        second_difference: body.second_difference,
        second_timestamp: body.second_timestamp,
        second_time_bonus: secondTimeBonus,
        second_total_points: secondTotalPoints,
        third_username: body.third_username,
        third_avatar: body.third_avatar,
        third_prediction: body.third_prediction,
        third_difference: body.third_difference,
        third_timestamp: body.third_timestamp,
        third_time_bonus: thirdTimeBonus,
        third_total_points: thirdTotalPoints,
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


