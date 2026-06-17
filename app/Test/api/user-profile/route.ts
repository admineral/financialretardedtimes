/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getCachedProfile, isProfileFresh, cacheProfile } from '../../lib/db-cache'
import { profileLogger as log } from '@/lib/logger'

const TRADINGVIEW_ORIGIN = 'https://de.tradingview.com'

// Profile cache TTL in hours (24 hours)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    
    log.debug('POST: Parsing ideas from HTML', { username, htmlSize: htmlContent.length })
    
    // Extract ideas directly from the provided HTML content
    let ideaCards = htmlContent.match(/<article[^>]*class="[^"]*idea-card-R05xWTMw[^"]*"[^>]*>[\s\S]*?<\/article>/g) || []
    
    if (ideaCards.length === 0) {
      ideaCards = htmlContent.match(/<article[^>]*class="[^"]*idea-card[^"]*"[^>]*>[\s\S]*?<\/article>/g) || []
    }
    
    if (ideaCards.length === 0) {
      return NextResponse.json({
        username,
        ideas: [],
        message: 'No idea cards found in provided HTML'
      }, { headers: corsHeaders })
    }
    
    const extractedIdeas = ideaCards.map((cardHtml, index) => parseIdeaCard(cardHtml, index, username))
    const validIdeas = extractedIdeas.filter(i => !i.error)
    
    log.info('Ideas extracted from POST', { username, count: validIdeas.length })
    
    return NextResponse.json({
      username,
      totalExtracted: validIdeas.length,
      ideas: validIdeas,
      errors: extractedIdeas.filter(i => i.error).length
    }, { headers: corsHeaders })
    
  } catch (error) {
    log.error('POST request failed', error)
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
  const useCache = searchParams.get('useCache') !== 'false'

  if (!userId && !username) {
    return NextResponse.json(
      { error: 'userId or username parameter is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  const identifier = username || userId || 'unknown'

  // Check database cache first (if enabled and not forcing refresh)
  if (useCache && !forceRefresh && username) {
    try {
      const isFresh = await isProfileFresh(username)
      if (isFresh) {
        const cachedProfile = await getCachedProfile(username)
        if (cachedProfile) {
          log.debug('Cache hit', { username })
          return NextResponse.json({
            ...cachedProfile,
            _cached: true,
            _cacheSource: 'database'
          }, { headers: corsHeaders })
        }
      }
    } catch (cacheError) {
      log.warn('Cache check failed', { username, error: cacheError instanceof Error ? cacheError.message : 'Unknown' })
    }
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

        if (testResponse.ok) {
          response = testResponse
          break
        }
      } catch {
        continue
      }
    }

    if (!response || !response.ok) {
      log.debug('Profile not accessible, returning limited data', { identifier })
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
    
    // Parse comprehensive profile information from HTML
    const profileData = parseProfileFromHTML(html, userId || username || 'unknown')
    
    // Fetch LIVE ideas content
    if (profileData.userId) {
      try {
        const ideasResponse = await fetch(`${TRADINGVIEW_ORIGIN}/u/${profileData.username}/published-charts/`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            'Referer': `${TRADINGVIEW_ORIGIN}/u/${profileData.username}/`,
          },
        })
        
        if (ideasResponse.ok) {
          const ideasHtml = await ideasResponse.text()
          const ideaCards = ideasHtml.match(/<article[^>]*class="[^"]*idea-card[^"]*"[^>]*>[\s\S]*?<\/article>/g) || []
          
          if (ideaCards.length > 0) {
            const extractedIdeas = ideaCards.map((cardHtml, index) => parseIdeaCard(cardHtml, index, profileData.username))
            const validIdeas = extractedIdeas.filter(i => !i.error)
            if (validIdeas.length > 0) {
              profileData.extractedIdeas = validIdeas
            }
          }
        }
      } catch {
        // Ideas fetch failed silently - not critical
      }
    }

    // Cache the profile to database
    if (profileData.username && useCache) {
      try {
        await cacheProfile(profileData)
        log.debug('Profile cached', { username: profileData.username })
      } catch {
        // Cache failure is not critical
      }
    }

    log.info('Profile fetched', { 
      username: profileData.username, 
      followers: profileData.followers,
      ideas: profileData.ideas 
    })

    return NextResponse.json({
      ...profileData,
      _cached: false,
      _cacheSource: 'live'
    }, { headers: corsHeaders })

  } catch (error) {
    log.error('Failed to fetch profile', error, { identifier })
    
    // Try to serve from cache on error
    if (username) {
      try {
        const cachedProfile = await getCachedProfile(username)
        if (cachedProfile) {
          log.info('Serving stale cache due to error', { username })
          return NextResponse.json({
            ...cachedProfile,
            _cached: true,
            _cacheSource: 'database_fallback',
            _error: error instanceof Error ? error.message : 'Unknown error'
          }, { headers: corsHeaders })
        }
      } catch {
        // Cache fallback also failed
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

/**
 * Parse an individual idea card from HTML
 */
function parseIdeaCard(cardHtml: string, index: number, username: string | null) {
  try {
    const titleMatch = cardHtml.match(/class="[^"]*title-tkslJwxl[^"]*"[^>]*>([^<]+)<\/a>/) || 
                      cardHtml.match(/data-name="open-idea-popup"[^>]*>([^<]+)<\/a>/) ||
                      cardHtml.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/)
    const title = titleMatch ? titleMatch[1].trim() : null
    
    const urlMatch = cardHtml.match(/href="([^"]*tradingview\.com[^"]*)"/)
    const url = urlMatch ? urlMatch[1] : null
    
    const contentMatch = cardHtml.match(/<span[^>]*class="[^"]*line-clamp-content-t3qFZvNN[^"]*"[^>]*>([\s\S]*?)<\/span>/) ||
                        cardHtml.match(/<span[^>]*class="[^"]*line-clamp-content[^"]*"[^>]*>([\s\S]*?)<\/span>/)
    let content = null
    if (contentMatch) {
      content = contentMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ').trim().substring(0, 800)
    }
    
    const symbolMatch = cardHtml.match(/\/symbols\/([^/]+)\//) || 
                       cardHtml.match(/title="([^"]*:[^"]*)"/)
    const symbol = symbolMatch ? symbolMatch[1] : null
    
    const imageMatch = cardHtml.match(/src="(https:\/\/s3\.tradingview\.com\/[^"]+)"/g)
    const imageUrl = imageMatch ? imageMatch[imageMatch.length - 1].match(/src="([^"]+)"/)?.[1] : null
    
    const timeMatch = cardHtml.match(/datetime="([^"]+)"/)
    const publishedAt = timeMatch ? timeMatch[1] : null
    
    const commentsMatch = cardHtml.match(/aria-label="(\d+) Kommentare?"/)
    const comments = commentsMatch ? parseInt(commentsMatch[1]) : 0
    
    const boostsMatch = cardHtml.match(/aria-label="(\d+) Booster"/)
    const boosts = boostsMatch ? parseInt(boostsMatch[1]) : 0
    
    const isEditorsPick = cardHtml.includes('badge-editors-pick')
    
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
    return { index: index + 1, error: error.message, title: 'Parse Error' }
  }
}

/**
 * Parse profile data from TradingView HTML
 */
function parseProfileFromHTML(html: string, userId: string) {
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
    extractedIdeas?: unknown[]
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
    // Extract JSON data from script tags
    const jsonScriptMatches = html.match(/<script type="application\/prs\.init-data\+json">([^<]+)<\/script>/gi)
    
    if (jsonScriptMatches) {
      for (const scriptMatch of jsonScriptMatches) {
        try {
          const match = scriptMatch.match(/>([^<]+)</)
          if (!match) continue
          const jsonData = JSON.parse(match[1])
          
          // Look for profile data in any of the JSON structures
          for (const key in jsonData) {
            const data = jsonData[key]
            
            // Check for ssrData structure (comprehensive profile data)
            if (data && data.ssrData && data.ssrData.username) {
              const ssrData = data.ssrData
              const stats = ssrData.statistics || {}
              
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
              
              // Avatar
              profileData.avatar = ssrData.picture_url_orig || ssrData.picture_url || null
              
              // Dates
              if (ssrData.date_joined) {
                profileData.joinDate = new Date(ssrData.date_joined).toISOString()
              }
              if (ssrData.last_login) {
                profileData.lastLogin = new Date(ssrData.last_login).toISOString()
              }
              
              // Bio
              profileData.bio = ssrData.bio || null
              
              // Badges
              if (ssrData.badges && Array.isArray(ssrData.badges)) {
                profileData.badges = ssrData.badges.map((badge: unknown) => {
                  if (typeof badge === 'string') return badge
                  if (badge && typeof badge === 'object' && 'name' in badge) return String((badge as {name: unknown}).name)
                  if (badge && typeof badge === 'object' && 'verbose_name' in badge) return String((badge as {verbose_name: unknown}).verbose_name)
                  return String(badge)
                })
              }
              
              break
            }
            
            // Fallback: Check for direct structure
            if (data && data.username && data.statistics) {
              profileData.username = data.username
              profileData.followers = data.statistics.followers || null
              profileData.following = data.statistics.following || null
              profileData.ideas = data.statistics.charts_total || data.statistics.charts || null
              profileData.scripts = data.statistics.scripts_total || data.statistics.scripts || null
              return profileData
            }
          }
        } catch {
          continue
        }
      }
    }

    // Extract meta data
    const titleMatch = html.match(/<title[^>]*>([^<]+)/i)
    if (titleMatch) {
      profileData.pageTitle = titleMatch[1].trim()
    }

    const descriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    if (descriptionMatch) {
      profileData.metaDescription = descriptionMatch[1].trim()
    }

    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    if (ogImageMatch) {
      profileData.ogImage = ogImageMatch[1].trim()
    }

    // Fallback: Extract username from title
    if (!profileData.username && profileData.pageTitle) {
      const usernameMatch = profileData.pageTitle.match(/^([^—]+)/)
      if (usernameMatch) {
        profileData.username = usernameMatch[1].trim()
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
    if (avatarMatch && !profileData.avatar) {
      profileData.avatar = `https://s3.tradingview.com/${avatarMatch[0]}`
    }

    // Extract bio/description
    if (!profileData.bio) {
      const bioMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      if (bioMatch) {
        profileData.bio = bioMatch[1]
      }
    }
    
  } catch (parseError) {
    log.error('Failed to parse profile HTML', parseError)
  }

  return profileData
}
