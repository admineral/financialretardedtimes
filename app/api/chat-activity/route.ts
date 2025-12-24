import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { format, subDays, isToday, parseISO } from 'date-fns'
import { 
  getCachedActivityForDates, 
  getMissingActivityDates, 
  cacheActivityData,
  isActivityStale,
  DBActivityMessage
} from '@/app/Test/lib/db-cache'

// Progress bar helper for terminal logging
function createProgressBar(current: number, total: number, width: number = 30): string {
  const percentage = Math.round((current / total) * 100)
  const filled = Math.round((current / total) * width)
  const empty = width - filled
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  return `[${bar}] ${percentage}% (${current}/${total})`
}

// Helper function to generate URL for a specific page
function generatePageUrl(room: string, date: string, username: string, pageIndex: number = 1): string {
  return `https://de.tradingview.com/chat/history/?room=${room}&date=${date}&timefrom=00%3A00&timeto=00%3A00&usernames=${username}&order=asc&tzoffset=-120&msgid=&pageindex=${pageIndex}`
}

// Helper function to parse messages from HTML
function parseMessagesFromHtml(html: string, username: string): Array<{ id: string; text: string; time: string }> {
  const $ = cheerio.load(html)
  const messages: Array<{ id: string; text: string; time: string }> = []

  // Look for chat items with the class "ch-item"
  $('.ch-item').each((index, element) => {
    const $element = $(element)
    
    const id = $element.attr('data-id') || `message-${index}`
    const messageUsername = $element.find('.ch-userlink').text().trim() || $element.find('.ch-item-author a').text().trim()
    
    // Only count messages from the specified user
    if (messageUsername.toLowerCase() === username.toLowerCase()) {
      const $messageText = $element.find('.ch-item-text')
      let text = $messageText.text().trim()
      
      if (!text) {
        const htmlContent = $messageText.html() || ''
        text = htmlContent
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .trim()
      }
      
      const $timeElement = $element.find('time[data-time]')
      let time = ''
      if ($timeElement.length > 0) {
        time = $timeElement.attr('data-time') || ''
      }
      
      if (text) {
        messages.push({ id, text, time })
      }
    }
  })

  // If no messages found with ch-item, try alternative approach
  if (messages.length === 0) {
    $('[data-id]').each((index, element) => {
      const $element = $(element)
      
      if (!$element.find('.ch-userlink, .ch-item-author').length) {
        return
      }
      
      const messageUsername = $element.find('.ch-userlink, .ch-item-author a').first().text().trim()
      
      if (messageUsername.toLowerCase() === username.toLowerCase()) {
        const id = $element.attr('data-id') || `message-${index}`
        const text = $element.find('.ch-item-text, .selectable').last().text().trim()
        const time = $element.find('[data-time]').first().attr('data-time') || ''
        
        if (text) {
          messages.push({ id, text, time })
        }
      }
    })
  }

  return messages
}

// Helper function to check if a page has messages for the user
function hasMessagesOnPage(html: string, username: string): boolean {
  const messages = parseMessagesFromHtml(html, username)
  return messages.length > 0
}

// Helper function to discover all pages by checking sequentially (simplified for activity tracker)
async function discoverPagesForActivity(room: string, date: string, username: string, maxPages: number = 30): Promise<number> {
  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0'
  }

  let totalPages = 1
  let pageIndex = 2
  
  // Keep checking pages until we find one with no messages or hit the limit
  while (pageIndex <= maxPages) {
    try {
      const pageUrl = generatePageUrl(room, date, username, pageIndex)
      const response = await fetch(pageUrl, { headers: fetchHeaders })
      
      if (response.ok) {
        const html = await response.text()
        
        if (hasMessagesOnPage(html, username)) {
          totalPages = pageIndex
        } else {
          break
        }
      } else {
        break
      }
    } catch {
      break
    }
    
    pageIndex++
    // Small delay between checks
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  
  return totalPages
}

