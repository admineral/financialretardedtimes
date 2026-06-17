/**
 * route.ts (Chat Activity API)
 * 
 * Returns message activity data grouped by time intervals.
 * Used for the activity heatmap/bar chart visualization.
 * 
 * ENDPOINT: GET /test-timeline/api/activity
 * 
 * QUERY PARAMS:
 * - mode: '24h' | '3d' | '7d' - Time range (default: '24h')
 * - interval: 'hour' | '30min' | '15min' - Grouping interval (default varies by mode)
 * 
 * RESPONSE: { buckets: ActivityBucket[], stats: ActivityStats }
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

interface ActivityBucket {
  timestamp: string       // ISO timestamp for bucket start
  label: string           // Display label (e.g., "14:00" or "Mo 14:00")
  count: number           // Message count
  uniqueUsers: number     // Unique users in this bucket
  intensity: number       // 0-1 normalized intensity for heatmap
}

interface ActivityStats {
  totalMessages: number
  totalUsers: number
  avgPerBucket: number
  maxPerBucket: number
  peakTime: string        // When was the most activity
  quietTime: string       // When was the least activity (with messages)
  mode: string
  interval: string
  startDate: string
  endDate: string
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function getDateRange(mode: string): { startDate: Date; endDate: Date } {
  const now = new Date()
  const endDate = now
  const startDate = new Date()
  
  switch (mode) {
    case '24h':
      startDate.setHours(startDate.getHours() - 24)
      break
    case '3d':
      startDate.setDate(startDate.getDate() - 3)
      break
    case '7d':
      startDate.setDate(startDate.getDate() - 7)
      break
    default:
      startDate.setHours(startDate.getHours() - 24)
  }
  
  return { startDate, endDate }
}

function getDefaultInterval(mode: string): string {
  switch (mode) {
    case '24h':
      return 'hour'
    case '3d':
      return '2hour'
    case '7d':
      return '4hour'
    default:
      return 'hour'
  }
}

function getIntervalMs(interval: string): number {
  switch (interval) {
    case '15min':
      return 15 * 60 * 1000
    case '30min':
      return 30 * 60 * 1000
    case 'hour':
      return 60 * 60 * 1000
    case '2hour':
      return 2 * 60 * 60 * 1000
    case '4hour':
      return 4 * 60 * 60 * 1000
    default:
      return 60 * 60 * 1000
  }
}

function formatBucketLabel(timestamp: Date, mode: string): string {
  const hour = timestamp.toLocaleTimeString('de-DE', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Europe/Berlin' 
  })
  
  if (mode === '24h') {
    return hour
  }
  
  const day = timestamp.toLocaleDateString('de-DE', { 
    weekday: 'short',
    timeZone: 'Europe/Berlin'
  })
  
  return `${day} ${hour}`
}

// ═══════════════════════════════════════════════════════════════════════
// GET HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  // Trigger dynamic rendering
  await headers()
  
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || '24h'
    const interval = searchParams.get('interval') || getDefaultInterval(mode)
    
    const supabase = await createClient()
    const { startDate, endDate } = getDateRange(mode)
    const intervalMs = getIntervalMs(interval)
    
    console.log(`[ACTIVITY] ════════════════════════════════════════════`)
    console.log(`[ACTIVITY] 📊 Mode: ${mode}, Interval: ${interval}`)
    console.log(`[ACTIVITY] 📅 Range: ${startDate.toISOString()} → ${endDate.toISOString()}`)
    
    // Fetch all messages in range
    const allMessages: Array<{ username: string; time: string }> = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    
    while (hasMore) {
      const { data: pageMessages, error } = await supabase
        .from('tv_chat_messages')
        .select('username, time')
        .gte('time', startDate.toISOString())
        .lte('time', endDate.toISOString())
        .order('time', { ascending: true })
        .range(offset, offset + pageSize - 1)
      
      if (error) throw new Error(`Database error: ${error.message}`)
      
      if (!pageMessages || pageMessages.length === 0) {
        hasMore = false
      } else {
        allMessages.push(...pageMessages)
        offset += pageSize
        hasMore = pageMessages.length === pageSize
      }
    }
    
    console.log(`[ACTIVITY] 📥 Fetched ${allMessages.length} messages`)
    
    if (allMessages.length === 0) {
      return new Response(
        JSON.stringify({ 
          buckets: [], 
          stats: {
            totalMessages: 0,
            totalUsers: 0,
            avgPerBucket: 0,
            maxPerBucket: 0,
            peakTime: '',
            quietTime: '',
            mode,
            interval,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Create time buckets
    const bucketMap = new Map<number, { count: number; users: Set<string> }>()
    
    // Initialize all buckets in range (even empty ones for gaps)
    const bucketStart = Math.floor(startDate.getTime() / intervalMs) * intervalMs
    const bucketEnd = Math.ceil(endDate.getTime() / intervalMs) * intervalMs
    
    for (let ts = bucketStart; ts <= bucketEnd; ts += intervalMs) {
      bucketMap.set(ts, { count: 0, users: new Set() })
    }
    
    // Fill buckets with message data
    for (const msg of allMessages) {
      const msgTime = new Date(msg.time).getTime()
      const bucketTs = Math.floor(msgTime / intervalMs) * intervalMs
      
      const bucket = bucketMap.get(bucketTs)
      if (bucket) {
        bucket.count++
        bucket.users.add(msg.username)
      }
    }
    
    // Calculate stats
    const allUsers = new Set(allMessages.map(m => m.username))
    const counts = Array.from(bucketMap.values()).map(b => b.count)
    const nonZeroCounts = counts.filter(c => c > 0)
    const maxCount = Math.max(...counts)
    const avgCount = nonZeroCounts.length > 0 
      ? nonZeroCounts.reduce((a, b) => a + b, 0) / nonZeroCounts.length 
      : 0
    
    // Find peak and quiet times
    let peakTs = 0
    let peakCount = 0
    let quietTs = 0
    let quietCount = Infinity
    
    for (const [ts, bucket] of bucketMap) {
      if (bucket.count > peakCount) {
        peakCount = bucket.count
        peakTs = ts
      }
      if (bucket.count > 0 && bucket.count < quietCount) {
        quietCount = bucket.count
        quietTs = ts
      }
    }
    
    // Convert to buckets array
    const buckets: ActivityBucket[] = []
    
    for (const [ts, bucket] of bucketMap) {
      const timestamp = new Date(ts)
      buckets.push({
        timestamp: timestamp.toISOString(),
        label: formatBucketLabel(timestamp, mode),
        count: bucket.count,
        uniqueUsers: bucket.users.size,
        intensity: maxCount > 0 ? bucket.count / maxCount : 0
      })
    }
    
    // Sort chronologically
    buckets.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    
    const stats: ActivityStats = {
      totalMessages: allMessages.length,
      totalUsers: allUsers.size,
      avgPerBucket: Math.round(avgCount * 10) / 10,
      maxPerBucket: maxCount,
      peakTime: peakTs ? formatBucketLabel(new Date(peakTs), mode) : '',
      quietTime: quietTs ? formatBucketLabel(new Date(quietTs), mode) : '',
      mode,
      interval,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }
    
    console.log(`[ACTIVITY] ✅ ${buckets.length} buckets, peak: ${maxCount} msgs at ${stats.peakTime}`)
    console.log(`[ACTIVITY] ════════════════════════════════════════════`)
    
    return new Response(
      JSON.stringify({ buckets, stats }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300' // Cache for 5 min
        } 
      }
    )
    
  } catch (error) {
    console.error('[ACTIVITY] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

