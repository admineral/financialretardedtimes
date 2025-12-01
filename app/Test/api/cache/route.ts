import { NextRequest, NextResponse } from 'next/server'
import { 
  getCacheStats, 
  clearExpiredCache, 
  clearUserCache, 
  getAllCachedPages 
} from '../../lib/cache'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// GET /Test/api/cache - Get cache statistics
// GET /Test/api/cache?username=xxx - Get cached pages for user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')

    if (username) {
      // Get cached pages for specific user
      const cachedPages = await getAllCachedPages(username)
      
      return NextResponse.json({
        username,
        cachedPages,
        totalPages: cachedPages.length
      }, { headers: corsHeaders })
    } else {
      // Get overall cache statistics
      const stats = await getCacheStats()
      
      return NextResponse.json({
        ...stats,
        cacheExpiration: '24 hours',
        oldestEntryAge: stats.oldestEntry ? Math.round((Date.now() - stats.oldestEntry) / 1000 / 60) : null, // minutes
        newestEntryAge: stats.newestEntry ? Math.round((Date.now() - stats.newestEntry) / 1000 / 60) : null // minutes
      }, { headers: corsHeaders })
    }
  } catch (error) {
    console.error('Cache API GET error:', error)
    return NextResponse.json(
      { error: 'Failed to get cache information', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// DELETE /Test/api/cache - Clear expired cache
// DELETE /Test/api/cache?username=xxx - Clear cache for specific user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')

    if (username) {
      // Clear cache for specific user
      await clearUserCache(username)
      
      return NextResponse.json({
        message: `Cache cleared for user: ${username}`,
        username
      }, { headers: corsHeaders })
    } else {
      // Clear expired cache entries
      await clearExpiredCache()
      
      return NextResponse.json({
        message: 'Expired cache entries cleared'
      }, { headers: corsHeaders })
    }
  } catch (error) {
    console.error('Cache API DELETE error:', error)
    return NextResponse.json(
      { error: 'Failed to clear cache', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
