/**
 * Market Credits API
 * 
 * GET: Fetch user credits, transaction history, and stats
 * POST: Claim daily bonus or other credit operations
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

/**
 * GET /api/Rate-Chart/market/credits
 * Fetch user credits and transaction history
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const includeHistory = searchParams.get('history') === 'true'
    const historyLimit = parseInt(searchParams.get('historyLimit') || '20')
    
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 })
    }
    
    console.log(`[MARKET-CREDITS] Fetching credits for ${userId}`)
    
    const supabase = await createClient()
    
    // Get user credits
    let { data: credits, error } = await supabase
      .from('market_user_credits')
      .select('*')
      .eq('user_identifier', userId)
      .single()
    
    if (error && error.code === 'PGRST116') {
      // User doesn't exist, create new account with random nickname
      const randomNickname = generateRandomNickname()
      console.log(`[MARKET-CREDITS] Creating new user ${userId} with nickname: ${randomNickname}`)
      
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
        console.error('[MARKET-CREDITS] Error creating user:', createError)
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
      }
      
      credits = newUser
      
      // Record initial credits transaction
      const { error: txnError } = await supabase
        .from('market_credit_transactions')
        .insert({
          user_identifier: userId,
          transaction_type: 'initial_credits',
          amount: 1000,
          balance_after: 1000,
          description: 'Welcome bonus - 1000 credits!'
        })
      
      if (txnError) {
        console.error('[MARKET-CREDITS] Error recording initial transaction:', txnError)
        // Don't fail the request - user was created, transaction can be repaired
      } else {
        console.log(`[MARKET-CREDITS] ✅ New user created with 1000 credits: ${userId}`)
      }
    } else if (error) {
      console.error('[MARKET-CREDITS] Error fetching credits:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (credits) {
      // User exists - check if they have an initial_credits transaction (repair mechanism)
      const { data: initialTxn } = await supabase
        .from('market_credit_transactions')
        .select('id')
        .eq('user_identifier', userId)
        .eq('transaction_type', 'initial_credits')
        .limit(1)
        .single()
      
      if (!initialTxn) {
        // Missing initial credits transaction - create it now (repair)
        console.log(`[MARKET-CREDITS] Repairing missing initial transaction for ${userId}`)
        const { error: repairError } = await supabase
          .from('market_credit_transactions')
          .insert({
            user_identifier: userId,
            transaction_type: 'initial_credits',
            amount: 1000,
            balance_after: 1000,
            description: 'Welcome bonus - 1000 credits!',
            created_at: credits.created_at // Use user creation date
          })
        
        if (repairError) {
          console.error('[MARKET-CREDITS] Error repairing initial transaction:', repairError)
        } else {
          console.log(`[MARKET-CREDITS] ✅ Repaired initial transaction for ${userId}`)
        }
      }
    }
    
    // Fetch transaction history if requested
    let history = null
    if (includeHistory) {
      const { data: transactions } = await supabase
        .from('market_credit_transactions')
        .select('*')
        .eq('user_identifier', userId)
        .order('created_at', { ascending: false })
        .limit(historyLimit)
      
      history = transactions
    }
    
    // Fetch active bets
    const { data: activeBets } = await supabase
      .from('market_bets')
      .select('*')
      .eq('user_identifier', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    
    // Fetch recent resolved bets
    const { data: recentBets } = await supabase
      .from('market_bets')
      .select('*')
      .eq('user_identifier', userId)
      .in('status', ['won', 'lost'])
      .order('resolved_at', { ascending: false })
      .limit(10)
    
    // Calculate additional stats
    const winRate = credits.total_bets_placed > 0 
      ? Math.round((credits.total_bets_won / credits.total_bets_placed) * 100) 
      : 0
    
    const netProfit = credits.total_credits_won - credits.total_credits_lost
    
    return NextResponse.json({
      credits,
      stats: {
        winRate,
        netProfit,
        totalBets: credits.total_bets_placed,
        totalWins: credits.total_bets_won
      },
      activeBets: activeBets || [],
      recentBets: recentBets || [],
      history
    })
    
  } catch (error) {
    console.error('[MARKET-CREDITS] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch credits' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/Rate-Chart/market/credits
 * Claim daily bonus or perform credit operations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, action, displayName } = body
    
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }
    
    const supabase = await createClient()
    
    switch (action) {
      case 'daily_bonus': {
        // Check if user already claimed today
        const now = new Date()
        const todayStart = new Date(now)
        todayStart.setHours(0, 0, 0, 0)
        
        const { data: existingBonus } = await supabase
          .from('market_credit_transactions')
          .select('id')
          .eq('user_identifier', userId)
          .eq('transaction_type', 'daily_bonus')
          .gte('created_at', todayStart.toISOString())
          .single()
        
        if (existingBonus) {
          return NextResponse.json(
            { error: 'Daily bonus already claimed today', alreadyClaimed: true },
            { status: 400 }
          )
        }
        
        const bonusAmount = 100
        
        // Add bonus credits
        const { data: updatedCredits, error: updateError } = await supabase
          .from('market_user_credits')
          .update({
            available_credits: supabase.rpc('increment_credits', { amount: bonusAmount }),
            total_credits: supabase.rpc('increment_credits', { amount: bonusAmount }),
            updated_at: new Date().toISOString()
          })
          .eq('user_identifier', userId)
          .select()
          .single()
        
        // Fallback: direct update if rpc doesn't work
        if (updateError) {
          const { data: currentUser } = await supabase
            .from('market_user_credits')
            .select('available_credits, total_credits')
            .eq('user_identifier', userId)
            .single()
          
          if (currentUser) {
            await supabase
              .from('market_user_credits')
              .update({
                available_credits: currentUser.available_credits + bonusAmount,
                total_credits: currentUser.total_credits + bonusAmount,
                updated_at: new Date().toISOString()
              })
              .eq('user_identifier', userId)
          }
        }
        
        // Get final balance
        const { data: finalCredits } = await supabase
          .from('market_user_credits')
          .select('available_credits, total_credits')
          .eq('user_identifier', userId)
          .single()
        
        // Record transaction
        await supabase
          .from('market_credit_transactions')
          .insert({
            user_identifier: userId,
            transaction_type: 'daily_bonus',
            amount: bonusAmount,
            balance_after: finalCredits?.available_credits || 0,
            description: 'Daily bonus claimed!'
          })
        
        console.log(`[MARKET-CREDITS] ✅ Daily bonus claimed by ${userId}: +${bonusAmount} credits`)
        
        return NextResponse.json({
          success: true,
          bonusAmount,
          newBalance: finalCredits?.available_credits
        })
      }
      
      case 'set_display_name': {
        if (!displayName || displayName.length < 2 || displayName.length > 30) {
          return NextResponse.json(
            { error: 'Display name must be 2-30 characters' },
            { status: 400 }
          )
        }
        
        const { error: updateError } = await supabase
          .from('market_user_credits')
          .update({
            display_name: displayName,
            updated_at: new Date().toISOString()
          })
          .eq('user_identifier', userId)
        
        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 })
        }
        
        console.log(`[MARKET-CREDITS] ✅ Display name set for ${userId}: ${displayName}`)
        
        return NextResponse.json({ success: true, displayName })
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    
  } catch (error) {
    console.error('[MARKET-CREDITS] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

