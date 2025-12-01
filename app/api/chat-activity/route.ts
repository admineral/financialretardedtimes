import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { format, subDays } from 'date-fns'

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
async function discoverPagesForActivity(room: string, date: string, username: string, maxPages: number = 5): Promise<number> {
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
    const totalPages = await discoverPagesForActivity(room, date, username, 5)
    const maxPages = Math.min(totalPages, 5)
    
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
}

interface ChatActivityResponse {
  activities: ActivityData[]
  room: string
  username: string
  totalDays: number
  totalMessages: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { room, username, days = 30, startOffset = 0, stream = false, dates } = body // Support both 'dates' array and legacy 'days' param

    if (!room || !username) {
      return NextResponse.json(
        { error: 'Missing required parameters: room and username' },
        { status: 400 }
      )
    }

    // Streaming response using NDJSON so the UI can update incrementally
    if (stream) {
      const encoder = new TextEncoder()
      const today = new Date()
      const activities: ActivityData[] = []
      let totalMessages = 0

      // Support both specific dates array or legacy day count
      const datesToFetch = dates && Array.isArray(dates) ? dates : []
      const useDates = datesToFetch.length > 0
      const totalToFetch = useDates ? datesToFetch.length : days

      if (useDates) {
        console.log(`Streaming ${datesToFetch.length} specific dates for ${username} in ${room}`)
      } else {
        console.log(`Streaming ${days} days of activity for ${username} in ${room} (starting from offset ${startOffset})`)
      }

      const streamBody = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          let isClosed = false
          
          try {
            // Iterate through dates
            for (let i = 0; i < totalToFetch; i++) {
              // Check if client disconnected
              if (isClosed) {
                console.log('Stream closed by client, stopping fetch')
                break
              }

              // Get the date to fetch - either from specific dates array or calculate from offset
              const dateStr = useDates ? datesToFetch[i] : format(subDays(today, startOffset + i), 'yyyy-MM-dd')

              try {
                // Fetch fresh data (no server-side cache)
                console.log(`Fetching data for ${dateStr}`)
                const allMessages = await fetchAllMessagesForDay(room, dateStr, username)

                // Check again after async operation
                if (isClosed) break

                // Add avatar to messages
                const messagesWithAvatar = allMessages.map(msg => ({
                  ...msg,
                  avatar: `https://s3.tradingview.com/userpics/${username.toLowerCase()}_50.png`
                }))

                const activityMessages = messagesWithAvatar.slice(0, 5)
                
                const activity: ActivityData = {
                  date: dateStr,
                  count: allMessages.length,
                  messages: activityMessages
                }
                console.log(`Fetched ${allMessages.length} messages for ${dateStr}`)

                activities.push(activity)
                totalMessages += activity.count

                // Emit activity chunk - wrapped in try-catch
                try {
                  controller.enqueue(
                    encoder.encode(JSON.stringify({ type: 'activity', activity }) + '\n')
                  )
                  // Emit progress chunk
                  controller.enqueue(
                    encoder.encode(JSON.stringify({ type: 'progress', current: (i - startOffset + 1), total: days }) + '\n')
                  )
                } catch (enqueueError) {
                  console.log('Client disconnected during stream:', enqueueError)
                  isClosed = true
                  break
                }

                // Small delay to avoid overwhelming the target site
                await new Promise(resolve => setTimeout(resolve, 100))
              } catch (error) {
                console.error(`Error fetching data for ${dateStr}:`, error)
                
                if (isClosed) break

                const activity: ActivityData = { date: dateStr, count: 0, messages: [] }
                activities.push(activity)
                
                try {
                  controller.enqueue(
                    encoder.encode(JSON.stringify({ type: 'activity', activity }) + '\n')
                  )
                } catch (enqueueError) {
                  console.log('Client disconnected during error stream:', enqueueError)
                  isClosed = true
                  break
                }
              }
            }

            // Only send completion if stream is still open
            if (!isClosed) {
              try {
                // Emit completion chunk with summary data
                const summary: ChatActivityResponse = {
                  activities,
                  room,
                  username,
                  totalDays: days,
                  totalMessages
                }
                
                controller.enqueue(
                  encoder.encode(JSON.stringify({ type: 'complete', data: summary }) + '\n')
                )
                controller.close()
              } catch (closeError) {
                console.log('Stream already closed:', closeError)
              }
            }
          } catch (err) {
            if (!isClosed) {
              try {
                controller.error(err)
              } catch {
                console.log('Could not send error, stream already closed')
              }
            }
          }
        },
        cancel() {
          console.log('Stream cancelled by client')
        }
      })

      return new Response(streamBody, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      })
    }

    // Fallback: non-streaming JSON response (existing behavior)
    const activities: ActivityData[] = []
    const today = new Date()
    let totalMessages = 0

    console.log(`Fetching ${days} days of activity for ${username} in ${room}`)

    // Fetch data for each day
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i)
      const dateStr = format(date, 'yyyy-MM-dd')

      try {
        // Fetch fresh data (no server-side cache)
        console.log(`Fetching data for ${dateStr}`)
        const allMessages = await fetchAllMessagesForDay(room, dateStr, username)

        // Add avatar to messages
        const messagesWithAvatar = allMessages.map(msg => ({
          ...msg,
          avatar: `https://s3.tradingview.com/userpics/${username.toLowerCase()}_50.png`
        }))

        const activityMessages = messagesWithAvatar.slice(0, 5)
        
        activities.push({
          date: dateStr,
          count: allMessages.length,
          messages: activityMessages
        })
        totalMessages += allMessages.length
        console.log(`Fetched ${allMessages.length} messages for ${dateStr}`)
      } catch (error) {
        console.error(`Error fetching data for ${dateStr}:`, error)
        // Add empty activity for errors
        activities.push({
          date: dateStr,
          count: 0,
          messages: []
        })
      }

      // Add a small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const response: ChatActivityResponse = {
      activities,
      room,
      username,
      totalDays: days,
      totalMessages
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
