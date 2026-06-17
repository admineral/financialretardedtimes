/**
 * Market Credits Recalculation API
 * 
 * POST: Recalculates all user credits from bet history and fixes Supabase
 * GET: Returns current state and any discrepancies found
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface UserStats {
  user_identifier: string
  display_name: string | null
  calculated_total_credits: number
  calculated_available_credits: number
  total_bets_placed: number
  total_bets_won: number
  total_credits_won: number
  total_credits_lost: number
  best_win: number
  current_streak: number
  best_streak: number
}

/**
 * GET /api/Rate-Chart/market/recalculate
 * Check for discrepancies without fixing
 */
export async function GET() {
  try {
    console.log('[RECALCULATE] Checking market credits for discrepancies...')
    
    const supabase = await createClient()
    
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('market_user_credits')
      .select('*')
      .order('total_credits', { ascending: false })
    
    if (usersError) {
      console.error('[RECALCULATE] Error fetching users:', usersError)
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }
    
    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users found', users: [] })
    }
    
    // Get all transactions for calculation
    const { data: allTransactions } = await supabase
      .from('market_credit_transactions')
      .select('*')
      .order('created_at', { ascending: true })
    
    // Get all bets
    const { data: allBets } = await supabase
      .from('market_bets')
      .select('*')
      .order('created_at', { ascending: true })
    
    const discrepancies: {
      user_identifier: string
      display_name: string | null
      stored_total_credits: number
      stored_available_credits: number
      calculated_total_credits: number
      calculated_available_credits: number
      difference_total: number
      difference_available: number
    }[] = []
    
    const userStats: UserStats[] = []
    
    for (const user of users) {
      // Calculate what credits should be based on bet history
      const userTxns = (allTransactions || []).filter(t => t.user_identifier === user.user_identifier)
      const userBets = (allBets || []).filter(b => b.user_identifier === user.user_identifier)
      
      // Start with initial credits (1000)
      let calculatedTotal = 1000
      let totalWon = 0
      let totalLost = 0
      let betsWon = 0
      let bestWin = 0
      
      // Add ONLY claimed daily bonuses (from transactions table)
      const claimedBonuses = userTxns.filter(t => t.transaction_type === 'daily_bonus')
      for (const bonus of claimedBonuses) {
        calculatedTotal += Number(bonus.amount)
      }
      
      // Process all bets
      for (const bet of userBets) {
        const betAmount = Number(bet.bet_amount)
        
        if (bet.status === 'won') {
          const payout = Number(bet.actual_payout) || Number(bet.potential_payout)
          const profit = payout - betAmount
          calculatedTotal += profit // Net gain
          totalWon += payout
          betsWon++
          if (profit > bestWin) bestWin = profit
        } else if (bet.status === 'lost') {
          calculatedTotal -= betAmount // Lost the bet amount
          totalLost += betAmount
        }
        // Active bets don't affect total yet
      }
      
      // Calculate available = total - locked in active bets
      const activeBets = userBets.filter(b => b.status === 'active')
      const lockedInBets = activeBets.reduce((sum, b) => sum + Number(b.bet_amount), 0)
      const calculatedAvailable = calculatedTotal - lockedInBets
      
      const stats: UserStats = {
        user_identifier: user.user_identifier,
        display_name: user.display_name,
        calculated_total_credits: Math.round(calculatedTotal * 100) / 100,
        calculated_available_credits: Math.round(calculatedAvailable * 100) / 100,
        total_bets_placed: userBets.length,
        total_bets_won: betsWon,
        total_credits_won: Math.round(totalWon * 100) / 100,
        total_credits_lost: Math.round(totalLost * 100) / 100,
        best_win: Math.round(bestWin * 100) / 100,
        current_streak: user.current_streak || 0,
        best_streak: user.best_streak || 0
      }
      userStats.push(stats)
      
      // Check for discrepancy
      const storedTotal = Number(user.total_credits)
      const storedAvailable = Number(user.available_credits)
      const diffTotal = Math.abs(storedTotal - stats.calculated_total_credits)
      const diffAvailable = Math.abs(storedAvailable - stats.calculated_available_credits)
      
      if (diffTotal > 0.01 || diffAvailable > 0.01) {
        discrepancies.push({
          user_identifier: user.user_identifier,
          display_name: user.display_name,
          stored_total_credits: storedTotal,
          stored_available_credits: storedAvailable,
          calculated_total_credits: stats.calculated_total_credits,
          calculated_available_credits: stats.calculated_available_credits,
          difference_total: Math.round(diffTotal * 100) / 100,
          difference_available: Math.round(diffAvailable * 100) / 100
        })
      }
    }
    
    console.log(`[RECALCULATE] Found ${discrepancies.length} users with discrepancies out of ${users.length}`)
    
    return NextResponse.json({
      total_users: users.length,
      discrepancies_found: discrepancies.length,
      discrepancies,
      all_users: userStats.sort((a, b) => b.calculated_total_credits - a.calculated_total_credits)
    })
    
  } catch (error) {
    console.error('[RECALCULATE] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to check credits' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/Rate-Chart/market/recalculate
 * Recalculate and fix all user credits
 */
export async function POST() {
  try {
    console.log('[RECALCULATE] 🔧 Starting market credits recalculation...')
    
    const supabase = await createClient()
    
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('market_user_credits')
      .select('*')
    
    if (usersError) {
      console.error('[RECALCULATE] Error fetching users:', usersError)
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }
    
    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users to recalculate', fixed: 0 })
    }
    
    // Get all bets
    const { data: allBets } = await supabase
      .from('market_bets')
      .select('*')
      .order('created_at', { ascending: true })
    
    // Get all transactions (for bonuses)
    const { data: allTransactions } = await supabase
      .from('market_credit_transactions')
      .select('*')
      .order('created_at', { ascending: true })
    
    let fixedCount = 0
    const fixedUsers: {
      user_identifier: string
      display_name: string | null
      old_total: number
      old_available: number
      new_total: number
      new_available: number
    }[] = []
    
    for (const user of users) {
      const userBets = (allBets || []).filter(b => b.user_identifier === user.user_identifier)
      const userTxns = (allTransactions || []).filter(t => t.user_identifier === user.user_identifier)
      
      // Start with initial credits (1000)
      let totalCredits = 1000
      let totalBetsPlaced = 0
      let totalBetsWon = 0
      let totalCreditsWon = 0
      let totalCreditsLost = 0
      let bestWin = 0
      let currentStreak = 0
      let bestStreak = 0
      
      // Add ONLY claimed daily bonuses (from transactions table)
      const claimedBonuses = userTxns.filter(t => t.transaction_type === 'daily_bonus')
      for (const bonus of claimedBonuses) {
        totalCredits += Number(bonus.amount)
      }
      
      // Sort bets by date for streak calculation
      const sortedBets = [...userBets].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      
      // Process all resolved bets
      for (const bet of sortedBets) {
        const betAmount = Number(bet.bet_amount)
        totalBetsPlaced++
        
        if (bet.status === 'won') {
          const payout = Number(bet.actual_payout) || Number(bet.potential_payout)
          const profit = payout - betAmount
          
          totalCredits += profit // Net gain
          totalCreditsWon += payout
          totalBetsWon++
          
          if (profit > bestWin) bestWin = profit
          
          currentStreak++
          if (currentStreak > bestStreak) bestStreak = currentStreak
          
        } else if (bet.status === 'lost') {
          totalCredits -= betAmount // Lost the bet amount
          totalCreditsLost += betAmount
          currentStreak = 0
        }
        // Active bets don't affect total_credits yet, only available_credits
      }
      
      // Calculate available credits = total - locked in active bets
      const activeBets = userBets.filter(b => b.status === 'active')
      const lockedInBets = activeBets.reduce((sum, b) => sum + Number(b.bet_amount), 0)
      let availableCredits = totalCredits - lockedInBets
      
      // Round to 2 decimal places
      totalCredits = Math.round(totalCredits * 100) / 100
      availableCredits = Math.round(availableCredits * 100) / 100
      totalCreditsWon = Math.round(totalCreditsWon * 100) / 100
      totalCreditsLost = Math.round(totalCreditsLost * 100) / 100
      bestWin = Math.round(bestWin * 100) / 100
      
      // Check if update needed
      const storedTotal = Number(user.total_credits)
      const storedAvailable = Number(user.available_credits)
      
      if (
        Math.abs(storedTotal - totalCredits) > 0.01 ||
        Math.abs(storedAvailable - availableCredits) > 0.01 ||
        user.total_bets_placed !== totalBetsPlaced ||
        user.total_bets_won !== totalBetsWon
      ) {
        // Update user
        const { error: updateError } = await supabase
          .from('market_user_credits')
          .update({
            total_credits: totalCredits,
            available_credits: availableCredits,
            total_bets_placed: totalBetsPlaced,
            total_bets_won: totalBetsWon,
            total_credits_won: totalCreditsWon,
            total_credits_lost: totalCreditsLost,
            best_win: bestWin,
            current_streak: currentStreak,
            best_streak: bestStreak,
            updated_at: new Date().toISOString()
          })
          .eq('user_identifier', user.user_identifier)
        
        if (updateError) {
          console.error(`[RECALCULATE] Error updating ${user.user_identifier}:`, updateError)
        } else {
          fixedCount++
          fixedUsers.push({
            user_identifier: user.user_identifier,
            display_name: user.display_name,
            old_total: storedTotal,
            old_available: storedAvailable,
            new_total: totalCredits,
            new_available: availableCredits
          })
          console.log(`[RECALCULATE] ✅ Fixed ${user.display_name || user.user_identifier}: ${storedTotal} → ${totalCredits}`)
        }
      }
    }
    
    // Get updated leaderboard
    const { data: leaderboard } = await supabase
      .from('market_user_credits')
      .select('user_identifier, display_name, total_credits, total_bets_won, best_streak')
      .order('total_credits', { ascending: false })
      .limit(10)
    
    console.log(`[RECALCULATE] 🎉 Completed! Fixed ${fixedCount} users`)
    
    return NextResponse.json({
      success: true,
      message: `Recalculated credits for ${users.length} users, fixed ${fixedCount}`,
      total_users: users.length,
      fixed_count: fixedCount,
      fixed_users: fixedUsers,
      updated_leaderboard: leaderboard
    })
    
  } catch (error) {
    console.error('[RECALCULATE] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to recalculate credits' },
      { status: 500 }
    )
  }
}

