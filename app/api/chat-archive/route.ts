import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

interface TradingViewChatMessage {
  id: string
  username: string
  text: string
  time: string
  avatar?: string
  permalink?: string
  userProfileUrl?: string
}

interface PaginationInfo {
  currentPage: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
  pageLinks: Array<{
    page: number
    url: string
    isCurrent: boolean
  }>
}

interface ChatArchiveData {
  messages: TradingViewChatMessage[]
  room: string
  date: string
  username: string
  totalMessages: number
  totalPages: number
  pagesProcessed: number
  paginationInfo?: PaginationInfo
}

// Helper function to generate URL for a specific page
function generatePageUrl(room: string, date: string, username: string, pageIndex: number = 1): string {
  return `https://de.tradingview.com/chat/history/?room=${room}&date=${date}&timefrom=00%3A00&timeto=00%3A00&usernames=${username}&order=asc&tzoffset=-120&msgid=&pageindex=${pageIndex}`
}

// Helper function to parse messages from HTML
function parseMessagesFromHtml(html: string, username: string): TradingViewChatMessage[] {
  const $ = cheerio.load(html)
  const messages: TradingViewChatMessage[] = []

  // Look for chat items with the class "ch-item"
  $('.ch-item').each((index, element) => {
    const $element = $(element)
    
    // Extract message ID from data-id attribute
    const id = $element.attr('data-id') || `message-${index}`
    
    // Extract username from the userlink
    const $userlink = $element.find('.ch-userlink')
    const messageUsername = $userlink.text().trim() || $element.find('.ch-item-author a').text().trim()
    
    // Only include messages from the specified user
    if (messageUsername.toLowerCase() !== username.toLowerCase()) {
      return
    }
    
    // Extract user profile URL
    const userProfileUrl = $userlink.attr('href') || $element.find('.ch-item-author a').attr('href')
    
    // Extract avatar URL - try multiple selectors
    let avatar = ''
    
    // Primary: Look for user pic in ch-item-userpic
    const $avatar = $element.find('.ch-item-userpic img')
    avatar = $avatar.attr('src') || ''
    
    // Fallback 1: Look for any img with avatar-like classes or attributes
    if (!avatar) {
      const $avatarImg = $element.find('img[src*="avatar"], img[src*="user"], img[class*="avatar"], img[class*="user"]').first()
      avatar = $avatarImg.attr('src') || ''
    }
    
    // Fallback 2: Look for any img in author/user sections
    if (!avatar) {
      const $userImg = $element.find('.ch-item-author img, .ch-userlink img, [class*="user"] img').first()
      avatar = $userImg.attr('src') || ''
    }
    
    // Fallback 3: Generate a consistent avatar URL based on username if no avatar found
    if (!avatar && messageUsername) {
      // TradingView uses a pattern for default avatars - this is a reasonable fallback
      avatar = `https://s3.tradingview.com/userpics/${messageUsername.toLowerCase()}_50.png`
    }
    
    // Extract message text from ch-item-text
    const $messageText = $element.find('.ch-item-text')
    let text = $messageText.text().trim()
    
    // If no text in ch-item-text, try to get HTML content and clean it
    if (!text) {
      const htmlContent = $messageText.html() || ''
      text = htmlContent
        .replace(/<br\s*\/?>/gi, '\n') // Replace <br> with newlines
        .replace(/<[^>]*>/g, '') // Remove other HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
        .replace(/&amp;/g, '&') // Replace &amp; with &
        .replace(/&lt;/g, '<') // Replace &lt; with <
        .replace(/&gt;/g, '>') // Replace &gt; with >
        .replace(/&quot;/g, '"') // Replace &quot; with "
        .trim()
    }
    
    // Extract time from data-time attribute or time element
    let time = ''
    const $timeElement = $element.find('time[data-time]')
    if ($timeElement.length > 0) {
      time = $timeElement.attr('data-time') || ''
    } else {
      // Fallback: look for any element with data-time
      const $dataTimeElement = $element.find('[data-time]')
      if ($dataTimeElement.length > 0) {
        time = $dataTimeElement.attr('data-time') || ''
      }
    }
    
    // Extract permalink
    const $permalink = $element.find('.ch-item-permalink')
    const permalink = $permalink.attr('href')
    
    // Only add if we have essential data
    if (messageUsername && text) {
      messages.push({
        id,
        username: messageUsername,
        text,
        time,
        avatar,
        permalink,
        userProfileUrl
      })
    }
  })

  // If no messages found with ch-item class, try alternative selectors
  if (messages.length === 0) {
    $('[data-id]').each((index, element) => {
      const $element = $(element)
      
      // Skip if this doesn't look like a chat message
      if (!$element.find('.ch-userlink, .ch-item-author').length) {
        return
      }
      
      const messageUsername = $element.find('.ch-userlink, .ch-item-author a').first().text().trim()
      
      // Only include messages from the specified user
      if (messageUsername.toLowerCase() !== username.toLowerCase()) {
        return
      }
      
      const id = $element.attr('data-id') || `message-${index}`
      const userProfileUrl = $element.find('.ch-userlink, .ch-item-author a').first().attr('href')
      
      // Enhanced avatar extraction for fallback parsing
      let avatar = ''
      
      // Try to find avatar with multiple selectors
      const $avatarImg = $element.find('.ch-item-userpic img, img[src*="avatar"], img[src*="user"], img[class*="avatar"], img[class*="user"]').first()
      avatar = $avatarImg.attr('src') || ''
      
      // If still no avatar, try any img in user sections
      if (!avatar) {
        const $userImg = $element.find('.ch-item-author img, .ch-userlink img, [class*="user"] img').first()
        avatar = $userImg.attr('src') || ''
      }
      
      // Fallback: generate consistent avatar URL
      if (!avatar && messageUsername) {
        avatar = `https://s3.tradingview.com/userpics/${messageUsername.toLowerCase()}_50.png`
      }
      
      const text = $element.find('.ch-item-text, .selectable').last().text().trim()
      const time = $element.find('[data-time]').first().attr('data-time') || ''
      const permalink = $element.find('a[href*="/chat/m/"]').attr('href')
      
      if (messageUsername && text) {
        messages.push({
          id,
          username: messageUsername,
          text,
          time,
          avatar,
          permalink,
          userProfileUrl
        })
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

// Helper function to discover all pages by checking sequentially
async function discoverAllPages(room: string, date: string, username: string, maxPages: number = 20): Promise<number> {
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
          console.log(`Found messages on page ${pageIndex}`)
        } else {
          console.log(`No messages found on page ${pageIndex}, stopping discovery`)
          break
        }
      } else {
        console.log(`Page ${pageIndex} returned ${response.status}, stopping discovery`)
        break
      }
    } catch (error) {
      console.error(`Error checking page ${pageIndex}:`, error)
      break
    }
    
    pageIndex++
    // Small delay between checks
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  console.log(`Discovered ${totalPages} total pages`)
  return totalPages
}

// Helper function to extract detailed pagination info
function extractPaginationInfo(html: string, room: string, date: string, username: string): PaginationInfo | null {
  const $ = cheerio.load(html)
  const paginationBlock = $('.chat-history-pagination, .tv-pagination-block')
  
  if (paginationBlock.length === 0) {
    return null
  }
  
  const pageLinks: Array<{ page: number; url: string; isCurrent: boolean }> = []
  let currentPage = 1
  let totalPages = 1
  let hasNext = false
  let hasPrevious = false
  
  // Extract page links
  paginationBlock.find('a').each((_, element) => {
    const $el = $(element)
    const href = $el.attr('href') || ''
    const text = $el.text().trim()
    
    // Check if it's a numbered page
    const pageNum = parseInt(text, 10)
    if (!isNaN(pageNum)) {
      pageLinks.push({
        page: pageNum,
        url: `https://de.tradingview.com${href}`,
        isCurrent: $el.hasClass('current') || $el.hasClass('active')
      })
      
      if ($el.hasClass('current') || $el.hasClass('active')) {
        currentPage = pageNum
      }
      
      if (pageNum > totalPages) {
        totalPages = pageNum
      }
    }
    
    // Check for next/previous indicators
    if (text === '>' || text === 'Next' || text === '›' || href.includes('pageindex=')) {
      const match = href.match(/pageindex=(\d+)/)
      if (match) {
        const pageNum = parseInt(match[1], 10)
        if (pageNum > currentPage) {
          hasNext = true
        }
      }
    }
    
    if (text === '<' || text === 'Previous' || text === '‹') {
      hasPrevious = true
    }
  })
  
  // If no current page was found, try to detect from URL or assume page 1
  if (currentPage === 1 && pageLinks.length === 0) {
    // Generate page links based on detected total pages
    for (let i = 1; i <= totalPages; i++) {
      pageLinks.push({
        page: i,
        url: generatePageUrl(room, date, username, i),
        isCurrent: i === 1
      })
    }
  }
  
  return {
    currentPage,
    totalPages,
    hasNext,
    hasPrevious,
    pageLinks
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { room, date, username, maxPages = 10, startPage = 1 } = body

    if (!room || !date || !username) {
      return NextResponse.json(
        { error: 'Missing required parameters: room, date, and username' },
        { status: 400 }
      )
    }

    // No server-side cache - always fetch fresh data
    console.log(`Fetching fresh data for ${room}/${username}/${date}`)

    const allMessages: TradingViewChatMessage[] = []
    let totalPages = 1
    let pagesProcessed = 0
    let paginationInfo: PaginationInfo | null = null
    
    // Generate the starting page URL
    const firstPageUrl = generatePageUrl(room, date, username, startPage)
    
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
      const firstPageResponse = await fetch(firstPageUrl, { headers: fetchHeaders })
      
      if (!firstPageResponse.ok) {
        return NextResponse.json(
          { error: `Failed to fetch TradingView page: ${firstPageResponse.status} ${firstPageResponse.statusText}` },
          { status: firstPageResponse.status }
        )
      }

      const firstPageHtml = await firstPageResponse.text()
      
      // Parse messages from starting page
      const firstPageMessages = parseMessagesFromHtml(firstPageHtml, username)
      allMessages.push(...firstPageMessages)
      pagesProcessed = startPage

      // If loading multiple pages, discover all available pages
      if (maxPages > 1) {
        console.log('Discovering all available pages...')
        totalPages = await discoverAllPages(room, date, username, 20) // Check up to 20 pages
        
        // Extract pagination info from first page
        paginationInfo = extractPaginationInfo(firstPageHtml, room, date, username)
        
        // Fetch additional pages if they exist
        const endPage = Math.min(totalPages, startPage + maxPages - 1)
        
        if (endPage > startPage) {
          console.log(`Fetching pages ${startPage + 1} to ${endPage}`)
          
          // Fetch additional pages
          for (let pageIndex = startPage + 1; pageIndex <= endPage; pageIndex++) {
            const pageUrl = generatePageUrl(room, date, username, pageIndex)
            
            try {
              const pageResponse = await fetch(pageUrl, { headers: fetchHeaders })
              
              if (pageResponse.ok) {
                const pageHtml = await pageResponse.text()
                const pageMessages = parseMessagesFromHtml(pageHtml, username)
                allMessages.push(...pageMessages)
                pagesProcessed = pageIndex
              } else {
                console.error(`Failed to fetch page ${pageIndex}: ${pageResponse.status}`)
              }
            } catch (error) {
              console.error(`Error fetching page ${pageIndex}:`, error)
            }
            
            // Add delay between requests to avoid overwhelming the server
            if (pageIndex < endPage) {
              await new Promise(resolve => setTimeout(resolve, 300))
            }
          }
        }
      } else {
        // For single page loads, just set totalPages to 1
        totalPages = 1
        paginationInfo = extractPaginationInfo(firstPageHtml, room, date, username)
      }
    } catch (error) {
      console.error('Error fetching paginated data:', error)
      return NextResponse.json(
        { error: 'Failed to fetch chat archive data' },
        { status: 500 }
      )
    }

    // Sort messages by time (oldest first)
    allMessages.sort((a, b) => {
      const timeA = parseFloat(a.time) || 0
      const timeB = parseFloat(b.time) || 0
      return timeA - timeB
    })

    // Remove duplicates based on message ID
    const uniqueMessages = allMessages.filter((message, index, array) => 
      array.findIndex(m => m.id === message.id) === index
    )

    // No server-side caching - client handles localStorage caching

    const archiveData: ChatArchiveData = {
      messages: uniqueMessages,
      room,
      date,
      username,
      totalMessages: uniqueMessages.length,
      totalPages,
      pagesProcessed,
      paginationInfo: paginationInfo || undefined
    }

    return NextResponse.json(archiveData)
  } catch (error) {
    console.error('Error fetching chat archive:', error)
    return NextResponse.json(
      { error: 'Failed to parse chat archive data' },
      { status: 500 }
    )
  }
}