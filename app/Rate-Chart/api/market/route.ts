/**
 * Prediction Market API
 * 
 * GET: Fetch market data (pools, odds, user bets)
 * POST: Place a new bet
 * PUT: Resolve bets for a completed game
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Generate a fun random default nickname
function generateRandomNickname(): string {
  const adjectives = [
    'Lucky', 'Swift', 'Bold', 'Wise', 'Crypto', 'Diamond', 'Golden', 'Silver',
    'Mighty', 'Clever', 'Epic', 'Cosmic', 'Lunar', 'Solar', 'Thunder', 'Storm',
    'Shadow', 'Frost', 'Fire', 'Ice', 'Mega', 'Ultra', 'Super', 'Hyper',
    'Neon', 'Pixel', 'Cyber', 'Turbo', 'Alpha', 'Beta', 'Omega', 'Delta'
  ]
  
  const nouns = [
    'Trader', 'Whale', 'Shark', 'Bull', 'Bear', 'Wolf', 'Eagle', 'Hawk',
    'Tiger', 'Lion', 'Dragon', 'Phoenix', 'Knight', 'Wizard', 'Ninja', 'Samurai',
    'Hodler', 'Stacker', 'Degen', 'Ape', 'Chad', 'Guru', 'Master', 'Legend',
    'Rider', 'Hunter', 'Seeker', 'Runner', 'Chaser', 'Surfer', 'Voyager', 'Pioneer'
  ]
  
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const number = Math.floor(Math.random() * 100)
  
  return `${adjective}${noun}${number}`
}

// Calculate odds based on pool distribution
function calculateOdds(targetPool: number, totalPool: number, participantCount: number): number {
  if (totalPool === 0 || targetPool === 0) {
    // Default odds based on participant count (assuming equal chance)
    return Math.max(1.5, Math.min(10, participantCount * 0.3 + 1.2))
  }
  
  // Parimutuel-style odds with 5% house edge
  const houseEdge = 0.05
  const netPool = totalPool * (1 - houseEdge)
  const rawOdds = netPool / targetPool
  
  // Cap odds between 1.1 and 50
  return Math.max(1.1, Math.min(50, Math.round(rawOdds * 100) / 100))
}

// Calculate implied probability
function calculateImpliedProbability(odds: number): number {
  return Math.round((1 / odds) * 10000) / 10000
}

/**
 * GET /api/Rate-Chart/market
 * Fetch market data for current game day
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const userId = searchParams.get('userId')
    
    if (!date) {
      return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 })
    }
    
    console.log(`[MARKET] Fetching market data for ${date}`)
    
    const supabase = await createClient()
    
    // Fetch pools for the date
    const { data: pools, error: poolsError } = await supabase
      .from('market_pools')
      .select('*')
      .eq('game_date', date)
      .order('total_pool_amount', { ascending: false })
    
    if (poolsError && poolsError.code !== 'PGRST116') {
      console.error('[MARKET] Error fetching pools:', poolsError)
      return NextResponse.json({ error: poolsError.message }, { status: 500 })
    }
    
    // Fetch daily summary
    const { data: summary } = await supabase
      .from('market_daily_summary')
      .select('*')
      .eq('game_date', date)
      .single()
    
    // Fetch user's credits and bets if userId provided
    let userCredits = null
    let userBets: { id: string; target_username: string; bet_type: string; bet_amount: number; odds: number; potential_payout: number; status: string }[] = []
    
    if (userId) {
      // Get or create user credits
      const { data: credits, error: creditsError } = await supabase
        .from('market_user_credits')
        .select('*')
        .eq('user_identifier', userId)
        .single()
      
      if (creditsError && creditsError.code === 'PGRST116') {
        // User doesn't exist, create new account with starting credits and random nickname
        const randomNickname = generateRandomNickname()
        console.log(`[MARKET] Creating new user ${userId} with nickname: ${randomNickname}`)
        
        const { data: newUser, error: createError } = await supabase
          .from('market_user_credits')
          .insert({
            user_identifier: userId,
            display_name: randomNickname,
            total_credits: 1000,
            available_credits: 1000
          })
          .select()
          .single()
        
        if (createError) {
          console.error('[MARKET] Error creating user:', createError)
        } else {
          userCredits = newUser
          
          // Record initial credits transaction
          await supabase
            .from('market_credit_transactions')
            .insert({
              user_identifier: userId,
              transaction_type: 'initial_credits',
              amount: 1000,
              balance_after: 1000,
              description: 'Welcome bonus - 1000 credits!'
            })
        }
      } else if (!creditsError) {
        userCredits = credits
      }
      
      // Get user's bets for this date
      const { data: bets } = await supabase
        .from('market_bets')
        .select('id, target_username, bet_type, bet_amount, odds, potential_payout, status')
        .eq('user_identifier', userId)
        .eq('game_date', date)
      
      userBets = bets || []
    }
    
    // Fetch top bettors leaderboard with full stats
    const { data: topBettors } = await supabase
      .from('market_user_credits')
      .select('user_identifier, display_name, total_credits, total_bets_placed, total_bets_won, best_streak, current_streak')
      .order('total_credits', { ascending: false })
      .limit(10)
    
    return NextResponse.json({
      pools: pools || [],
      summary: summary || null,
      userCredits,
      userBets,
      topBettors: topBettors || [],
      isResolved: summary?.is_resolved || false,
      lastUpdated: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[MARKET] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch market data' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/Rate-Chart/market
 * Place a new bet
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      userId, 
      gameDate, 
      targetUsername, 
      targetAvatar,
      betType = 'win', 
      betAmount,
      latestPrediction,
      predictionTimestamp
    } = body
    
    // Validate required fields
    if (!userId || !gameDate || !targetUsername || !betAmount) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, gameDate, targetUsername, betAmount' },
        { status: 400 }
      )
    }
    
    if (betAmount < 1) {
      return NextResponse.json(
        { error: 'Minimum bet amount is 1 credit' },
        { status: 400 }
      )
    }
    
    console.log(`[MARKET] 💰 Placing bet: ${userId} → ${targetUsername} (${betAmount} credits, ${betType})`)
    
    const supabase = await createClient()
    
    // Check if game is still open for betting (before 23:00 Vienna time)
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Vienna',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false
    })
    const parts = formatter.formatToParts(now)
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || ''
    const currentHour = parseInt(getPart('hour'))
    const todayVienna = `${getPart('year')}-${getPart('month')}-${getPart('day')}`
    
    // Can only bet on today's game before 23:00
    if (gameDate === todayVienna && currentHour >= 23) {
      return NextResponse.json(
        { error: 'Betting is closed after 23:00 Vienna time' },
        { status: 400 }
      )
    }
    
    // Get user's credits
    const { data: userCredits, error: userError } = await supabase
      .from('market_user_credits')
      .select('available_credits')
      .eq('user_identifier', userId)
      .single()
    
    if (userError || !userCredits) {
      // Create user if doesn't exist
      const { error: createError } = await supabase
        .from('market_user_credits')
        .insert({
          user_identifier: userId,
          total_credits: 1000,
          available_credits: 1000
        })
      
      if (createError) {
        return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 })
      }
      
      // Retry getting credits
      const { data: newCredits } = await supabase
        .from('market_user_credits')
        .select('available_credits')
        .eq('user_identifier', userId)
        .single()
      
      if (!newCredits || newCredits.available_credits < betAmount) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
      }
    } else if (userCredits.available_credits < betAmount) {
      return NextResponse.json(
        { error: `Insufficient credits. You have ${userCredits.available_credits} credits.` },
        { status: 400 }
      )
    }
    
    // Check for existing bet on same target
    const { data: existingBet } = await supabase
      .from('market_bets')
      .select('id, bet_amount')
      .eq('user_identifier', userId)
      .eq('game_date', gameDate)
      .eq('target_username', targetUsername)
      .eq('bet_type', betType)
      .single()
    
    if (existingBet) {
      return NextResponse.json(
        { error: `You already have a ${betType} bet on ${targetUsername} for this date` },
        { status: 400 }
      )
    }
    
    // Get current pool data to calculate odds
    const { data: poolData } = await supabase
      .from('market_pools')
      .select('total_pool_amount')
      .eq('game_date', gameDate)
    
    const totalPool = (poolData || []).reduce((sum, p) => sum + Number(p.total_pool_amount), 0) + betAmount
    const targetPool = (poolData?.find(p => p.total_pool_amount)?.total_pool_amount || 0) + betAmount
    
    // Get approximate participant count for better odds calculation
    const participantCount = (poolData?.length || 0) + 1
    const odds = calculateOdds(Number(targetPool), totalPool, participantCount)
    const potentialPayout = Math.round(betAmount * odds * 100) / 100
    
    // Update pool with target info
    const { error: poolError } = await supabase
      .from('market_pools')
      .upsert({
        game_date: gameDate,
        target_username: targetUsername,
        target_avatar: targetAvatar,
        latest_prediction: latestPrediction,
        prediction_timestamp: predictionTimestamp,
        current_odds: odds,
        implied_probability: calculateImpliedProbability(odds),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'game_date,target_username'
      })
    
    if (poolError) {
      console.error('[MARKET] Pool upsert error:', poolError)
    }
    
    // Place the bet (triggers will handle credit deduction)
    const { data: bet, error: betError } = await supabase
      .from('market_bets')
      .insert({
        user_identifier: userId,
        game_date: gameDate,
        target_username: targetUsername,
        bet_type: betType,
        bet_amount: betAmount,
        odds,
        potential_payout: potentialPayout,
        status: 'active'
      })
      .select()
      .single()
    
    if (betError) {
      console.error('[MARKET] Error placing bet:', betError)
      return NextResponse.json({ error: betError.message }, { status: 500 })
    }
    
    // Update daily summary
    await supabase
      .from('market_daily_summary')
      .upsert({
        game_date: gameDate,
        total_pool_amount: totalPool,
        total_bets_count: (poolData?.length || 0) + 1
      }, {
        onConflict: 'game_date'
      })
    
    // Get updated user credits
    const { data: updatedCredits } = await supabase
      .from('market_user_credits')
      .select('available_credits, total_credits')
      .eq('user_identifier', userId)
      .single()
    
    console.log(`[MARKET] ✅ Bet placed successfully: ${bet.id}`)
    
    return NextResponse.json({
      success: true,
      bet,
      odds,
      potentialPayout,
      userCredits: updatedCredits
    })
    
  } catch (error) {
    console.error('[MARKET] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to place bet' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/Rate-Chart/market
 * Resolve bets for a completed game day
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      gameDate, 
      winnerUsername, 
      secondUsername, 
      thirdUsername 
    } = body
    
    if (!gameDate || !winnerUsername) {
      return NextResponse.json(
        { error: 'Missing required fields: gameDate, winnerUsername' },
        { status: 400 }
      )
    }
    
    console.log(`[MARKET] 🏆 Resolving bets for ${gameDate}`)
    console.log(`[MARKET]    Winner: ${winnerUsername}`)
    console.log(`[MARKET]    2nd: ${secondUsername || 'N/A'}`)
    console.log(`[MARKET]    3rd: ${thirdUsername || 'N/A'}`)
    
    const supabase = await createClient()
    
    // Check if already resolved
    const { data: existing } = await supabase
      .from('market_daily_summary')
      .select('is_resolved')
      .eq('game_date', gameDate)
      .single()
    
    if (existing?.is_resolved) {
      return NextResponse.json(
        { message: 'Bets already resolved for this date', alreadyResolved: true },
        { status: 200 }
      )
    }
    
    // Get all active bets for this date
    const { data: activeBets, error: betsError } = await supabase
      .from('market_bets')
      .select('*')
      .eq('game_date', gameDate)
      .eq('status', 'active')
    
    if (betsError) {
      return NextResponse.json({ error: betsError.message }, { status: 500 })
    }
    
    if (!activeBets || activeBets.length === 0) {
      console.log(`[MARKET] No active bets to resolve for ${gameDate}`)
      return NextResponse.json({ message: 'No active bets to resolve', resolved: 0 })
    }
    
    let totalPayouts = 0
    let resolvedCount = 0
    
    // Process each bet
    for (const bet of activeBets) {
      let isWinner = false
      let finalPosition: number | null = null
      let actualPayout = 0
      
      switch (bet.bet_type) {
        case 'win':
          isWinner = bet.target_username === winnerUsername
          finalPosition = isWinner ? 1 : 
            (bet.target_username === secondUsername ? 2 : 
              (bet.target_username === thirdUsername ? 3 : null))
          break
          
        case 'top3':
          isWinner = [winnerUsername, secondUsername, thirdUsername].includes(bet.target_username)
          finalPosition = bet.target_username === winnerUsername ? 1 :
            (bet.target_username === secondUsername ? 2 :
              (bet.target_username === thirdUsername ? 3 : null))
          break
      }
      
      if (isWinner) {
        actualPayout = bet.potential_payout
        totalPayouts += actualPayout
      }
      
      // Update bet status
      const { error: updateError } = await supabase
        .from('market_bets')
        .update({
          status: isWinner ? 'won' : 'lost',
          actual_payout: actualPayout,
          final_position: finalPosition,
          resolved_at: new Date().toISOString()
        })
        .eq('id', bet.id)
      
      if (updateError) {
        console.error(`[MARKET] Error updating bet ${bet.id}:`, updateError)
      } else {
        resolvedCount++
        console.log(`[MARKET] ${isWinner ? '✅' : '❌'} Bet ${bet.id}: ${bet.target_username} → ${isWinner ? 'WON' : 'LOST'}`)
      }
    }
    
    // Update pools with final positions
    await supabase
      .from('market_pools')
      .update({ final_position: 1, is_resolved: true })
      .eq('game_date', gameDate)
      .eq('target_username', winnerUsername)
    
    if (secondUsername) {
      await supabase
        .from('market_pools')
        .update({ final_position: 2, is_resolved: true })
        .eq('game_date', gameDate)
        .eq('target_username', secondUsername)
    }
    
    if (thirdUsername) {
      await supabase
        .from('market_pools')
        .update({ final_position: 3, is_resolved: true })
        .eq('game_date', gameDate)
        .eq('target_username', thirdUsername)
    }
    
    // Mark remaining pools as resolved (losers)
    await supabase
      .from('market_pools')
      .update({ is_resolved: true })
      .eq('game_date', gameDate)
      .is('final_position', null)
    
    // Calculate house profit
    const { data: poolData } = await supabase
      .from('market_pools')
      .select('total_pool_amount')
      .eq('game_date', gameDate)
    
    const totalPool = (poolData || []).reduce((sum, p) => sum + Number(p.total_pool_amount), 0)
    const houseProfit = totalPool - totalPayouts
    
    // Update daily summary
    await supabase
      .from('market_daily_summary')
      .upsert({
        game_date: gameDate,
        winning_username: winnerUsername,
        second_place_username: secondUsername,
        third_place_username: thirdUsername,
        total_payouts: totalPayouts,
        house_profit: houseProfit,
        is_resolved: true,
        resolved_at: new Date().toISOString()
      }, {
        onConflict: 'game_date'
      })
    
    console.log(`[MARKET] ✅ Resolved ${resolvedCount} bets, total payouts: ${totalPayouts}`)
    
    return NextResponse.json({
      success: true,
      resolved: resolvedCount,
      totalPayouts,
      houseProfit
    })
    
  } catch (error) {
    console.error('[MARKET] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to resolve bets' },
      { status: 500 }
    )
  }
}

