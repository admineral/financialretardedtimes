import { NextRequest, NextResponse } from 'next/server'
import type { Browser } from 'puppeteer-core'
import { getCachedIdeas, setCachedIdeas, clearExpiredCache } from '../../lib/cache'

// Types for parsed ideas
interface ParsedIdea {
  index: number
  title: string | null
  url: string | null
  content: string | null
  symbol: string | null
  imageUrl: string | null
  author: string
  publishedAt: string | null
  comments: number
  boosts: number
  isEditorsPick: boolean
  strategy: string | null
  chartId: string | null
  page: number
  error?: string
}

interface PuppeteerModule {
  launch: (options: PuppeteerLaunchOptions) => Promise<Browser>
}

interface PuppeteerLaunchOptions {
  headless: boolean
  args?: string[]
  executablePath?: string
}

// URL to the Chromium binary package
const CHROMIUM_PACK_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/chromium-pack.tar`
  : "https://github.com/gabenunez/puppeteer-on-vercel/raw/refs/heads/main/example/chromium-dont-use-in-prod.tar"

// Cache the Chromium executable path
let cachedExecutablePath: string | null = null
let downloadPromise: Promise<string> | null = null

async function getChromiumPath(): Promise<string> {
  if (cachedExecutablePath) return cachedExecutablePath

  if (!downloadPromise) {
    const chromium = (await import("@sparticuz/chromium-min")).default
    downloadPromise = chromium
      .executablePath(CHROMIUM_PACK_URL)
      .then((path: string) => {
        cachedExecutablePath = path
        console.log("Chromium path resolved:", path)
        return path
      })
      .catch((error: Error) => {
        console.error("Failed to get Chromium path:", error)
        downloadPromise = null
        throw error
      })
  }

  return downloadPromise
}

async function getBrowser(): Promise<Browser> {
  const isVercel = !!process.env.VERCEL_ENV
  let puppeteer: PuppeteerModule
  let launchOptions: PuppeteerLaunchOptions = { headless: true }

  if (isVercel) {
    const chromium = (await import("@sparticuz/chromium-min")).default
    puppeteer = await import("puppeteer-core") as unknown as PuppeteerModule
    const executablePath = await getChromiumPath()
    launchOptions = {
      ...launchOptions,
      args: chromium.args,
      executablePath,
    }
  } else {
    puppeteer = await import("puppeteer") as unknown as PuppeteerModule
  }

  return puppeteer.launch(launchOptions)
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// In-memory map to track ongoing requests and prevent duplicates
const ongoingRequests = new Map<string, Promise<NextResponse>>()

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username')
  const pageNumber = parseInt(searchParams.get('page') || '1') // Single page number
  const ideasPerPage = parseInt(searchParams.get('perPage') || '24') // Increased to match what we actually get
  
  if (!username) {
    return NextResponse.json(
      { error: 'username parameter is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  const requestKey = `${username}_page_${pageNumber}`
  console.log(`🚀 [LIVE IDEAS API] Fetching live ideas for: ${username} (page ${pageNumber})`)

  // Clear expired cache entries periodically (10% chance)
  if (Math.random() < 0.1) {
    clearExpiredCache().catch(console.error)
  }

  // Check cache first
  const cachedData = await getCachedIdeas(username, pageNumber)
  if (cachedData) {
    console.log(`📋 [LIVE IDEAS API] Cache HIT: ${username} page ${pageNumber}`)
    return NextResponse.json({
      username: cachedData.username,
      page: cachedData.page,
      ideas: cachedData.ideas,
      hasNextPage: cachedData.hasNextPage,
      source: `cached_${cachedData.source}`,
      timestamp: new Date(cachedData.timestamp).toISOString(),
      cacheAge: Math.round((Date.now() - cachedData.timestamp) / 1000 / 60) // minutes
    }, { headers: corsHeaders })
  }

  // Check if this request is already in progress
  if (ongoingRequests.has(requestKey)) {
    console.log(`⏳ [LIVE IDEAS API] Request already in progress for ${requestKey}, waiting...`)
    try {
      const result = await ongoingRequests.get(requestKey)
      return result
    } catch (error) {
      console.error(`❌ [LIVE IDEAS API] Ongoing request failed for ${requestKey}:`, error)
      return NextResponse.json(
        { error: 'Concurrent request failed', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500, headers: corsHeaders }
      )
    }
  }

  // Create the scraping promise with retry logic
  const scrapingPromise = (async () => {
    let browser
    let retryCount = 0
    const maxRetries = 1
    
    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          console.log(`🔄 [LIVE IDEAS API] Retry ${retryCount}/${maxRetries} for ${requestKey}`)
        } else {
          console.log(`🔄 [LIVE IDEAS API] Starting scraping for ${requestKey}`)
        }
        
        // Launch headless browser using Vercel-compatible chromium
        browser = await getBrowser()
    
    const page = await browser.newPage()
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    
    // Always start from the main profile page
    const profileUrl = `https://de.tradingview.com/u/${username}/`
    
    console.log(`🌐 [LIVE IDEAS API] Loading profile page: ${profileUrl}`)
    
    // Navigate to profile page
    await page.goto(profileUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    })
    
    // Wait for initial ideas to load
    console.log(`⏳ [LIVE IDEAS API] Waiting for initial ideas to load...`)
    await page.waitForSelector('.idea-card-R05xWTMw', { timeout: 15000 })
    
    // For pages > 1, click the actual pagination buttons
    if (pageNumber > 1) {
      console.log(`📄 [LIVE IDEAS API] Navigating to page ${pageNumber} by clicking pagination buttons...`)
      
      // Click pagination buttons to reach the desired page
      const paginationSuccess = await page.evaluate((targetPage: number) => {
        console.log(`Looking for pagination button for page ${targetPage}`)
        
        // First, let's find all pagination elements
        const allPaginationElements = Array.from(document.querySelectorAll('a[class*="number-"], a[class*="link-"], .pagination a'))
        console.log(`Found ${allPaginationElements.length} pagination elements`)
        
        // Log what pagination elements we found
        allPaginationElements.forEach((el, idx) => {
          const span = el.querySelector('span')
          const text = span?.textContent?.trim() || el.textContent?.trim()
          const tooltipText = span?.getAttribute('data-overflow-tooltip-text')
          console.log(`  ${idx + 1}. Text: "${text}", Tooltip: "${tooltipText}", Classes: ${el.className}`)
        })
        
        // Try to find the specific page number
        for (const element of allPaginationElements) {
          const span = element.querySelector('span')
          const text = span?.textContent?.trim() || element.textContent?.trim()
          const tooltipText = span?.getAttribute('data-overflow-tooltip-text')
          
          if (text === targetPage.toString() || tooltipText === targetPage.toString()) {
            console.log(`Found pagination button for page ${targetPage}: "${text}" (tooltip: "${tooltipText}")`)
            ;(element as HTMLElement).click()
            return { success: true, method: 'pagination-click', text, tooltipText }
          }
        }
        
        return { success: false, found: allPaginationElements.length }
      }, pageNumber)
      
      console.log(`🔍 [LIVE IDEAS API] Pagination click result:`, paginationSuccess)
      
      if (paginationSuccess.success) {
        console.log(`✅ [LIVE IDEAS API] Successfully clicked pagination button for page ${pageNumber}`)
        // Wait for new content to load after pagination click
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        // Wait for new ideas to load
        await page.waitForSelector('.idea-card-R05xWTMw', { timeout: 10000 })
        await new Promise(resolve => setTimeout(resolve, 2000))
      } else {
        console.log(`⚠️ [LIVE IDEAS API] Could not find pagination button for page ${pageNumber}, found ${paginationSuccess.found} pagination elements`)
        // Return empty result for now
        return NextResponse.json({
          username,
          page: pageNumber,
          ideas: [],
          hasNextPage: false,
          error: 'Pagination button not found',
          source: 'pagination_failed',
          timestamp: new Date().toISOString()
        }, { headers: corsHeaders })
      }
    }
    
    // Final wait for content to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Debug: Check what's actually on the page
    const pageInfo = await page.evaluate(() => {
      // Check URL and title
      const url = window.location.href
      const title = document.title
      
      // Look for pagination indicators
      const paginationElements = document.querySelectorAll('[class*="pagination"], [class*="page"]')
      const currentPageElement = document.querySelector('.pagination .current, .active, [aria-current="page"]')
      
      // Check for idea containers
      const ideaContainers = [
        document.querySelector('.root-uyPossJ6'),
        document.querySelector('.content-xyCnwtf2'),
        document.querySelector('[data-name="ideas-list"]'),
        document.querySelector('.ideas-list'),
        document.querySelector('[class*="ideas"]')
      ].filter(Boolean)
      
      return {
        url,
        title,
        paginationCount: paginationElements.length,
        currentPage: currentPageElement?.textContent || 'unknown',
        ideaContainersFound: ideaContainers.length,
        containerClasses: ideaContainers.map(c => c?.className || '').filter(Boolean)
      }
    })
    
    console.log(`🔍 [LIVE IDEAS API] Page ${pageNumber} debug info:`, pageInfo)
    
    // Extract the HTML content with ideas
    const ideasHtml = await page.evaluate(() => {
      // Find the container with all ideas
      const ideasContainer = document.querySelector('.root-uyPossJ6') || document.querySelector('.content-xyCnwtf2')
      return ideasContainer ? ideasContainer.innerHTML : ''
    })
    
    console.log(`📄 [LIVE IDEAS API] Page ${pageNumber} HTML size: ${ideasHtml.length} characters`)
    
    if (!ideasHtml) {
      console.log(`⚠️ [LIVE IDEAS API] No ideas content found on page ${pageNumber}`)
      return NextResponse.json({
        username,
        page: pageNumber,
        ideas: [],
        hasNextPage: false,
        source: 'live_puppeteer_single_page',
        timestamp: new Date().toISOString()
      }, { headers: corsHeaders })
    }
    
    // Parse ideas from this page
    const ideaCards = ideasHtml.match(/<article[^>]*class="[^"]*idea-card-R05xWTMw[^"]*"[^>]*>[\s\S]*?<\/article>/g) || []
    console.log(`💡 [LIVE IDEAS API] Found ${ideaCards.length} idea cards on page ${pageNumber}`)
    
    if (ideaCards.length === 0) {
      console.log(`⚠️ [LIVE IDEAS API] No ideas found on page ${pageNumber}`)
      return NextResponse.json({
        username,
        page: pageNumber,
        ideas: [],
        hasNextPage: false,
        source: 'live_puppeteer_single_page',
        timestamp: new Date().toISOString()
      }, { headers: corsHeaders })
    }
    
    // Parse each idea card
    const pageIdeas = ideaCards.map((cardHtml: string, index: number) => {
      try {
        // Extract title
        const titleMatch = cardHtml.match(/class="[^"]*title-tkslJwxl[^"]*"[^>]*>([^<]+)<\/a>/) || 
                          cardHtml.match(/data-name="open-idea-popup"[^>]*>([^<]+)<\/a>/)
        const title = titleMatch ? titleMatch[1].trim() : null
        
        // Extract URL
        const urlMatch = cardHtml.match(/href="([^"]*tradingview\.com[^"]*)"/)
        const url = urlMatch ? urlMatch[1] : null
        
        // Extract content
        const contentMatch = cardHtml.match(/<span[^>]*class="[^"]*line-clamp-content-t3qFZvNN[^"]*"[^>]*>([\s\S]*?)<\/span>/) ||
                            cardHtml.match(/<span[^>]*class="[^"]*line-clamp-content[^"]*"[^>]*>([\s\S]*?)<\/span>/)
        let content = null
        if (contentMatch) {
          content = contentMatch[1]
            .replace(/<[^>]*>/g, '')
            .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ').trim().substring(0, 300)
        }
        
        // Extract symbol
        const symbolMatch = cardHtml.match(/\/symbols\/([^/]+)\//) || 
                           cardHtml.match(/title="([^"]*:[^"]*)"/)
        const symbol = symbolMatch ? symbolMatch[1] : null
        
        // Extract image URL
        const imageMatch = cardHtml.match(/src="(https:\/\/s3\.tradingview\.com\/[^"]+)"/g)
        const imageUrl = imageMatch ? imageMatch[imageMatch.length - 1].match(/src="([^"]+)"/)?.[1] : null
        
        // Extract timestamp
        const timeMatch = cardHtml.match(/datetime="([^"]+)"/)
        const publishedAt = timeMatch ? timeMatch[1] : null
        
        // Extract engagement
        const commentsMatch = cardHtml.match(/aria-label="(\d+) Kommentare?"/)
        const comments = commentsMatch ? parseInt(commentsMatch[1]) : 0
        
        const boostsMatch = cardHtml.match(/aria-label="(\d+) Booster"/)
        const boosts = boostsMatch ? parseInt(boostsMatch[1]) : 0
        
        // Check Editor's Pick
        const isEditorsPick = cardHtml.includes('badge-editors-pick')
        
        // Extract strategy
        const strategyMatch = cardHtml.match(/title="(Long|Short)"/)
        const strategy = strategyMatch ? strategyMatch[1] : null
        
        return {
          index: (pageNumber - 1) * ideasPerPage + index + 1,
          title, url, content, symbol, 
          imageUrl: imageUrl || null,
          author: username,
          publishedAt, comments, boosts, isEditorsPick, strategy,
          chartId: url ? (url.split('/').pop() || null) : null,
          page: pageNumber
        }
      } catch (error) {
        console.error(`💡 [LIVE IDEAS API] Error parsing idea ${index + 1} on page ${pageNumber}:`, error)
        return { 
          index: (pageNumber - 1) * ideasPerPage + index + 1, 
          title: 'Parse Error',
          url: null,
          content: null,
          symbol: null,
          imageUrl: null,
          author: username,
          publishedAt: null,
          comments: 0,
          boosts: 0,
          isEditorsPick: false,
          strategy: null,
          chartId: null,
          page: pageNumber,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })
    
    const validPageIdeas = pageIdeas.filter((i: ParsedIdea) => !i.error)
    
    // Since we're clicking actual pagination buttons, we get the real page content
    const pageSpecificIdeas = validPageIdeas
    
    console.log(`✅ [LIVE IDEAS API] Page ${pageNumber}: extracted ${pageSpecificIdeas.length} ideas (real pagination)`)
    
    // Check if there's a next page by looking for pagination buttons
    const hasNextPage = await page.evaluate((currentPage: number) => {
      // Look for next page button or higher page numbers
      const nextPageNumber = currentPage + 1
      const paginationElements = Array.from(document.querySelectorAll('a[class*="number-"], a[class*="link-"]'))
      
      for (const element of paginationElements) {
        const span = element.querySelector('span')
        const text = span?.textContent?.trim() || element.textContent?.trim()
        const tooltipText = span?.getAttribute('data-overflow-tooltip-text')
        
        if (text === nextPageNumber.toString() || tooltipText === nextPageNumber.toString()) {
          return true
        }
      }
      
      // Also check for "Next" button or arrow
      const nextButtons = Array.from(document.querySelectorAll('button, a')).filter(el => 
        el.textContent?.includes('Next') || 
        el.textContent?.includes('→') ||
        el.getAttribute('aria-label')?.includes('next')
      )
      
      return nextButtons.length > 0
    }, pageNumber)
    
    if (pageSpecificIdeas.length > 0) {
      console.log('💡 [LIVE IDEAS API] Sample extracted ideas from this page:')
      pageSpecificIdeas.slice(0, 3).forEach((idea: ParsedIdea, idx: number) => {
        console.log(`  ${idx + 1}. "${idea.title}" (${idea.symbol || 'N/A'}) - ${idea.comments} comments, ${idea.boosts} boosts - Index: ${idea.index}`)
      })
      
      // Also log the last few ideas to see the range
      if (pageSpecificIdeas.length > 3) {
        console.log('💡 [LIVE IDEAS API] Last few ideas from this page:')
        pageSpecificIdeas.slice(-2).forEach((idea: ParsedIdea, idx: number) => {
          console.log(`  ${pageSpecificIdeas.length - 1 + idx}. "${idea.title}" (${idea.symbol || 'N/A'}) - Index: ${idea.index}`)
        })
      }
      
      // Log index range
      const firstIndex = pageSpecificIdeas[0]?.index
      const lastIndex = pageSpecificIdeas[pageSpecificIdeas.length - 1]?.index
      console.log(`📊 [LIVE IDEAS API] Page ${pageNumber} index range: ${firstIndex} - ${lastIndex}`)
    }

    // Cache the results (cache the page-specific slice)
    await setCachedIdeas(username, pageNumber, pageSpecificIdeas, hasNextPage, 'live_puppeteer_infinite_scroll')
    
        // Success! Return the results
        return NextResponse.json({
          username,
          page: pageNumber,
          ideas: pageSpecificIdeas,
          hasNextPage,
          totalLoaded: validPageIdeas.length,
          source: 'live_puppeteer_pagination_click',
          timestamp: new Date().toISOString()
        }, { headers: corsHeaders })
        
      } catch (error) {
        console.error(`🚨 [LIVE IDEAS API] Error on attempt ${retryCount + 1}:`, error)
        
        // Close browser on error
        if (browser) {
          await browser.close()
          browser = null
        }
        
        // If this was the last retry, throw the error
        if (retryCount >= maxRetries) {
          return NextResponse.json(
            { error: 'Failed to fetch live ideas after retries', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500, headers: corsHeaders }
          )
        }
        
        // Wait before retry
        console.log(`⏳ [LIVE IDEAS API] Waiting 2s before retry...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        retryCount++
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    } // End of while loop
    
    // This should never be reached
    return NextResponse.json(
      { error: 'Unexpected end of retry loop' },
      { status: 500, headers: corsHeaders }
    )
  })()

  // Add to ongoing requests
  ongoingRequests.set(requestKey, scrapingPromise)

  try {
    const result = await scrapingPromise
    return result
  } finally {
    // Remove from ongoing requests when done
    ongoingRequests.delete(requestKey)
  }
}
