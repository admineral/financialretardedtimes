import { NextRequest, NextResponse } from 'next/server'
import type { Browser } from 'puppeteer-core'
import { writeFile, readFile, mkdir, stat } from 'fs/promises'
import { join } from 'path'

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
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// Cache directory for screenshots
const SCREENSHOT_CACHE_DIR = join(process.cwd(), 'cache', 'screenshots')
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await mkdir(SCREENSHOT_CACHE_DIR, { recursive: true })
  } catch (error) {
    console.error('Failed to create screenshot cache directory:', error)
  }
}

// Check if cached screenshot is still valid
async function getCachedScreenshot(chartId: string): Promise<Buffer | null> {
  try {
    const filePath = join(SCREENSHOT_CACHE_DIR, `${chartId}.png`)
    const stats = await stat(filePath)
    
    // Check if cache is still valid
    if (Date.now() - stats.mtime.getTime() < CACHE_DURATION) {
      const imageBuffer = await readFile(filePath)
      console.log(`📸 [SCREENSHOT API] Cache HIT: ${chartId}`)
      return imageBuffer
    } else {
      console.log(`📸 [SCREENSHOT API] Cache EXPIRED: ${chartId}`)
      return null
    }
  } catch {
    console.log(`📸 [SCREENSHOT API] Cache MISS: ${chartId}`)
    return null
  }
}

// Save screenshot to cache
async function cacheScreenshot(chartId: string, imageBuffer: Buffer): Promise<void> {
  try {
    await ensureCacheDir()
    const filePath = join(SCREENSHOT_CACHE_DIR, `${chartId}.png`)
    await writeFile(filePath, imageBuffer)
    console.log(`📸 [SCREENSHOT API] Cached screenshot: ${chartId}`)
  } catch (error) {
    console.error(`Failed to cache screenshot for ${chartId}:`, error)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  
  if (!url) {
    return NextResponse.json(
      { error: 'url parameter is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  // Validate TradingView URL
  if (!url.includes('tradingview.com')) {
    return NextResponse.json(
      { error: 'Only TradingView URLs are supported' },
      { status: 400, headers: corsHeaders }
    )
  }

  // Extract chart ID from URL for caching
  let chartId = 'unknown'
  const xMatch = url.match(/\/x\/([^/]+)/)
  const chartMatch = url.match(/\/chart\/[^/]+\/([^/]+)/)
  
  if (xMatch) {
    chartId = xMatch[1]
  } else if (chartMatch) {
    chartId = chartMatch[1]
  }

  console.log(`📸 [SCREENSHOT API] Request for chart: ${chartId} (${url})`)

  // Check cache first
  const cachedImage = await getCachedScreenshot(chartId)
  if (cachedImage) {
    return new NextResponse(new Uint8Array(cachedImage), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800', // 24 hours, 7 days stale
        'ETag': `"${chartId}-${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}"`, // Daily ETag
        'Last-Modified': new Date(Date.now()).toUTCString(),
      },
    })
  }

  let browser
  try {
    console.log(`📸 [SCREENSHOT API] Taking screenshot of: ${url}`)
    
    // Launch headless browser using Vercel-compatible chromium
    browser = await getBrowser()

    const page = await browser.newPage()
    
    // Set viewport for consistent screenshots
    await page.setViewport({ 
      width: 1200, 
      height: 800,
      deviceScaleFactor: 1
    })
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    
    // Navigate to the chart URL
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    })
    
    // Wait for chart to load - look for common TradingView chart elements
    try {
      // Wait for the chart canvas or container to be visible
      await page.waitForSelector('canvas, [data-name="legend"], .chart-container', { 
        timeout: 15000,
        visible: true 
      })
      
      // Additional wait for chart rendering
      await new Promise(resolve => setTimeout(resolve, 3000))
    } catch {
      console.warn(`📸 [SCREENSHOT API] Warning: Chart elements not found, proceeding anyway`)
    }

    // Try to find and screenshot just the chart area, fallback to full page
    let screenshot: Buffer
    
    try {
      // Look for chart-specific containers
      const chartElement = await page.$('canvas, [data-name="chart"], .chart-container, .tv-lightweight-charts')
      
      if (chartElement) {
        console.log(`📸 [SCREENSHOT API] Found chart element, taking targeted screenshot`)
        screenshot = await chartElement.screenshot({ 
          type: 'png',
          encoding: 'binary'
        }) as Buffer
      } else {
        console.log(`📸 [SCREENSHOT API] No chart element found, taking full page screenshot`)
        screenshot = await page.screenshot({ 
          type: 'png',
          encoding: 'binary',
          fullPage: false // Just viewport
        }) as Buffer
      }
    } catch {
      console.warn(`📸 [SCREENSHOT API] Element screenshot failed, taking full page screenshot`)
      screenshot = await page.screenshot({ 
        type: 'png',
        encoding: 'binary',
        fullPage: false
      }) as Buffer
    }

    await browser.close()
    
    // Cache the screenshot
    await cacheScreenshot(chartId, screenshot)
    
    console.log(`📸 [SCREENSHOT API] Screenshot taken successfully: ${chartId}`)
    
    return new NextResponse(new Uint8Array(screenshot), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800', // 24 hours, 7 days stale
        'ETag': `"${chartId}-${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}"`, // Daily ETag
        'Last-Modified': new Date().toUTCString(),
      },
    })

  } catch (error) {
    console.error(`📸 [SCREENSHOT API] Error taking screenshot:`, error)
    
    if (browser) {
      await browser.close()
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to take screenshot', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500, headers: corsHeaders }
    )
  }
}