// Helper function to fetch all messages for a specific day (with pagination)
async function fetchAllMessagesForDay(room: string, date: string, username: string): Promise<Array<{ id: string; text: string; time: string }>> {
  const allMessages: Array<{ id: string; text: string; time: string }> = []
  
  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0'
  }

  try {
    // Fetch first page
    const firstPageUrl = generatePageUrl(room, date, username, 1)
    const firstPageResponse = await fetch(firstPageUrl, { headers: fetchHeaders })
    
    if (!firstPageResponse.ok) {
      return allMessages
    }

    const firstPageHtml = await firstPageResponse.text()
    
    // Parse messages from first page
    const firstPageMessages = parseMessagesFromHtml(firstPageHtml, username)
    allMessages.push(...firstPageMessages)

    // Discover total pages by checking sequentially
    const totalPages = await discoverPagesForActivity(room, date, username, 30)
    const maxPages = Math.min(totalPages, 30)
    
    if (maxPages > 1) {
      for (let pageIndex = 2; pageIndex <= maxPages; pageIndex++) {
        const pageUrl = generatePageUrl(room, date, username, pageIndex)
        
        try {
          const pageResponse = await fetch(pageUrl, { headers: fetchHeaders })
          
          if (pageResponse.ok) {
            const pageHtml = await pageResponse.text()
            const pageMessages = parseMessagesFromHtml(pageHtml, username)
            allMessages.push(...pageMessages)
          }
        } catch (error) {
          console.error(`Error fetching page ${pageIndex} for ${date}:`, error)
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
  } catch (error) {
    console.error(`Error fetching messages for ${date}:`, error)
  }

  return allMessages
}

interface ActivityData {
  date: string // YYYY-MM-DD format
  count: number
  messages?: Array<{
    id: string
    text: string
    time: string
    avatar?: string
  }>
  fromCache?: boolean
}

interface ChatActivityResponse {
  activities: ActivityData[]
  room: string
  username: string
  totalDays: number
  totalMessages: number
  cachedCount: number
  fetchedCount: number
}

export async function POST(request: NextRequest) {
  // Get the abort signal from the request to detect client disconnection
  const abortSignal = request.signal
  
  try {
    const body = await request.json()
    const { room, username, days = 30, dates, forceRefresh = false, cacheOnly = false } = body

    if (!room || !username) {
      return NextResponse.json(
        { error: 'Missing required parameters: room and username' },
        { status: 400 }
      )
    }
    
    // Check if client already disconnected
    if (abortSignal?.aborted) {
      console.log(`🛑 ${username}: Client disconnected before processing started`)
      return NextResponse.json({ error: 'Request aborted' }, { status: 499 })
    }

    // Generate dates to fetch
    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    const datesToFetch = dates && Array.isArray(dates) ? dates : []
    
    // If no specific dates provided, generate last N days
    if (datesToFetch.length === 0) {
      for (let i = 0; i < days; i++) {
        datesToFetch.push(format(subDays(today, i), 'yyyy-MM-dd'))
      }
    }

    // CACHE-ONLY MODE: Return only cached data immediately (no TradingView fetch)
    if (cacheOnly) {
      console.log(`📋 [CACHE-ONLY] ${username}: Returning cached data for ${datesToFetch.length} days`)
      
      try {
        const cached = await getCachedActivityForDates(room, username, datesToFetch)
        const activities: ActivityData[] = []
        let totalMessages = 0
        
        for (const date of datesToFetch) {
          const cachedEntry = cached.get(date)
          if (cachedEntry) {
            activities.push({
              date,
              count: cachedEntry.message_count,
              messages: cachedEntry.messages.map(m => ({
                ...m,
                avatar: `https://s3.tradingview.com/userpics/${username.toLowerCase()}_50.png`
              })),
              fromCache: true
            })
            totalMessages += cachedEntry.message_count
          }
        }
        
        // Sort by date (newest first)
        activities.sort((a, b) => b.date.localeCompare(a.date))
        
        console.log(`📋 [CACHE-ONLY] ${username}: Found ${activities.length} cached days with ${totalMessages} messages`)
        
        return NextResponse.json({
          activities,
          room,
          username,
          totalDays: datesToFetch.length,
          totalMessages,
          cachedCount: activities.length,
          fetchedCount: 0,
          cacheOnly: true
        })
      } catch (dbError) {
        console.warn('⚠️ [CACHE-ONLY] Database error:', dbError)
        return NextResponse.json({
          activities: [],
          room,
          username,
          totalDays: datesToFetch.length,
          totalMessages: 0,
          cachedCount: 0,
          fetchedCount: 0,
          cacheOnly: true
        })
      }
    }

    console.log(`\n📊 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📊 ACTIVITY FETCH: "${username}" in ${room}`)
    console.log(`📊 Requested ${datesToFetch.length} days ${forceRefresh ? '(FORCE REFRESH)' : ''}`)
    console.log(`📊 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

    const activities: ActivityData[] = []
    let totalMessages = 0
    let cachedCount = 0
    let fetchedCount = 0
    const startTime = Date.now()

    // Step 1: Check Supabase cache for existing data
    let missingDates: string[] = datesToFetch
    let cachedData = new Map<string, { count: number; messages: DBActivityMessage[] }>()

    if (!forceRefresh) {
      try {
        // Check which dates we already have cached
        const cached = await getCachedActivityForDates(room, username, datesToFetch)
        
        // For today's date, check if it's stale (> 15 minutes old)
        const staleDates: string[] = []
        for (const [date, data] of cached) {
          if (date === todayStr) {
            const stale = await isActivityStale(room, username, date, 15)
            if (stale) {
              staleDates.push(date)
              console.log(`📊 ${username}: Today's data is stale, will refresh`)
            }
          }
        }
        
        // Remove stale dates from cached data
        for (const date of staleDates) {
          cached.delete(date)
        }
        
        cachedData = new Map(
          Array.from(cached).map(([date, data]) => [
            date, 
            { count: data.message_count, messages: data.messages }
          ])
        )
        
        missingDates = await getMissingActivityDates(room, username, datesToFetch)
        // Also add stale dates to missing
        missingDates = [...new Set([...missingDates, ...staleDates])]
        
        console.log(`📊 ${username}: ${cachedData.size}/${datesToFetch.length} days cached, ${missingDates.length} to fetch`)
      } catch (dbError) {
        console.warn('⚠️ [Activity] Database not available, fetching all from TradingView:', dbError)
        missingDates = datesToFetch
      }
    } else {
      console.log(`📊 ${username}: Force refresh - fetching all ${datesToFetch.length} days`)
    }

    // Step 2: Add cached data to activities
    for (const date of datesToFetch) {
      const cached = cachedData.get(date)
      if (cached) {
        activities.push({
          date,
          count: cached.count,
          messages: cached.messages.map(m => ({
            ...m,
            avatar: `https://s3.tradingview.com/userpics/${username.toLowerCase()}_50.png`
          })),
          fromCache: true
        })
        totalMessages += cached.count
        cachedCount++
      }
    }

    // Step 3: Fetch missing dates from TradingView
    if (missingDates.length > 0) {
      console.log(`📊 ${username}: Fetching ${missingDates.length} missing dates from TradingView...`)
      
      let wasAborted = false
      
      for (let i = 0; i < missingDates.length; i++) {
        // Check if client disconnected before each fetch
        if (abortSignal?.aborted) {
          console.log(`🛑 ${username}: Client disconnected at ${i}/${missingDates.length} - stopping fetch`)
          wasAborted = true
          break
        }
        
        const dateStr = missingDates[i]
        
        try {
          const allMessages = await fetchAllMessagesForDay(room, dateStr, username)
          
          // Check again after fetch in case client disconnected during fetch
          if (abortSignal?.aborted) {
            console.log(`🛑 ${username}: Client disconnected after fetching ${dateStr} - stopping`)
            wasAborted = true
            // Still cache what we got
            if (allMessages.length >= 0) {
              try {
                await cacheActivityData(room, username, [{
                  date: dateStr,
                  count: allMessages.length,
                  messages: allMessages // Store ALL messages
                }])
              } catch (e) { /* ignore cache errors */ }
            }
            break
          }
          
          // Add avatar to messages (store ALL messages)
          const messagesWithAvatar = allMessages.map(msg => ({
            ...msg,
            avatar: `https://s3.tradingview.com/userpics/${username.toLowerCase()}_50.png`
          }))
          
          const activity: ActivityData = {
            date: dateStr,
            count: allMessages.length,
            messages: messagesWithAvatar,
            fromCache: false
          }
          
          // IMMEDIATELY cache this day's data so polling can pick it up
          try {
            await cacheActivityData(room, username, [{
              date: dateStr,
              count: allMessages.length,
              messages: allMessages // Store ALL messages
            }])
          } catch (cacheErr) {
            console.warn(`⚠️ Failed to cache ${dateStr}:`, cacheErr)
          }
          
          activities.push(activity)
          totalMessages += allMessages.length
          fetchedCount++
          
          // Log progress
          const progress = createProgressBar(i + 1, missingDates.length)
          const msgInfo = allMessages.length > 0 ? `📨 ${allMessages.length} msgs` : `📭 0 msgs`
          console.log(`👤 ${username} ${progress} ${dateStr} ${msgInfo}`)
          
          // Small delay to avoid overwhelming TradingView
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (error) {
          console.error(`❌ Error fetching ${dateStr}:`, error)
          
          // Cache empty activity for errors too (so we don't retry)
          try {
            await cacheActivityData(room, username, [{
              date: dateStr,
              count: 0,
              messages: []
            }])
          } catch (e) { /* ignore */ }
          
          // Add empty activity for errors
          activities.push({
            date: dateStr,
            count: 0,
            messages: [],
            fromCache: false
          })
          fetchedCount++
        }
      }
      
      // If aborted, return early with partial data
      if (wasAborted) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`\n⚠️ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        console.log(`⚠️ ABORTED: "${username}" - client disconnected`)
        console.log(`⚠️ ${cachedCount} from cache, ${fetchedCount} fetched in ${elapsed}s before abort`)
        console.log(`⚠️ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
        
        return NextResponse.json({ 
          error: 'Request aborted by client',
          partialData: {
            activities,
            cachedCount,
            fetchedCount
          }
        }, { status: 499 })
      }
    }

    // Sort activities by date (newest first)
    activities.sort((a, b) => b.date.localeCompare(a.date))

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n✅ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`✅ COMPLETE: "${username}" - ${totalMessages} total messages`)
    console.log(`✅ ${cachedCount} from cache, ${fetchedCount} fetched in ${elapsed}s`)
    console.log(`✅ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

    const response: ChatActivityResponse = {
      activities,
      room,
      username,
      totalDays: datesToFetch.length,
      totalMessages,
      cachedCount,
      fetchedCount
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching chat activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chat activity data' },
      { status: 500 }
    )
  }
}
