/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getCachedProfile, isProfileFresh, cacheProfile } from '../../lib/db-cache'

const TRADINGVIEW_ORIGIN = 'https://de.tradingview.com'

// Profile cache TTL in hours (24 hours)
const PROFILE_CACHE_TTL_HOURS = 24

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

interface ExtractionLog {
  timestamp: string
  userId: string | null
  username: string | null
  url: string
  summary: {
    totalJsonScripts: number
    relevantJsonScripts: number
    totalMetaTags: number
    relevantMetaTags: number
    extractionSuccess: boolean
    dataSource: string
  }
  relevantData: {
    ssrData?: Record<string, unknown>
    allJsonScripts?: Array<{
      scriptIndex: number
      keys: string[]
      data: Record<string, unknown>
    }>
    keyMetaTags: Array<{
      name?: string
      property?: string
      content?: string
    }>
    htmlPatterns: {
      followerMatches: string[]
      followingMatches: string[]
      ideasMatches: string[]
      joinDateMatches: string[]
    }
    ideas?: Array<{
      index: number
      title: string | null
      url: string | null
      content: string | null
      symbol: string | null
      imageUrl: string | null
      author: string | null
      publishedAt: string | null
      comments: number
      boosts: number
      isEditorsPick: boolean
      strategy: string | null
      chartId: string | null
      error?: string
    }>
    jsVariables?: Record<string, string>
  }
  extractedProfile: Record<string, unknown>
  errors: string[]
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, htmlContent } = body
    
    if (!username || !htmlContent) {
      return NextResponse.json(
        { error: 'username and htmlContent are required' },
        { status: 400, headers: corsHeaders }
      )
    }
    
    console.log(`💡 [USER PROFILE API] POST: Parsing ideas from provided HTML for ${username}`)
    console.log(`💡 [USER PROFILE API] HTML content size: ${htmlContent.length} chars`)
    
    // Extract ideas directly from the provided HTML content
    // Look for both the specific TradingView idea card structure and generic article tags
    let ideaCards = htmlContent.match(/<article[^>]*class="[^"]*idea-card-R05xWTMw[^"]*"[^>]*>[\s\S]*?<\/article>/g) || []
    
    // If no specific TradingView cards found, try generic idea-card pattern
    if (ideaCards.length === 0) {
      ideaCards = htmlContent.match(/<article[^>]*class="[^"]*idea-card[^"]*"[^>]*>[\s\S]*?<\/article>/g) || []
    }
    
    console.log(`💡 [USER PROFILE API] Found ${ideaCards.length} idea cards in provided HTML`)
    
    if (ideaCards.length === 0) {
      return NextResponse.json({
        username,
        ideas: [],
        message: 'No idea cards found in provided HTML'
      }, { headers: corsHeaders })
    }
    
    const extractedIdeas = ideaCards.map((cardHtml, index) => {
      try {
        // Extract title - look for TradingView specific patterns
        const titleMatch = cardHtml.match(/class="[^"]*title-tkslJwxl[^"]*"[^>]*>([^<]+)<\/a>/) || 
                          cardHtml.match(/data-name="open-idea-popup"[^>]*>([^<]+)<\/a>/) ||
                          cardHtml.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/)
        const title = titleMatch ? titleMatch[1].trim() : null
        
        // Extract URL
        const urlMatch = cardHtml.match(/href="([^"]*tradingview\.com[^"]*)"/)
        const url = urlMatch ? urlMatch[1] : null
        
        // Extract content - look for TradingView specific patterns
        const contentMatch = cardHtml.match(/<span[^>]*class="[^"]*line-clamp-content-t3qFZvNN[^"]*"[^>]*>([\s\S]*?)<\/span>/) ||
                            cardHtml.match(/<span[^>]*class="[^"]*line-clamp-content[^"]*"[^>]*>([\s\S]*?)<\/span>/)
        let content = null
        if (contentMatch) {
          content = contentMatch[1]
            .replace(/<[^>]*>/g, '')
            .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ').trim().substring(0, 800)
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
          index: index + 1,
          title, url, content, symbol, imageUrl,
          author: username,
          publishedAt, comments, boosts, isEditorsPick, strategy,
          chartId: url ? url.split('/').pop() : null
        }
      } catch (error) {
        console.error(`💡 [USER PROFILE API] Error parsing idea ${index + 1}:`, error)
        return { index: index + 1, error: error.message, title: 'Parse Error' }
      }
    })
    
    const validIdeas = extractedIdeas.filter(i => !i.error)
    console.log(`💡 [USER PROFILE API] Successfully extracted ${validIdeas.length} ideas from provided HTML`)
    
    // Log sample of extracted ideas
    if (validIdeas.length > 0) {
      console.log('💡 [USER PROFILE API] Sample extracted ideas:')
      validIdeas.slice(0, 3).forEach(idea => {
        console.log(`  - "${idea.title}" (${idea.symbol || 'N/A'}) - ${idea.comments} comments, ${idea.boosts} boosts`)
      })
    }
    
    return NextResponse.json({
      username,
      totalExtracted: validIdeas.length,
      ideas: validIdeas,
      errors: extractedIdeas.filter(i => i.error).length
    }, { headers: corsHeaders })
    
  } catch (error) {
    console.error('💡 [USER PROFILE API] POST Error:', error)
    return NextResponse.json(
      { error: 'Failed to parse ideas from HTML content' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  const username = searchParams.get('username')
  const forceRefresh = searchParams.get('forceRefresh') === 'true'
  const useCache = searchParams.get('useCache') !== 'false' // Default to using cache

  if (!userId && !username) {
    return NextResponse.json(
      { error: 'userId or username parameter is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  console.log('🔍 [USER PROFILE API] Fetching profile for:', { userId, username, useCache, forceRefresh })

  // Check database cache first (if enabled and not forcing refresh)
  if (useCache && !forceRefresh && username) {
    try {
      const isFresh = await isProfileFresh(username)
      if (isFresh) {
        const cachedProfile = await getCachedProfile(username)
        if (cachedProfile) {
          console.log('✅ [USER PROFILE API] Serving from database cache:', username)
          return NextResponse.json({
            ...cachedProfile,
            _cached: true,
            _cacheSource: 'database'
          }, { headers: corsHeaders })
        }
      } else {
        console.log('📊 [USER PROFILE API] Cache expired or missing for:', username)
      }
    } catch (cacheError) {
      console.warn('⚠️ [USER PROFILE API] Cache check failed:', cacheError)
      // Continue to fetch from TradingView
    }
  }

  // Create a detailed log object to store all extracted data
  const extractionLog: ExtractionLog = {
    timestamp: new Date().toISOString(),
    userId,
    username,
    url: '',
    summary: {
      totalJsonScripts: 0,
      relevantJsonScripts: 0,
      totalMetaTags: 0,
      relevantMetaTags: 0,
      extractionSuccess: false,
      dataSource: 'none'
    },
    relevantData: {
      keyMetaTags: [],
      htmlPatterns: {
        followerMatches: [],
        followingMatches: [],
        ideasMatches: [],
        joinDateMatches: []
      }
    },
    extractedProfile: {},
    errors: []
  }

  try {
    // Try different URL formats for TradingView profiles
    const urlsToTry = []
    
    if (username) {
      urlsToTry.push(`${TRADINGVIEW_ORIGIN}/u/${username}/`)
    }
    
    if (userId) {
      urlsToTry.push(`${TRADINGVIEW_ORIGIN}/u/${userId}/`)
      urlsToTry.push(`${TRADINGVIEW_ORIGIN}/users/${userId}/`)
      urlsToTry.push(`${TRADINGVIEW_ORIGIN}/profile/${userId}/`)
    }

    let response: Response | null = null

    // Try each URL until we find one that works
    for (const url of urlsToTry) {
      console.log('📡 [USER PROFILE API] Trying URL:', url)
      
      try {
        const testResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            'Referer': TRADINGVIEW_ORIGIN,
            'Cache-Control': 'no-cache'
          },
        })

        console.log('📊 [USER PROFILE API] Response status for', url, ':', testResponse.status)

        if (testResponse.ok) {
          response = testResponse
          extractionLog.url = url
          break
        }
      } catch (error) {
        console.log('⚠️ [USER PROFILE API] Failed to fetch', url, ':', error)
        continue
      }
    }

    if (!response || !response.ok) {
      console.log('⚠️ [USER PROFILE API] No working URL found, returning mock data')
      // Return mock/limited data when profile is not accessible
      return NextResponse.json({
        userId: userId || username,
        username: username || null,
        displayName: null,
        bio: null,
        location: null,
        website: null,
        joinDate: null,
        followers: null,
        following: null,
        ideas: null,
        scripts: null,
        reputation: null,
        badges: [],
        avatar: null,
        error: 'Profile not accessible - using chat data only'
      }, { headers: corsHeaders })
    }

    const html = await response.text()
    
    // Parse comprehensive profile information from HTML with logging
    const profileData = parseProfileFromHTML(html, userId || username || 'unknown', extractionLog)
    
    // Fetch LIVE ideas content using TradingView's dynamic API
    if (profileData.userId) {
      try {
        console.log(`💡 [USER PROFILE API] Fetching live ideas for user ID: ${profileData.userId}`)
        
        // Try TradingView's internal API endpoints for ideas
        const apiEndpoints = [
          `${TRADINGVIEW_ORIGIN}/ideas-backend/v1/ideas/list/`,
          `${TRADINGVIEW_ORIGIN}/minds-backend/v1/ideas/list/`,
          `${TRADINGVIEW_ORIGIN}/profile-backend/v1/user/${profileData.userId}/ideas/`,
          `${TRADINGVIEW_ORIGIN}/u/${profileData.username}/published-charts/`
        ]
        
        let ideasResponse: Response | null = null
        let ideasData: unknown = null
        
        for (const endpoint of apiEndpoints) {
          try {
            console.log(`💡 [USER PROFILE API] Trying endpoint: ${endpoint}`)
            
            if (endpoint.includes('-backend')) {
              // Try POST request for backend APIs
              const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  'Referer': `${TRADINGVIEW_ORIGIN}/u/${profileData.username}/`,
                  'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                  sort: 'popular',
                  lang: 'de',
                  author: parseInt(profileData.userId),
                  offset: 0,
                  limit: 18
                })
              })
              
              if (response.ok) {
                ideasData = await response.json()
                ideasResponse = response
                console.log(`💡 [USER PROFILE API] Backend API success: ${Object.keys(ideasData).join(', ')}`)
                break
              }
            } else {
              // Try GET request for profile pages
              const response = await fetch(endpoint, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
                  'Referer': `${TRADINGVIEW_ORIGIN}/u/${profileData.username}/`,
                },
              })
              
              if (response.ok) {
                ideasResponse = response
                break
              }
            }
          } catch (error) {
            console.log(`💡 [USER PROFILE API] Endpoint ${endpoint} failed:`, error.message)
            continue
          }
        }
        
        if (ideasResponse && ideasResponse.ok) {
          const ideasHtml = await ideasResponse.text()
          console.log(`💡 [USER PROFILE API] Fetched ideas page, size: ${ideasHtml.length} chars`)
          
          // Extract idea cards from the dedicated ideas page
          const ideaCards = ideasHtml.match(/<article[^>]*class="[^"]*idea-card[^"]*"[^>]*>[\s\S]*?<\/article>/g) || []
          console.log(`💡 [USER PROFILE API] Found ${ideaCards.length} idea cards in ideas page`)
          
          if (ideaCards.length > 0) {
            const extractedIdeas = ideaCards.map((cardHtml, index) => {
              try {
                // Extract title
                const titleMatch = cardHtml.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/) || 
                                  cardHtml.match(/data-name="open-idea-popup"[^>]*>([^<]+)<\/a>/)
                const title = titleMatch ? titleMatch[1].trim() : null
                
                // Extract URL
                const urlMatch = cardHtml.match(/href="([^"]*tradingview\.com[^"]*)"/)
                const url = urlMatch ? urlMatch[1] : null
                
                // Extract content
                const contentMatch = cardHtml.match(/<span[^>]*class="[^"]*line-clamp-content[^"]*"[^>]*>([\s\S]*?)<\/span>/)
                let content = null
                if (contentMatch) {
                  content = contentMatch[1]
                    .replace(/<[^>]*>/g, '')
                    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
                    .replace(/\s+/g, ' ').trim().substring(0, 800)
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
                  index: index + 1,
                  title, url, content, symbol, imageUrl,
                  author: profileData.username,
                  publishedAt, comments, boosts, isEditorsPick, strategy,
                  chartId: url ? url.split('/').pop() : null
                }
              } catch (error) {
                console.error(`💡 [USER PROFILE API] Error parsing idea ${index + 1}:`, error)
                return { index: index + 1, error: error.message, title: 'Parse Error' }
              }
            })
            
            const validIdeas = extractedIdeas.filter(i => !i.error)
            if (validIdeas.length > 0) {
              profileData.extractedIdeas = validIdeas
              console.log(`💡 [USER PROFILE API] Successfully extracted ${validIdeas.length} LIVE ideas`)
              
              // Log sample of extracted ideas
              validIdeas.slice(0, 3).forEach(idea => {
                console.log(`  - "${idea.title}" (${idea.symbol || 'N/A'}) - ${idea.comments} comments, ${idea.boosts} boosts`)
              })
            }
          }
        } else {
          console.log(`💡 [USER PROFILE API] No valid ideas response found (all endpoints failed or returned errors)`)
        }
      } catch (ideasError) {
        console.error('💡 [USER PROFILE API] Error fetching live ideas:', ideasError)
      }
    }
    
    // Store the final extracted profile data
    extractionLog.extractedProfile = profileData
    
    // Log only the relevant extraction summary (not the massive feature toggle data)
    console.log('📊 [USER PROFILE API] EXTRACTION SUMMARY:', {
      timestamp: extractionLog.timestamp,
      username: extractionLog.username,
      success: extractionLog.summary.extractionSuccess,
      dataSource: extractionLog.summary.dataSource,
      totalScripts: extractionLog.summary.totalJsonScripts,
      relevantScripts: extractionLog.summary.relevantJsonScripts,
      extractedIdeas: profileData.extractedIdeas?.length || 0,
      profileFields: Object.keys(profileData).filter(key => profileData[key] !== null && key !== 'extractedIdeas').length
    })
    
    // Save raw data to files for analysis
    try {
      const dataDir = join(process.cwd(), 'profile-data')
      mkdirSync(dataDir, { recursive: true })
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const username = profileData.username || 'unknown'
      
      // Save complete extraction log
      // Create a clean log without the massive feature toggle data
      const cleanLog = {
        ...extractionLog,
        relevantData: {
          ...extractionLog.relevantData,
          jsVariables: extractionLog.relevantData.jsVariables ? {
            environment: extractionLog.relevantData.jsVariables.environment,
            locale: extractionLog.relevantData.jsVariables.locale,
            language: extractionLog.relevantData.jsVariables.language,
            buildTime: extractionLog.relevantData.jsVariables.buildTime,
            countryCode: extractionLog.relevantData.jsVariables.countryCode
            // Exclude the massive featureToggleState
          } : undefined
        }
      }
      
      const logFilename = `${username}_${timestamp}_complete.json`
      writeFileSync(join(dataDir, logFilename), JSON.stringify(cleanLog, null, 2))
      
      // Save raw HTML
      const htmlFilename = `${username}_${timestamp}_raw.html`
      writeFileSync(join(dataDir, htmlFilename), html)
      
      // Save just the profile data
      const profileFilename = `${username}_${timestamp}_profile.json`
      writeFileSync(join(dataDir, profileFilename), JSON.stringify(profileData, null, 2))
      
      console.log('💾 [USER PROFILE API] Raw data saved to files:', {
        completeLog: logFilename,
        rawHtml: htmlFilename,
        profileData: profileFilename
      })
      
      console.log('📊 [USER PROFILE API] Extraction Summary:', {
        success: extractionLog.summary.extractionSuccess,
        dataSource: extractionLog.summary.dataSource,
        totalScripts: extractionLog.summary.totalJsonScripts,
        relevantScripts: extractionLog.summary.relevantJsonScripts,
        totalMetaTags: extractionLog.summary.totalMetaTags,
        relevantMetaTags: extractionLog.summary.relevantMetaTags
      })
    } catch (saveError) {
      console.error('❌ [USER PROFILE API] Error saving raw data:', saveError)
    }
    
    console.log('👤 [USER PROFILE API] Parsed profile data:', profileData)

    // Cache the profile to database (if we have a username)
    if (profileData.username && useCache) {
      try {
        await cacheProfile(profileData)
        console.log('💾 [USER PROFILE API] Profile cached to database:', profileData.username)
      } catch (cacheError) {
        console.warn('⚠️ [USER PROFILE API] Failed to cache profile:', cacheError)
        // Don't fail the request if caching fails
      }
    }

    return NextResponse.json({
      ...profileData,
      _cached: false,
      _cacheSource: 'live'
    }, { headers: corsHeaders })

  } catch (error) {
    console.error('❌ [USER PROFILE API] Error fetching user profile:', error)
    
    // Try to serve from cache on error
    if (username) {
      try {
        const cachedProfile = await getCachedProfile(username)
        if (cachedProfile) {
          console.log('🔄 [USER PROFILE API] Serving stale cache due to error:', username)
          return NextResponse.json({
            ...cachedProfile,
            _cached: true,
            _cacheSource: 'database_fallback',
            _error: error instanceof Error ? error.message : 'Unknown error'
          }, { headers: corsHeaders })
        }
      } catch (cacheError) {
        console.warn('⚠️ [USER PROFILE API] Cache fallback also failed:', cacheError)
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch user profile',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500, headers: corsHeaders }
    )
  }
}

