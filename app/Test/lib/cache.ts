import { promises as fs } from 'fs'
import path from 'path'

// Cache directory
const CACHE_DIR = path.join(process.cwd(), 'cache', 'ideas')

// Cache expiration time (24 hours in milliseconds)
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000

export interface CachedIdea {
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
  page: number
}

export interface CacheEntry {
  username: string
  page: number
  ideas: CachedIdea[]
  hasNextPage: boolean
  timestamp: number
  source: string
}

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true })
  } catch (error) {
    console.error('Failed to create cache directory:', error)
  }
}

// Generate cache key for a user's page
function getCacheKey(username: string, page: number): string {
  return `${username}_page_${page}.json`
}

// Get cache file path
function getCacheFilePath(username: string, page: number): string {
  return path.join(CACHE_DIR, getCacheKey(username, page))
}

// Check if cache entry is valid (not expired)
function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_EXPIRATION
}

// Get cached ideas for a specific page
export async function getCachedIdeas(username: string, page: number): Promise<CacheEntry | null> {
  try {
    await ensureCacheDir()
    
    const filePath = getCacheFilePath(username, page)
    const data = await fs.readFile(filePath, 'utf-8')
    const cacheEntry: CacheEntry = JSON.parse(data)
    
    // Check if cache is still valid
    if (isCacheValid(cacheEntry.timestamp)) {
      console.log(`📋 Cache HIT: ${username} page ${page} (${cacheEntry.ideas.length} ideas)`)
      return cacheEntry
    } else {
      console.log(`⏰ Cache EXPIRED: ${username} page ${page}`)
      // Delete expired cache file
      await fs.unlink(filePath).catch(() => {}) // Ignore errors
      return null
    }
  } catch {
    // Cache miss or error reading cache
    console.log(`📋 Cache MISS: ${username} page ${page}`)
    return null
  }
}

// Cache ideas for a specific page
export async function setCachedIdeas(
  username: string, 
  page: number, 
  ideas: CachedIdea[], 
  hasNextPage: boolean,
  source: string = 'live_puppeteer_single_page'
): Promise<void> {
  try {
    await ensureCacheDir()
    
    const cacheEntry: CacheEntry = {
      username,
      page,
      ideas,
      hasNextPage,
      timestamp: Date.now(),
      source
    }
    
    const filePath = getCacheFilePath(username, page)
    await fs.writeFile(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8')
    
    console.log(`💾 Cache SAVED: ${username} page ${page} (${ideas.length} ideas)`)
  } catch (error) {
    console.error(`Failed to cache ideas for ${username} page ${page}:`, error)
  }
}

// Get all cached pages for a user (useful for loading existing data)
export async function getAllCachedPages(username: string): Promise<number[]> {
  try {
    await ensureCacheDir()
    
    const files = await fs.readdir(CACHE_DIR)
    const userFiles = files.filter(file => 
      file.startsWith(`${username}_page_`) && file.endsWith('.json')
    )
    
    const pages = userFiles
      .map(file => {
        const match = file.match(new RegExp(`${username}_page_(\\d+)\\.json`))
        return match ? parseInt(match[1], 10) : null
      })
      .filter((page): page is number => page !== null)
      .sort((a, b) => a - b)
    
    // Filter out expired pages
    const validPages: number[] = []
    for (const page of pages) {
      const cached = await getCachedIdeas(username, page)
      if (cached) {
        validPages.push(page)
      }
    }
    
    return validPages
  } catch (error) {
    console.error(`Failed to get cached pages for ${username}:`, error)
    return []
  }
}

// Clear all cache for a user
export async function clearUserCache(username: string): Promise<void> {
  try {
    await ensureCacheDir()
    
    const files = await fs.readdir(CACHE_DIR)
    const userFiles = files.filter(file => 
      file.startsWith(`${username}_page_`) && file.endsWith('.json')
    )
    
    for (const file of userFiles) {
      await fs.unlink(path.join(CACHE_DIR, file))
    }
    
    console.log(`🗑️ Cleared cache for user: ${username} (${userFiles.length} files)`)
  } catch (error) {
    console.error(`Failed to clear cache for ${username}:`, error)
  }
}

// Clear expired cache entries for all users
export async function clearExpiredCache(): Promise<void> {
  try {
    await ensureCacheDir()
    
    const files = await fs.readdir(CACHE_DIR)
    let clearedCount = 0
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      
      try {
        const filePath = path.join(CACHE_DIR, file)
        const data = await fs.readFile(filePath, 'utf-8')
        const cacheEntry: CacheEntry = JSON.parse(data)
        
        if (!isCacheValid(cacheEntry.timestamp)) {
          await fs.unlink(filePath)
          clearedCount++
        }
      } catch {
        // If we can't read the file, delete it
        await fs.unlink(path.join(CACHE_DIR, file)).catch(() => {})
        clearedCount++
      }
    }
    
    if (clearedCount > 0) {
      console.log(`🧹 Cleared ${clearedCount} expired cache files`)
    }
  } catch (error) {
    console.error('Failed to clear expired cache:', error)
  }
}

// Get cache statistics
export async function getCacheStats(): Promise<{
  totalFiles: number
  totalUsers: number
  oldestEntry: number | null
  newestEntry: number | null
}> {
  try {
    await ensureCacheDir()
    
    const files = await fs.readdir(CACHE_DIR)
    const jsonFiles = files.filter(file => file.endsWith('.json'))
    
    const users = new Set<string>()
    let oldestTimestamp: number | null = null
    let newestTimestamp: number | null = null
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(CACHE_DIR, file)
        const data = await fs.readFile(filePath, 'utf-8')
        const cacheEntry: CacheEntry = JSON.parse(data)
        
        users.add(cacheEntry.username)
        
        if (oldestTimestamp === null || cacheEntry.timestamp < oldestTimestamp) {
          oldestTimestamp = cacheEntry.timestamp
        }
        
        if (newestTimestamp === null || cacheEntry.timestamp > newestTimestamp) {
          newestTimestamp = cacheEntry.timestamp
        }
      } catch {
        // Skip invalid files
      }
    }
    
    return {
      totalFiles: jsonFiles.length,
      totalUsers: users.size,
      oldestEntry: oldestTimestamp,
      newestEntry: newestTimestamp
    }
  } catch (error) {
    console.error('Failed to get cache stats:', error)
    return {
      totalFiles: 0,
      totalUsers: 0,
      oldestEntry: null,
      newestEntry: null
    }
  }
}
