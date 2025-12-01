import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Allowed tables for safety
const ALLOWED_TABLES = [
  'tv_chat_messages',
  'tv_chat_sync_status', 
  'tv_user_profiles',
  'tv_user_activity_daily'
]

// Blocked keywords for safety
const BLOCKED_KEYWORDS = [
  'DROP',
  'DELETE',
  'TRUNCATE',
  'UPDATE',
  'INSERT',
  'ALTER',
  'CREATE',
  'GRANT',
  'REVOKE',
  'EXECUTE',
  'CALL'
]

function validateQuery(query: string): { valid: boolean; error?: string } {
  const upperQuery = query.toUpperCase().trim()
  
  // Must start with SELECT
  if (!upperQuery.startsWith('SELECT')) {
    return { valid: false, error: 'Only SELECT queries are allowed' }
  }
  
  // Check for blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (upperQuery.includes(keyword)) {
      return { valid: false, error: `Blocked keyword detected: ${keyword}` }
    }
  }
  
  // Check that query references only allowed tables
  const hasAllowedTable = ALLOWED_TABLES.some(table => 
    upperQuery.includes(table.toUpperCase())
  )
  
  if (!hasAllowedTable) {
    return { valid: false, error: `Query must reference one of: ${ALLOWED_TABLES.join(', ')}` }
  }
  
  return { valid: true }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const body = await request.json()
    const { query } = body
    
    if (!query || typeof query !== 'string') {
      return NextResponse.json({
        data: null,
        error: 'Query is required',
        rowCount: 0,
        executionTime: Date.now() - startTime
      }, { status: 400 })
    }
    
    // Validate query
    const validation = validateQuery(query)
    if (!validation.valid) {
      return NextResponse.json({
        data: null,
        error: validation.error,
        rowCount: 0,
        executionTime: Date.now() - startTime
      }, { status: 400 })
    }
    
    const supabase = await createClient()
    
    // Execute query using Supabase's rpc or direct table access
    // Since Supabase doesn't support raw SQL directly, we need to parse the query
    // For now, let's use a simplified approach with the REST API
    
    // Parse the query to determine which table and what to select
    const queryLower = query.toLowerCase()
    
    let result: { data: unknown[] | null; error: unknown }
    
    // Handle common query patterns
    if (queryLower.includes('tv_chat_messages')) {
      // Extract limit if present
      const limitMatch = query.match(/LIMIT\s+(\d+)/i)
      const limit = limitMatch ? parseInt(limitMatch[1]) : 100
      
      // Check for ORDER BY
      const hasOrderDesc = queryLower.includes('order by') && queryLower.includes('desc')
      
      // Check for GROUP BY (aggregation)
      if (queryLower.includes('group by')) {
        // For aggregation queries, we need to fetch all and aggregate in JS
        const { data: allData, error } = await supabase
          .from('tv_chat_messages')
          .select('*')
        
        if (error) throw error
        
        // Simple aggregation for username count
        if (queryLower.includes('count(*)') && queryLower.includes('group by username')) {
          const counts = new Map<string, number>()
          for (const row of allData || []) {
            counts.set(row.username, (counts.get(row.username) || 0) + 1)
          }
          const aggregated = Array.from(counts.entries())
            .map(([username, msg_count]) => ({ username, msg_count }))
            .sort((a, b) => b.msg_count - a.msg_count)
            .slice(0, limit)
          
          result = { data: aggregated, error: null }
        } else {
          result = { data: allData?.slice(0, limit) || [], error: null }
        }
      } else {
        // Simple select
        let queryBuilder = supabase.from('tv_chat_messages').select('*')
        
        if (hasOrderDesc) {
          queryBuilder = queryBuilder.order('time', { ascending: false })
        }
        
        queryBuilder = queryBuilder.limit(Math.min(limit, 500))
        
        result = await queryBuilder
      }
    } else if (queryLower.includes('tv_user_profiles')) {
      const limitMatch = query.match(/LIMIT\s+(\d+)/i)
      const limit = limitMatch ? parseInt(limitMatch[1]) : 100
      
      result = await supabase
        .from('tv_user_profiles')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(Math.min(limit, 500))
    } else if (queryLower.includes('tv_chat_sync_status')) {
      result = await supabase
        .from('tv_chat_sync_status')
        .select('*')
    } else if (queryLower.includes('tv_user_activity_daily')) {
      const limitMatch = query.match(/LIMIT\s+(\d+)/i)
      const limit = limitMatch ? parseInt(limitMatch[1]) : 100
      
      result = await supabase
        .from('tv_user_activity_daily')
        .select('*')
        .order('date', { ascending: false })
        .limit(Math.min(limit, 500))
    } else {
      return NextResponse.json({
        data: null,
        error: 'Could not parse query. Please use one of the preset queries.',
        rowCount: 0,
        executionTime: Date.now() - startTime
      }, { status: 400 })
    }
    
    if (result.error) {
      throw result.error
    }
    
    const data = result.data as Record<string, unknown>[] || []
    
    return NextResponse.json({
      data,
      error: null,
      rowCount: data.length,
      executionTime: Date.now() - startTime
    })
    
  } catch (error) {
    console.error('[QUERY API] Error:', error)
    return NextResponse.json({
      data: null,
      error: error instanceof Error ? error.message : 'Query execution failed',
      rowCount: 0,
      executionTime: Date.now() - startTime
    }, { status: 500 })
  }
}