function parseProfileFromHTML(html: string, userId: string, extractionLog?: ExtractionLog) {
  // Extract comprehensive profile information from HTML
  const profileData: {
    userId: string
    username: string | null
    displayName: string | null
    bio: string | null
    location: string | null
    website: string | null
    joinDate: string | null
    followers: number | null
    following: number | null
    ideas: number | null
    scripts: number | null
    reputation: number | null
    badges: string[]
    avatar: string | null
    isOwner: boolean | null
    isFollowed: boolean | null
    isInactive: boolean | null
    isOnline: boolean | null
    lastLogin: string | null
    socialLinks: Array<{name?: string; url?: string} | string>
    canEditBio: boolean | null
    canCreateScriptsPackages: boolean | null
    paidSpace: Record<string, unknown> | null
    banInfo: Record<string, unknown> | null
    metaDescription: string | null
    ogImage: string | null
    pageTitle: string | null
  } = {
    userId,
    username: null,
    displayName: null,
    bio: null,
    location: null,
    website: null,
    joinDate: null,
    followers: null,
    following: null,
    ideas: null,
    scripts: null,
    reputation: null,
    badges: [],
    avatar: null,
    isOwner: null,
    isFollowed: null,
    isInactive: null,
    isOnline: null,
    lastLogin: null,
    socialLinks: [],
    canEditBio: null,
    canCreateScriptsPackages: null,
    paidSpace: null,
    banInfo: null,
    metaDescription: null,
    ogImage: null,
    pageTitle: null
  }

  try {
    // Extract JSON data from script tags to find the profile data
    const jsonScriptMatches = html.match(/<script type="application\/prs\.init-data\+json">([^<]+)<\/script>/gi)
    const totalScripts = jsonScriptMatches ? jsonScriptMatches.length : 0
    console.log(`📊 [USER PROFILE API] Found ${totalScripts} JSON script tags`)
    
    if (extractionLog) {
      extractionLog.summary.totalJsonScripts = totalScripts
    }
    
    if (jsonScriptMatches) {
      for (let i = 0; i < jsonScriptMatches.length; i++) {
        try {
          const match = jsonScriptMatches[i].match(/>([^<]+)</)
          if (!match) continue
          const jsonContent = match[1]
          const jsonData = JSON.parse(jsonContent)
          
          // Log ALL scripts - we want everything!
          console.log(`📊 [USER PROFILE API] Script ${i + 1} keys:`, Object.keys(jsonData))
          
          if (extractionLog) {
            extractionLog.summary.relevantJsonScripts++
            
            // Store ALL script data for analysis
            if (!extractionLog.relevantData.allJsonScripts) {
              extractionLog.relevantData.allJsonScripts = []
            }
            extractionLog.relevantData.allJsonScripts.push({
              scriptIndex: i + 1,
              keys: Object.keys(jsonData),
              data: jsonData
            })
          }
          
          // Look for profile data in any of the JSON structures
          for (const key in jsonData) {
            const data = jsonData[key]
            
            // Extract Profile script data (contains ideas, scripts, detailed stats)
            if (key === 'Profile' && data) {
              console.log('📊 [USER PROFILE API] Found Profile script with detailed data')
              
              if (data.filtersData) {
                console.log('📊 [USER PROFILE API] Profile filters:', Object.keys(data.filtersData))
              }
              
              if (data.pages && data.pages['published-charts']) {
                const chartData = data.pages['published-charts']
                if (chartData.results) {
                  console.log('📊 [USER PROFILE API] Chart results:', chartData.results)
                  profileData.ideas = chartData.results.total || profileData.ideas
                }
              }
            }
            
            // Extract main menu categories and navigation data
            if (key === 'mainMenuCategories' && Array.isArray(data)) {
              console.log('📊 [USER PROFILE API] Found navigation menu data with', data.length, 'categories')
            }
            
            // Extract feature toggle states
            if (key.includes('featureToggleState') || (typeof data === 'object' && data && Object.keys(data).some(k => k.includes('broker_') || k.includes('enable_')))) {
              console.log('📊 [USER PROFILE API] Found feature flags:', Object.keys(data).length, 'features')
            }
            
            // Check for ssrData structure (this is where the comprehensive profile data is!)
            if (data && data.ssrData && data.ssrData.username) {
              const ssrData = data.ssrData
              const stats = ssrData.statistics || {}
              
              console.log('✅ [USER PROFILE API] Found ssrData with comprehensive profile information')
              
              // Store the relevant ssrData in our log (filtered)
              if (extractionLog) {
                extractionLog.relevantData.ssrData = {
                  username: ssrData.username,
                  statistics: stats,
                  bio: ssrData.bio,
                  location: ssrData.location,
                  website: ssrData.website,
                  joinDate: ssrData.joinDate,
                  avatar: ssrData.avatar,
                  socialLinks: ssrData.socialLinks
                }
                extractionLog.summary.extractionSuccess = true
                extractionLog.summary.dataSource = 'ssrData'
              }
              
              // Basic profile data
              profileData.username = ssrData.username
              profileData.followers = stats.followers || null
              profileData.following = stats.following || null
              profileData.ideas = stats.charts_total || stats.charts || stats.ideas || null
              profileData.scripts = stats.scripts_total ?? stats.scripts ?? null
              profileData.reputation = stats.reputation || null
              
              // Enhanced profile data
              profileData.isOwner = ssrData.is_owner || null
              profileData.isFollowed = ssrData.is_followed || null
              profileData.isInactive = ssrData.is_inactive || null
              profileData.isOnline = ssrData.is_online || null
              profileData.canEditBio = ssrData.can_edit_bio || null
              profileData.canCreateScriptsPackages = ssrData.can_create_scripts_packages || null
              profileData.paidSpace = ssrData.paid_space || null
              profileData.banInfo = ssrData.ban_info || null
              profileData.socialLinks = ssrData.social_links || []
              
              // Avatar - prefer original size
              if (ssrData.picture_url_orig) {
                profileData.avatar = ssrData.picture_url_orig
              } else if (ssrData.picture_url) {
                profileData.avatar = ssrData.picture_url
              }
              
              // Dates
              if (ssrData.date_joined) {
                const joinDate = new Date(ssrData.date_joined)
                profileData.joinDate = joinDate.toISOString()
              }
              if (ssrData.last_login) {
                const lastLogin = new Date(ssrData.last_login)
                profileData.lastLogin = lastLogin.toISOString()
              }
              
              // Bio
              if (ssrData.bio) {
                profileData.bio = ssrData.bio
              }
              
              // Badges - extract badge names
              if (ssrData.badges && Array.isArray(ssrData.badges)) {
                profileData.badges = ssrData.badges.map((badge: unknown) => {
                  if (typeof badge === 'string') return badge
                  if (badge && typeof badge === 'object' && 'name' in badge) return String((badge as {name: unknown}).name)
                  if (badge && typeof badge === 'object' && 'verbose_name' in badge) return String((badge as {verbose_name: unknown}).verbose_name)
                  return String(badge)
                })
              }
              
              console.log('✅ [USER PROFILE API] Extracted comprehensive data from ssrData:', {
                username: profileData.username,
                followers: profileData.followers,
                following: profileData.following,
                ideas: profileData.ideas,
                scripts: profileData.scripts,
                avatar: profileData.avatar,
                isOnline: profileData.isOnline,
                badges: profileData.badges,
                socialLinks: profileData.socialLinks?.length || 0
              })
              
              // Found the data, continue to extract meta data and then return
              break
            }
            
            // Fallback: Check for direct structure
            if (data && data.username && data.statistics) {
              profileData.username = data.username
              profileData.followers = data.statistics.followers || null
              profileData.following = data.statistics.following || null
              profileData.ideas = data.statistics.charts_total || data.statistics.charts || null
              profileData.scripts = data.statistics.scripts_total || data.statistics.scripts || null
              
              console.log('✅ [USER PROFILE API] Extracted data from direct structure:', {
                username: profileData.username,
                followers: profileData.followers,
                following: profileData.following,
                ideas: profileData.ideas,
                scripts: profileData.scripts
              })
              
              return profileData
            }
          }
        } catch (jsonError) {
          console.log(`⚠️ [USER PROFILE API] Error parsing JSON script ${i + 1}:`, jsonError instanceof Error ? jsonError.message : 'Unknown error')
          continue
        }
      }
    }

    // Extract meta data and page information
    console.log('📄 [USER PROFILE API] Extracting meta data...')
    
    // Extract relevant meta tags for logging
    if (extractionLog) {
      const allMetaTags = html.match(/<meta[^>]+>/gi) || []
      const relevantMetaTags = allMetaTags.filter(tag => 
        tag.includes('description') || tag.includes('title') || tag.includes('image') || tag.includes('og:')
      )
      
      extractionLog.summary.totalMetaTags = allMetaTags.length
      extractionLog.summary.relevantMetaTags = relevantMetaTags.length
      
      // Parse and store only relevant meta tags
      extractionLog.relevantData.keyMetaTags = relevantMetaTags.map(tag => {
        const nameMatch = tag.match(/name="([^"]+)"/)
        const propertyMatch = tag.match(/property="([^"]+)"/)
        const contentMatch = tag.match(/content="([^"]+)"/)
        
        return {
          name: nameMatch ? nameMatch[1] : undefined,
          property: propertyMatch ? propertyMatch[1] : undefined,
          content: contentMatch ? contentMatch[1] : undefined
        }
      })
    }
    
    // Extract page title
    const titleMatch = html.match(/<title[^>]*>([^<]+)/i)
    if (titleMatch) {
      profileData.pageTitle = titleMatch[1].trim()
      console.log('📄 Page title:', profileData.pageTitle)
    }

    // Extract meta description
    const descriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    if (descriptionMatch) {
      profileData.metaDescription = descriptionMatch[1].trim()
      console.log('📄 Meta description:', profileData.metaDescription)
    }

    // Extract Open Graph image
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    if (ogImageMatch) {
      profileData.ogImage = ogImageMatch[1].trim()
      console.log('🖼️ OG Image:', profileData.ogImage)
    }

    // Extract additional HTML patterns and JavaScript variables
    if (extractionLog) {
      // Look for follower/following counts in HTML
      extractionLog.relevantData.htmlPatterns.followerMatches = html.match(/(\d+(?:,\d+)*)\s*(?:Followers?|followers?)/gi) || []
      extractionLog.relevantData.htmlPatterns.followingMatches = html.match(/(\d+(?:,\d+)*)\s*(?:Following|following)/gi) || []
      extractionLog.relevantData.htmlPatterns.ideasMatches = html.match(/(\d+(?:,\d+)*)\s*(?:Ideas?|ideas?)/gi) || []
      extractionLog.relevantData.htmlPatterns.joinDateMatches = html.match(/(?:Seit|Since|Joined)\s+([^<\n]+)/gi) || []
      
      // Extract JavaScript variables from script tags
      const jsVariables = {
        featureToggleState: html.match(/var featureToggleState = ({[^}]+});/)?.[1],
        environment: html.match(/var environment = "([^"]+)"/)?.[1],
        locale: html.match(/window\.locale = '([^']+)'/)?.[1],
        language: html.match(/window\.language = '([^']+)'/)?.[1],
        buildTime: html.match(/window\.BUILD_TIME = "([^"]+)"/)?.[1],
        countryCode: html.match(/window\.countryCode = "([^"]+)"/)?.[1]
      }
      
      // Store non-null JS variables
      const validJsVars = Object.fromEntries(
        Object.entries(jsVariables).filter(([, value]) => value !== undefined)
      )
      
      if (Object.keys(validJsVars).length > 0) {
        console.log('📊 [USER PROFILE API] Found JS variables:', Object.keys(validJsVars))
        extractionLog.relevantData.jsVariables = validJsVars
      }
      
      console.log('📊 [USER PROFILE API] HTML Patterns found:', {
        followers: extractionLog.relevantData.htmlPatterns.followerMatches.length,
        following: extractionLog.relevantData.htmlPatterns.followingMatches.length,
        ideas: extractionLog.relevantData.htmlPatterns.ideasMatches.length,
        joinDates: extractionLog.relevantData.htmlPatterns.joinDateMatches.length
      })
      
      // Extract IDEAS content from HTML - the actual article cards
      const ideaCards = html.match(/<article[^>]*class="[^"]*idea-card[^"]*"[^>]*>[\s\S]*?<\/article>/g) || []
      console.log(`💡 [USER PROFILE API] Found ${ideaCards.length} idea cards in HTML`)
      
      if (ideaCards.length > 0) {
        extractionLog.relevantData.ideas = ideaCards.map((cardHtml, index) => {
          try {
            // Extract title (more robust pattern)
            const titleMatch = cardHtml.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/) || 
                              cardHtml.match(/data-name="open-idea-popup"[^>]*>([^<]+)<\/a>/)
            const title = titleMatch ? titleMatch[1].trim() : null
            
            // Extract URL
            const urlMatch = cardHtml.match(/href="([^"]*tradingview\.com[^"]*)"/)
            const url = urlMatch ? urlMatch[1] : null
            
            // Extract preview text/content (more comprehensive)
            const contentMatch = cardHtml.match(/<span[^>]*class="[^"]*line-clamp-content[^"]*"[^>]*>([\s\S]*?)<\/span>/)
            let content = null
            if (contentMatch) {
              content = contentMatch[1]
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/&gt;/g, '>') // Decode entities
                .replace(/&lt;/g, '<')
                .replace(/&amp;/g, '&')
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim()
                .substring(0, 800) // Longer preview
            }
            
            // Extract symbol/instrument
            const symbolMatch = cardHtml.match(/\/symbols\/([^/]+)\//) || 
                               cardHtml.match(/title="([^"]*:[^"]*)"/) ||
                               cardHtml.match(/alt="([^"]*:[^"]*)"/)
            const symbol = symbolMatch ? symbolMatch[1] : null
            
            // Extract image URL (chart preview)
            const imageMatch = cardHtml.match(/src="(https:\/\/s3\.tradingview\.com\/[^"]+)"/g)
            const imageUrl = imageMatch ? imageMatch[imageMatch.length - 1].match(/src="([^"]+)"/)?.[1] : null
            
            // Extract author
            const authorMatch = cardHtml.match(/data-username="([^"]+)"/)
            const author = authorMatch ? authorMatch[1] : null
            
            // Extract timestamp
            const timeMatch = cardHtml.match(/datetime="([^"]+)"/)
            const publishedAt = timeMatch ? timeMatch[1] : null
            
            // Extract engagement metrics
            const commentsMatch = cardHtml.match(/aria-label="(\d+) Kommentare?"/)
            const comments = commentsMatch ? parseInt(commentsMatch[1]) : 0
            
            const boostsMatch = cardHtml.match(/aria-label="(\d+) Booster"/)
            const boosts = boostsMatch ? parseInt(boostsMatch[1]) : 0
            
            // Check if it's an Editor's Pick
            const isEditorsPick = cardHtml.includes('badge-editors-pick') || cardHtml.includes('Editors\' Picks')
            
            // Extract strategy type (Long/Short)
            const strategyMatch = cardHtml.match(/title="(Long|Short)"/)
            const strategy = strategyMatch ? strategyMatch[1] : null
            
            return {
              index: index + 1,
              title,
              url,
              content,
              symbol,
              imageUrl,
              author,
              publishedAt,
              comments,
              boosts,
              isEditorsPick,
              strategy,
              chartId: url ? url.split('/').pop() : null
            }
          } catch (error) {
            console.error(`💡 [USER PROFILE API] Error parsing idea card ${index + 1}:`, error)
            return {
              index: index + 1,
              error: error.message,
              title: 'Parse Error'
            }
          }
        })
        
        const successfulIdeas = extractionLog.relevantData.ideas.filter(i => !i.error)
        console.log(`💡 [USER PROFILE API] Successfully parsed ${successfulIdeas.length} ideas`)
        
        // Log summary of extracted ideas
        if (successfulIdeas.length > 0) {
          console.log('💡 [USER PROFILE API] Ideas Summary:')
          successfulIdeas.slice(0, 5).forEach(idea => {
            console.log(`  - "${idea.title}" (${idea.symbol || 'Unknown'}) - ${idea.comments} comments, ${idea.boosts} boosts`)
          })
        }
      }
      
      // If we found data via HTML patterns and not ssrData, mark as successful
      if (!extractionLog.summary.extractionSuccess && 
          (extractionLog.relevantData.htmlPatterns.followerMatches.length || 
           extractionLog.relevantData.htmlPatterns.followingMatches.length || 
           extractionLog.relevantData.htmlPatterns.ideasMatches.length)) {
        extractionLog.summary.extractionSuccess = true
        extractionLog.summary.dataSource = 'htmlPatterns'
      }
    }

    // Fallback: Extract username from title
    if (!profileData.username) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)/i)
      if (titleMatch) {
        const title = titleMatch[1]
        const usernameMatch = title.match(/^([^—]+)/)
        if (usernameMatch) {
          profileData.username = usernameMatch[1].trim()
        }
      }
    }

    // Fallback: Extract join date from HTML
    const joinDateMatch = html.match(/Seit\s+(\d+)\.\s*(\w+)\.\s*(\d+)\s+dabei/i)
    if (joinDateMatch) {
      const monthMap: { [key: string]: string } = {
        'Jan': '01', 'Feb': '02', 'Mär': '03', 'Apr': '04', 'Mai': '05', 'Jun': '06',
        'Jul': '07', 'Aug': '08', 'Sep': '09', 'Okt': '10', 'Nov': '11', 'Dez': '12'
      }
      const month = monthMap[joinDateMatch[2]] || '01'
      profileData.joinDate = `${joinDateMatch[3]}-${month}-${joinDateMatch[1].padStart(2, '0')}`
    }

    // Extract avatar URL
    const avatarMatch = html.match(/userpics\/[^"]+/i)
    if (avatarMatch) {
      profileData.avatar = `https://s3.tradingview.com/${avatarMatch[0]}`
    }

    // Extract bio/description
    const bioMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    if (bioMatch) {
      profileData.bio = bioMatch[1]
    }

    console.log('✅ [USER PROFILE API] Successfully parsed profile data')
    
  } catch (parseError) {
    console.error('⚠️ [USER PROFILE API] Error parsing HTML:', parseError)
  }

  return profileData
}
