/**
 * OpenClaw Today - Commits API
 * 
 * GET endpoint to fetch commits from cache or GitHub.
 * Uses Supabase cache for efficiency, falls back to GitHub API.
 */

import { NextRequest,NextResponse } from 'next/server'
import {
calculateStatsFromCache,
getCachedCommits,
getDailyStats,
getSettings,
initializeCache
} from '../../actions/cache'
import { calculateStats,fetchCommits } from '../../actions/github'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const count = parseInt(searchParams.get('count') || '50', 10)
    const days = parseInt(searchParams.get('days') || '7', 10)
    const useCache = searchParams.get('cache') !== 'false'
    const startDate = searchParams.get('start') || undefined
    const endDate = searchParams.get('end') || undefined
    
    if (useCache) {
      const dailyStats = await getDailyStats(days)
      
      if (dailyStats.length === 0) {
        const settings = await getSettings()
        await initializeCache(settings.defaultDays)
      }
      
      const cachedCommits = await getCachedCommits({
        days,
        startDate,
        endDate,
        limit: count,
      })
      
      if (cachedCommits.length > 0) {
        const stats = await calculateStatsFromCache(cachedCommits)
        const updatedDailyStats = await getDailyStats(days)
        
        return NextResponse.json({
          commits: cachedCommits,
          stats,
          dailyStats: updatedDailyStats,
          count: cachedCommits.length,
          source: 'cache',
        }, { headers: corsHeaders })
      }
    }
    
    const commits = await fetchCommits(count)
    const stats = await calculateStats(commits)
    
    return NextResponse.json({
      commits,
      stats,
      count: commits.length,
      source: 'github',
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('[OPENCLAW API] Error fetching commits:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
