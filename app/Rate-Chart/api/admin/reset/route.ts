/**
 * Admin API - Reset Prediction Market Data
 * 
 * POST: Clear all bets, users, and transaction history
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Simple auth check - require a confirmation in the body
    const body = await request.json()
    
    if (body.confirm !== 'RESET_ALL_DATA') {
      return NextResponse.json(
        { error: 'Must send { confirm: "RESET_ALL_DATA" } to confirm' },
        { status: 400 }
      )
    }
    
    console.log('[ADMIN] 🗑️ Resetting all prediction market data...')
    
    const supabase = await createClient()
    
    // Delete in order due to foreign key constraints
    const tables = [
      'market_credit_transactions',
      'market_bets', 
      'market_pools',
      'market_daily_summary',
      'market_user_credits'
    ]
    
    const results: { table: string; deleted: number; error?: string }[] = []
    
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (workaround for "delete all" in Supabase)
      
      if (error) {
        console.error(`[ADMIN] Error deleting from ${table}:`, error)
        results.push({ table, deleted: 0, error: error.message })
      } else {
        console.log(`[ADMIN] ✅ Cleared ${table}`)
        results.push({ table, deleted: -1 }) // -1 = unknown count, but success
      }
    }
    
    console.log('[ADMIN] ✅ Reset complete')
    
    return NextResponse.json({
      success: true,
      message: 'All prediction market data has been reset',
      results
    })
    
  } catch (error) {
    console.error('[ADMIN] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to reset data' },
      { status: 500 }
    )
  }
}

