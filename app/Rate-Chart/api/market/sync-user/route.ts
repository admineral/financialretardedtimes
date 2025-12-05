/**
 * Sync Local User to Supabase
 * 
 * POST: Creates/updates a user in Supabase from local data
 * This ensures local-only users get added to the database and leaderboard
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SyncUserRequest {
  userId: string
  displayName: string
  totalCredits: number
  availableCredits: number
  totalBetsPlaced: number
  totalBetsWon: number
  totalCreditsWon: number
  totalCreditsLost: number
  bestWin: number
  currentStreak: number
  bestStreak: number
  // Optionally sync bets too
  bets?: {
    gameDate: string
    targetUsername: string
    betType: string
    betAmount: number
    odds: number
    potentialPayout: number
    status: string
    actualPayout?: number
  }[]
}

export async function POST(request: NextRequest) {
  try {
    const body: SyncUserRequest = await request.json()
    
    if (!body.userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }
    
    console.log(`[SYNC-USER] 📤 Syncing user ${body.displayName || body.userId} to Supabase...`)
    console.log(`[SYNC-USER] Credits: ${body.totalCredits}, Available: ${body.availableCredits}`)
    
    const supabase = await createClient()
    
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('market_user_credits')
      .select('*')
      .eq('user_identifier', body.userId)
      .single()
    
    if (existingUser) {
      // Update existing user
      console.log(`[SYNC-USER] User exists, updating...`)
      
      const { error: updateError } = await supabase
        .from('market_user_credits')
        .update({
          display_name: body.displayName || existingUser.display_name,
          total_credits: body.totalCredits,
          available_credits: body.availableCredits,
          total_bets_placed: body.totalBetsPlaced,
          total_bets_won: body.totalBetsWon,
          total_credits_won: body.totalCreditsWon,
          total_credits_lost: body.totalCreditsLost,
          best_win: body.bestWin,
          current_streak: body.currentStreak,
          best_streak: body.bestStreak,
          updated_at: new Date().toISOString()
        })
        .eq('user_identifier', body.userId)
      
      if (updateError) {
        console.error(`[SYNC-USER] Error updating user:`, updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
      
    } else {
      // Create new user
      console.log(`[SYNC-USER] User doesn't exist, creating...`)
      
      const { error: insertError } = await supabase
        .from('market_user_credits')
        .insert({
          user_identifier: body.userId,
          display_name: body.displayName,
          total_credits: body.totalCredits,
          available_credits: body.availableCredits,
          total_bets_placed: body.totalBetsPlaced,
          total_bets_won: body.totalBetsWon,
          total_credits_won: body.totalCreditsWon,
          total_credits_lost: body.totalCreditsLost,
          best_win: body.bestWin,
          current_streak: body.currentStreak,
          best_streak: body.bestStreak
        })
      
      if (insertError) {
        console.error(`[SYNC-USER] Error creating user:`, insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
      
      // Record initial credits transaction
      await supabase
        .from('market_credit_transactions')
        .insert({
          user_identifier: body.userId,
          transaction_type: 'initial_credits',
          amount: 1000,
          balance_after: body.availableCredits,
          description: 'Account synced from local storage'
        })
    }
    
    // Sync bets if provided
    if (body.bets && body.bets.length > 0) {
      console.log(`[SYNC-USER] Syncing ${body.bets.length} bets...`)
      
      for (const bet of body.bets) {
        // Check if bet already exists
        const { data: existingBet } = await supabase
          .from('market_bets')
          .select('id')
          .eq('user_identifier', body.userId)
          .eq('game_date', bet.gameDate)
          .eq('target_username', bet.targetUsername)
          .eq('bet_type', bet.betType)
          .single()
        
        if (!existingBet) {
          // Insert bet (without triggering the placement trigger since credits already deducted locally)
          const { error: betError } = await supabase
            .from('market_bets')
            .insert({
              user_identifier: body.userId,
              game_date: bet.gameDate,
              target_username: bet.targetUsername,
              bet_type: bet.betType,
              bet_amount: bet.betAmount,
              odds: bet.odds,
              potential_payout: bet.potentialPayout,
              status: bet.status,
              actual_payout: bet.actualPayout || (bet.status === 'won' ? bet.potentialPayout : 0),
              resolved_at: bet.status !== 'active' ? new Date().toISOString() : null
            })
          
          if (betError) {
            console.error(`[SYNC-USER] Error syncing bet:`, betError)
          } else {
            console.log(`[SYNC-USER] ✅ Synced bet on ${bet.targetUsername} (${bet.status})`)
          }
        }
      }
    }
    
    // Get updated leaderboard
    const { data: leaderboard } = await supabase
      .from('market_user_credits')
      .select('user_identifier, display_name, total_credits, total_bets_won, best_streak')
      .order('total_credits', { ascending: false })
      .limit(10)
    
    console.log(`[SYNC-USER] ✅ User synced successfully!`)
    
    return NextResponse.json({
      success: true,
      message: `User ${body.displayName || body.userId} synced to Supabase`,
      updated_leaderboard: leaderboard
    })
    
  } catch (error) {
    console.error('[SYNC-USER] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to sync user' },
      { status: 500 }
    )
  }
}

