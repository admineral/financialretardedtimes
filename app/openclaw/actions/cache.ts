/**
 * OpenClaw - Commit Caching Actions
 * 
 * Server actions for caching GitHub commits in Supabase.
 * Implements incremental sync - only fetches new commits on refresh.
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { CONFIG } from '../lib/config'
import { assertGitHubResponseOk, getGitHubHeaders } from '../lib/github-api'
import type { GitHubCommit, CommitStats } from '../lib/types'

export interface DailyStats {
  date: string
  commitCount: number
  uniqueContributors: number
  mergeCount: number
  firstCommit: string
  lastCommit: string
}

export interface OpenClawSettings {
  defaultDays: number
  maxCommitsPerSync: number
  cacheDurationHours: number
  displayTimezone: string
  defaultLanguage: 'en' | 'de'
  lastSyncAt: string | null
  lastSyncCommitCount: number
}

export interface SyncLog {
  id: string
  syncType: 'incremental' | 'full' | 'initialize'
  status: 'pending' | 'success' | 'error'
  commitsFetched: number
  commitsNew: number
  commitsUpdated: number
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  triggeredBy: 'manual' | 'auto' | 'cron'
}

export interface SyncStats {
  totalSyncs: number
  successfulSyncs: number
  failedSyncs: number
  totalCommitsAdded: number
  avgDurationMs: number | null
  lastSuccessfulSync: string | null
  lastFailedSync: string | null
}

export interface CachedCommit {
  sha: string
  shortSha: string
  message: string
  author: {
    name: string
    email: string
    username: string | null
    avatar: string | null
    profileUrl: string | null
  }
  date: string
  commitDate: string
  url: string
  isMerge: boolean
}

interface GitHubCommitResponse {
  sha: string
  commit: {
    author: { name: string; email: string; date: string }
    message: string
  }
  author: { login: string; avatar_url: string; html_url: string } | null
  html_url: string
  parents: Array<{ sha: string }>
}

interface PaginationInfo {
  hasNextPage: boolean
  nextUrl: string | null
}

const DEFAULT_INCREMENTAL_MAX_PAGES = 3
const DEFAULT_INCREMENTAL_MAX_COMMITS = 300
const COMMIT_UPSERT_CHUNK_SIZE = 500

function isOpenClawDebugEnabled(): boolean {
  return process.env.OPENCLAW_DEBUG_LOGS === 'true'
}

function logSync(message: string, details?: Record<string, unknown>, debugOnly: boolean = false): void {
  if (debugOnly && !isOpenClawDebugEnabled()) {
    return
  }

  if (details) {
    console.log(`[OPENCLAW SYNC] ${message}`, details)
    return
  }

  console.log(`[OPENCLAW SYNC] ${message}`)
}

function getSafeGitHubUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

function parseLinkHeader(linkHeader: string | null): PaginationInfo {
  if (!linkHeader) {
    return { hasNextPage: false, nextUrl: null }
  }
  
  const links = linkHeader.split(',').map(part => {
    const [urlPart, relPart] = part.split(';').map(s => s.trim())
    const url = urlPart.match(/<(.+)>/)?.[1]
    const rel = relPart.match(/rel="(.+)"/)?.[1]
    return { url, rel }
  })
  
  const nextLink = links.find(l => l.rel === 'next')
  return {
    hasNextPage: !!nextLink,
    nextUrl: nextLink?.url || null,
  }
}

/**
 * Fetch settings from database
 */
export async function getSettings(): Promise<OpenClawSettings> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('openclaw_settings')
    .select('*')
    .eq('settings_key', 'default')
    .single()
  
  if (error || !data) {
    return {
      defaultDays: 7,
      maxCommitsPerSync: 100,
      cacheDurationHours: 24,
      displayTimezone: 'UTC',
      defaultLanguage: 'en',
      lastSyncAt: null,
      lastSyncCommitCount: 0,
    }
  }
  
  return {
    defaultDays: data.default_days,
    maxCommitsPerSync: data.max_commits_per_sync,
    cacheDurationHours: data.cache_duration_hours,
    displayTimezone: data.display_timezone,
    defaultLanguage: data.default_language || 'en',
    lastSyncAt: data.last_sync_at,
    lastSyncCommitCount: data.last_sync_commit_count ?? 0,
  }
}

/**
 * Update settings in database
 */
export async function updateSettings(settings: Partial<OpenClawSettings>): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const updateData: Record<string, unknown> = {}
  if (settings.defaultDays !== undefined) updateData.default_days = settings.defaultDays
  if (settings.maxCommitsPerSync !== undefined) updateData.max_commits_per_sync = settings.maxCommitsPerSync
  if (settings.cacheDurationHours !== undefined) updateData.cache_duration_hours = settings.cacheDurationHours
  if (settings.displayTimezone !== undefined) updateData.display_timezone = settings.displayTimezone
  if (settings.defaultLanguage !== undefined) updateData.default_language = settings.defaultLanguage
  
  const { error } = await supabase
    .from('openclaw_settings')
    .update(updateData)
    .eq('settings_key', 'default')
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Get the most recent cached commit SHA
 */
async function getMostRecentCachedCommitSha(): Promise<string | null> {
  const supabase = await createClient()
  
  const { data } = await supabase
    .from('openclaw_commits_cache')
    .select('sha')
    .order('committed_at', { ascending: false })
    .limit(1)
    .single()
  
  return data?.sha || null
}

/**
 * Fetch commits from GitHub API (single page)
 */
async function fetchGitHubCommitsPage(url: string): Promise<{ commits: GitHubCommitResponse[], pagination: PaginationInfo }> {
  const startedAt = Date.now()
  logSync('Fetching GitHub commits page', {
    url: getSafeGitHubUrl(url),
  }, true)

  const response = await fetch(url, {
    headers: getGitHubHeaders(),
    cache: 'no-store',
  })

  logSync('GitHub commits page responded', {
    url: getSafeGitHubUrl(url),
    status: response.status,
    ok: response.ok,
    rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
    rateLimitReset: response.headers.get('x-ratelimit-reset'),
    durationMs: Date.now() - startedAt,
  }, true)

  await assertGitHubResponseOk(response, `fetching commits for ${CONFIG.repo.fullName}`)

  const commits: GitHubCommitResponse[] = await response.json()
  const pagination = parseLinkHeader(response.headers.get('Link'))
  logSync('Parsed GitHub commits page', {
    fetched: commits.length,
    hasNextPage: pagination.hasNextPage,
    nextUrl: pagination.nextUrl ? getSafeGitHubUrl(pagination.nextUrl) : null,
  }, true)
  
  return { commits, pagination }
}

/**
 * Fetch commits from GitHub API with pagination support
 * @param options.perPage - Number of commits per page (max 100)
 * @param options.since - ISO date string to fetch commits since
 * @param options.until - ISO date string to fetch commits until
 * @param options.maxPages - Maximum number of pages to fetch (default: unlimited)
 * @param options.maxCommits - Stop after fetching this many commits
 */
async function fetchGitHubCommits(options: {
  perPage?: number
  since?: string
  until?: string
  maxPages?: number
  maxCommits?: number
} = {}): Promise<GitHubCommitResponse[]> {
  const { owner, name } = CONFIG.repo
  const perPage = Math.min(options.perPage || 100, 100)
  const startedAt = Date.now()
  
  let url = `https://api.github.com/repos/${owner}/${name}/commits?per_page=${perPage}`
  if (options.since) {
    url += `&since=${options.since}`
  }
  if (options.until) {
    url += `&until=${options.until}`
  }
  logSync('Starting paginated GitHub commit fetch', {
    repo: `${owner}/${name}`,
    perPage,
    since: options.since || null,
    until: options.until || null,
    maxPages: options.maxPages || null,
    maxCommits: options.maxCommits || null,
    firstUrl: getSafeGitHubUrl(url),
  })
  
  const allCommits: GitHubCommitResponse[] = []
  let page = 1
  
  while (true) {
    logSync('Fetching commit page', {
      page,
      accumulatedCommits: allCommits.length,
    }, true)
    const { commits, pagination } = await fetchGitHubCommitsPage(url)
    allCommits.push(...commits)
    logSync('Commit page accumulated', {
      page,
      pageCommits: commits.length,
      accumulatedCommits: allCommits.length,
    }, true)
    
    // Check stop conditions
    if (options.maxCommits && allCommits.length >= options.maxCommits) {
      logSync('Stopping commit fetch at maxCommits', {
        maxCommits: options.maxCommits,
        fetched: allCommits.length,
        durationMs: Date.now() - startedAt,
      })
      return allCommits.slice(0, options.maxCommits)
    }
    
    if (options.maxPages && page >= options.maxPages) {
      logSync('Stopping commit fetch at maxPages', {
        maxPages: options.maxPages,
        fetched: allCommits.length,
        durationMs: Date.now() - startedAt,
      })
      break
    }
    
    if (!pagination.hasNextPage || !pagination.nextUrl) {
      logSync('Stopping commit fetch because there is no next page', {
        fetched: allCommits.length,
        durationMs: Date.now() - startedAt,
      })
      break
    }
    
    // Move to next page
    url = pagination.nextUrl
    page++
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  logSync('Finished paginated GitHub commit fetch', {
    fetched: allCommits.length,
    pagesFetched: page,
    durationMs: Date.now() - startedAt,
  })
  return allCommits
}

/**
 * Store commits in the cache
 */
async function storeCommits(commits: GitHubCommitResponse[]): Promise<number> {
  if (commits.length === 0) {
    logSync('Skipping commit store because no commits were fetched')
    return 0
  }

  const uniqueCommits = Array.from(
    commits.reduce((acc, commit) => {
      if (!acc.has(commit.sha)) {
        acc.set(commit.sha, commit)
      }
      return acc
    }, new Map<string, GitHubCommitResponse>()).values()
  )

  const duplicateCount = commits.length - uniqueCommits.length
  
  const supabase = await createClient()
  logSync('Upserting commits into Supabase cache', {
    fetchedCount: commits.length,
    uniqueCount: uniqueCommits.length,
    duplicateCount,
    chunkSize: COMMIT_UPSERT_CHUNK_SIZE,
    newestSha: uniqueCommits[0]?.sha?.substring(0, 7) || null,
    oldestSha: uniqueCommits[uniqueCommits.length - 1]?.sha?.substring(0, 7) || null,
  })
  
  const rows = uniqueCommits.map(commit => ({
    sha: commit.sha,
    short_sha: commit.sha.substring(0, 7),
    message: commit.commit.message,
    author_name: commit.commit.author.name,
    author_email: commit.commit.author.email,
    author_username: commit.author?.login || null,
    author_avatar: commit.author?.avatar_url || null,
    author_profile_url: commit.author?.html_url || null,
    committed_at: commit.commit.author.date,
    commit_date: commit.commit.author.date.split('T')[0],
    url: commit.html_url,
    is_merge: commit.parents.length > 1,
    repo_owner: CONFIG.repo.owner,
    repo_name: CONFIG.repo.name,
  }))
  
  for (let i = 0; i < rows.length; i += COMMIT_UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + COMMIT_UPSERT_CHUNK_SIZE)
    const chunkNumber = Math.floor(i / COMMIT_UPSERT_CHUNK_SIZE) + 1
    const chunkCount = Math.ceil(rows.length / COMMIT_UPSERT_CHUNK_SIZE)

    logSync('Upserting commit cache chunk', {
      chunkNumber,
      chunkCount,
      chunkSize: chunk.length,
    }, true)

    const { error } = await supabase
      .from('openclaw_commits_cache')
      .upsert(chunk, { onConflict: 'sha' })
    
    if (error) {
      console.error('Error storing commits:', error)
      throw new Error(`Failed to store commits chunk ${chunkNumber}/${chunkCount}: ${error.message}`)
    }
  }
  
  logSync('Finished Supabase commit cache upsert', {
    count: rows.length,
    duplicateCount,
  })
  return rows.length
}

/**
 * Update last sync info in settings
 */
async function updateSyncInfo(commitCount: number): Promise<void> {
  const supabase = await createClient()
  
  await supabase
    .from('openclaw_settings')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_commit_count: commitCount,
    })
    .eq('settings_key', 'default')
}

/**
 * Create a sync log entry
 */
async function createSyncLog(syncType: 'incremental' | 'full' | 'initialize', triggeredBy: 'manual' | 'auto' | 'cron' = 'manual'): Promise<string | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('openclaw_sync_logs')
    .insert({
      sync_type: syncType,
      status: 'pending',
      triggered_by: triggeredBy,
    })
    .select('id')
    .single()
  
  if (error) {
    console.error('Failed to create sync log:', error)
    return null
  }
  
  return data?.id || null
}

/**
 * Update a sync log entry
 */
async function updateSyncLog(
  logId: string | null, 
  status: 'success' | 'error',
  results: { 
    commitsFetched?: number
    commitsNew?: number
    commitsUpdated?: number
    errorMessage?: string
    durationMs?: number
  }
): Promise<void> {
  if (!logId) return
  
  const supabase = await createClient()
  
  await supabase
    .from('openclaw_sync_logs')
    .update({
      status,
      commits_fetched: results.commitsFetched || 0,
      commits_new: results.commitsNew || 0,
      commits_updated: results.commitsUpdated || 0,
      error_message: results.errorMessage || null,
      completed_at: new Date().toISOString(),
      duration_ms: results.durationMs || null,
    })
    .eq('id', logId)
}

/**
 * Sync commits from GitHub - incremental or full
 * Returns the number of new commits added
 * 
 * With pagination support, this can fetch all commits since the last sync.
 * For full sync, fetches all commits for the default days period.
 */
export async function syncCommits(forceFullSync: boolean = false, triggeredBy: 'manual' | 'auto' | 'cron' = 'manual'): Promise<{ 
  success: boolean
  newCommits: number
  totalCached: number
  pagesFetched?: number
  error?: string 
}> {
  const startTime = Date.now()
  const syncType = forceFullSync ? 'full' : 'incremental'
  logSync('Starting commit sync', {
    syncType,
    triggeredBy,
  })
  const logId = await createSyncLog(syncType, triggeredBy)
  logSync('Created sync log row', {
    syncType,
    triggeredBy,
    logId,
  })
  
  try {
    const settings = await getSettings()
    const supabase = await createClient()
    const hasConfiguredSyncLimit = settings.maxCommitsPerSync > 0
    const configuredMaxCommits = hasConfiguredSyncLimit
      ? settings.maxCommitsPerSync
      : DEFAULT_INCREMENTAL_MAX_COMMITS
    const syncMaxCommits = forceFullSync
      ? configuredMaxCommits
      : Math.min(configuredMaxCommits, DEFAULT_INCREMENTAL_MAX_COMMITS)
    const syncMaxPages = hasConfiguredSyncLimit
      ? Math.max(1, Math.ceil(syncMaxCommits / 100))
      : DEFAULT_INCREMENTAL_MAX_PAGES
    logSync('Loaded sync settings', {
      defaultDays: settings.defaultDays,
      maxCommitsPerSync: settings.maxCommitsPerSync,
      configuredMaxCommits,
      effectiveMaxCommits: syncMaxCommits,
      effectiveMaxPages: syncMaxPages,
      cappedForIncrementalSync: !forceFullSync && configuredMaxCommits > syncMaxCommits,
      lastSyncAt: settings.lastSyncAt,
      lastSyncCommitCount: settings.lastSyncCommitCount,
    })
    
    let commits: GitHubCommitResponse[]
    
    if (forceFullSync) {
      // Full sync: fetch all commits from the last N days
      const sinceDate = new Date()
      sinceDate.setDate(sinceDate.getDate() - settings.defaultDays)
      logSync('Full sync will fetch commits since configured window', {
        since: sinceDate.toISOString(),
        defaultDays: settings.defaultDays,
        maxCommits: syncMaxCommits,
        maxPages: syncMaxPages,
      })
      
      commits = await fetchGitHubCommits({
        since: sinceDate.toISOString(),
        maxCommits: syncMaxCommits,
        maxPages: syncMaxPages,
      })
    } else {
      // Incremental sync: only fetch commits since last cached commit
      const mostRecentSha = await getMostRecentCachedCommitSha()
      logSync('Incremental sync inspected most recent cached commit', {
        mostRecentSha: mostRecentSha ? mostRecentSha.substring(0, 7) : null,
      })
      
      if (mostRecentSha) {
        const { data: mostRecent } = await supabase
          .from('openclaw_commits_cache')
          .select('committed_at')
          .eq('sha', mostRecentSha)
          .single()
        
        if (mostRecent) {
          logSync('Incremental sync will fetch commits since cached commit date', {
            mostRecentSha: mostRecentSha.substring(0, 7),
            since: mostRecent.committed_at,
            maxCommits: syncMaxCommits,
            maxPages: syncMaxPages,
          })
          commits = await fetchGitHubCommits({
            since: mostRecent.committed_at,
            maxCommits: syncMaxCommits,
            maxPages: syncMaxPages,
          })
          // Filter out the commit we already have
          commits = commits.filter(c => c.sha !== mostRecentSha)
          logSync('Filtered already-cached boundary commit from incremental result', {
            remainingCommits: commits.length,
          })
        } else {
          // Fallback to fetching recent commits
          logSync('Most recent SHA was missing its row; falling back to one recent GitHub page')
          commits = await fetchGitHubCommits({ maxPages: 1 })
        }
      } else {
        // No cached commits - initialize with default days
        const sinceDate = new Date()
        sinceDate.setDate(sinceDate.getDate() - settings.defaultDays)
        logSync('No cached commits found; incremental sync will initialize window', {
          since: sinceDate.toISOString(),
          defaultDays: settings.defaultDays,
          maxCommits: syncMaxCommits,
          maxPages: syncMaxPages,
        })
        commits = await fetchGitHubCommits({
          since: sinceDate.toISOString(),
          maxCommits: syncMaxCommits,
          maxPages: syncMaxPages,
        })
      }
    }
    logSync('GitHub fetch finished for sync', {
      syncType,
      fetchedCommits: commits.length,
      newestFetchedSha: commits[0]?.sha?.substring(0, 7) || null,
      oldestFetchedSha: commits[commits.length - 1]?.sha?.substring(0, 7) || null,
    })
    
    const newCommits = await storeCommits(commits)
    await updateSyncInfo(newCommits)
    logSync('Updated OpenClaw sync settings', {
      lastSyncCommitCount: newCommits,
    })
    
    const { count } = await supabase
      .from('openclaw_commits_cache')
      .select('*', { count: 'exact', head: true })
    
    const durationMs = Date.now() - startTime
    await updateSyncLog(logId, 'success', {
      commitsFetched: commits.length,
      commitsNew: newCommits,
      durationMs,
    })
    logSync('Commit sync completed successfully', {
      syncType,
      triggeredBy,
      fetchedCommits: commits.length,
      storedCommits: newCommits,
      totalCached: count || 0,
      durationMs,
      logId,
    })
    
    return {
      success: true,
      newCommits,
      totalCached: count || 0,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await updateSyncLog(logId, 'error', { errorMessage, durationMs })
    console.error('[OPENCLAW SYNC] Commit sync failed', {
      syncType,
      triggeredBy,
      durationMs,
      logId,
      error: errorMessage,
    })
    
    return {
      success: false,
      newCommits: 0,
      totalCached: 0,
      error: errorMessage,
    }
  }
}

/**
 * Initialize cache with commits from the last N days
 * Called on first load if cache is empty
 * 
 * With pagination support, this will fetch ALL commits for the period,
 * not just the first 100.
 */
export async function initializeCache(days: number = 7): Promise<{
  success: boolean
  commits: number
  error?: string
}> {
  try {
    const supabase = await createClient()
    
    const { count } = await supabase
      .from('openclaw_commits_cache')
      .select('*', { count: 'exact', head: true })
    
    if (count && count > 0) {
      return { success: true, commits: count }
    }
    
    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - days)
    
    // Fetch ALL commits for the period with pagination
    const commits = await fetchGitHubCommits({
      since: sinceDate.toISOString(),
    })
    
    const stored = await storeCommits(commits)
    await updateSyncInfo(stored)
    
    return { success: true, commits: stored }
  } catch (error) {
    return {
      success: false,
      commits: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get cached commits for a date range
 */
export async function getCachedCommits(options: {
  days?: number
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<CachedCommit[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('openclaw_commits_cache')
    .select('*')
    .order('committed_at', { ascending: false })
  
  if (options.startDate) {
    query = query.gte('commit_date', options.startDate)
  }
  
  if (options.endDate) {
    query = query.lte('commit_date', options.endDate)
  }
  
  if (options.days && !options.startDate) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - options.days)
    query = query.gte('commit_date', startDate.toISOString().split('T')[0])
  }
  
  if (options.limit) {
    query = query.limit(options.limit)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching cached commits:', error)
    return []
  }
  
  return (data || []).map(row => ({
    sha: row.sha,
    shortSha: row.short_sha,
    message: row.message,
    author: {
      name: row.author_name,
      email: row.author_email,
      username: row.author_username,
      avatar: row.author_avatar,
      profileUrl: row.author_profile_url,
    },
    date: row.committed_at,
    commitDate: row.commit_date,
    url: row.url,
    isMerge: row.is_merge,
  }))
}

/**
 * Get daily statistics from cached commits
 */
export async function getDailyStats(days?: number): Promise<DailyStats[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('openclaw_daily_stats')
    .select('*')
    .order('commit_date', { ascending: false })
  
  if (days) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    query = query.gte('commit_date', startDate.toISOString().split('T')[0])
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching daily stats:', error)
    return []
  }
  
  return (data || []).map(row => ({
    date: row.commit_date,
    commitCount: row.commit_count,
    uniqueContributors: row.unique_contributors,
    mergeCount: row.merge_count,
    firstCommit: row.first_commit,
    lastCommit: row.last_commit,
  }))
}

/**
 * Get total cache statistics
 */
export async function getCacheStats(): Promise<{
  totalCommits: number
  totalDays: number
  oldestCommit: string | null
  newestCommit: string | null
  uniqueContributors: number
}> {
  const supabase = await createClient()
  
  const { count } = await supabase
    .from('openclaw_commits_cache')
    .select('*', { count: 'exact', head: true })
  
  const { data: oldest } = await supabase
    .from('openclaw_commits_cache')
    .select('committed_at')
    .order('committed_at', { ascending: true })
    .limit(1)
    .single()
  
  const { data: newest } = await supabase
    .from('openclaw_commits_cache')
    .select('committed_at')
    .order('committed_at', { ascending: false })
    .limit(1)
    .single()
  
  const { data: contributors } = await supabase
    .from('openclaw_commits_cache')
    .select('author_username, author_name')
  
  const uniqueContributors = new Set(
    (contributors || []).map(c => c.author_username || c.author_name)
  ).size
  
  const { data: dailyStats } = await supabase
    .from('openclaw_daily_stats')
    .select('commit_date')
  
  return {
    totalCommits: count || 0,
    totalDays: dailyStats?.length || 0,
    oldestCommit: oldest?.committed_at || null,
    newestCommit: newest?.committed_at || null,
    uniqueContributors,
  }
}

/**
 * Calculate stats from commits (for compatibility with existing code)
 */
export async function calculateStatsFromCache(commits: CachedCommit[]): Promise<CommitStats> {
  const uniqueContributors = new Set(
    commits.map(c => c.author.username || c.author.name)
  ).size
  
  const merges = commits.filter(c => c.isMerge).length
  
  const commitsByDate = commits.reduce((acc, commit) => {
    const date = commit.commitDate
    acc[date] = (acc[date] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const mostActiveDay = Object.entries(commitsByDate)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null
  
  const categories: Record<string, number> = {}
  
  for (const commit of commits) {
    const message = commit.message.toLowerCase()
    let category = 'Other'
    
    if (message.startsWith('feat') || message.includes('feature')) {
      category = 'Feature'
    } else if (message.startsWith('fix') || message.includes('bugfix')) {
      category = 'Bugfix'
    } else if (message.startsWith('refactor')) {
      category = 'Refactor'
    } else if (message.startsWith('doc') || message.includes('readme')) {
      category = 'Documentation'
    } else if (message.startsWith('perf') || message.includes('performance')) {
      category = 'Performance'
    } else if (message.includes('security') || message.includes('vuln')) {
      category = 'Security'
    } else if (message.startsWith('test')) {
      category = 'Testing'
    } else if (message.startsWith('chore') || message.includes('ci') || message.includes('build')) {
      category = 'Infrastructure'
    }
    
    categories[category] = (categories[category] || 0) + 1
  }
  
  return {
    total: commits.length,
    merges,
    uniqueContributors,
    mostActiveDay,
    categories,
  }
}

/**
 * Convert cached commits to GitHubCommit format (for compatibility)
 */
export async function toGitHubCommit(cached: CachedCommit): Promise<GitHubCommit> {
  return {
    sha: cached.sha,
    shortSha: cached.shortSha,
    message: cached.message,
    author: cached.author,
    date: cached.date,
    url: cached.url,
    isMerge: cached.isMerge,
  }
}

/**
 * Get recent sync logs
 */
export async function getSyncLogs(limit: number = 20): Promise<SyncLog[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('openclaw_sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error('Failed to fetch sync logs:', error)
    return []
  }
  
  return (data || []).map(row => ({
    id: row.id,
    syncType: row.sync_type,
    status: row.status,
    commitsFetched: row.commits_fetched,
    commitsNew: row.commits_new,
    commitsUpdated: row.commits_updated,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    triggeredBy: row.triggered_by,
  }))
}

/**
 * Get sync statistics
 */
export async function getSyncStats(): Promise<SyncStats> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('openclaw_sync_stats')
    .select('*')
    .single()
  
  if (error || !data) {
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      totalCommitsAdded: 0,
      avgDurationMs: null,
      lastSuccessfulSync: null,
      lastFailedSync: null,
    }
  }
  
  return {
    totalSyncs: data.total_syncs || 0,
    successfulSyncs: data.successful_syncs || 0,
    failedSyncs: data.failed_syncs || 0,
    totalCommitsAdded: data.total_commits_added || 0,
    avgDurationMs: data.avg_duration_ms,
    lastSuccessfulSync: data.last_successful_sync,
    lastFailedSync: data.last_failed_sync,
  }
}

// ============================================================================
// Newspaper Cache Functions
// ============================================================================

export interface CachedNewspaper {
  id: string
  cacheDate: string
  dayRange: number
  language: 'en' | 'de'
  data: Record<string, unknown>
  commitCount: number
  uniqueContributors: number
  createdAt: string
  updatedAt: string
}

/**
 * Get cached newspaper for a specific date, day range, and language
 */
export async function getCachedNewspaper(
  date: string,
  dayRange: number = 1,
  language: 'en' | 'de' = 'en'
): Promise<CachedNewspaper | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('openclaw_newspaper_cache')
    .select('*')
    .eq('cache_date', date)
    .eq('day_range', dayRange)
    .eq('language', language)
    .single()
  
  if (error || !data) {
    return null
  }
  
  return {
    id: data.id,
    cacheDate: data.cache_date,
    dayRange: data.day_range,
    language: data.language,
    data: data.data,
    commitCount: data.commit_count,
    uniqueContributors: data.unique_contributors,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

/**
 * Save generated newspaper to cache
 */
export async function saveNewspaperToCache(
  date: string,
  dayRange: number,
  language: 'en' | 'de',
  data: Record<string, unknown>,
  commitCount: number,
  uniqueContributors: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('openclaw_newspaper_cache')
    .upsert({
      cache_date: date,
      day_range: dayRange,
      language,
      data,
      commit_count: commitCount,
      unique_contributors: uniqueContributors,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'cache_date,day_range,language',
    })
  
  if (error) {
    console.error('Failed to save newspaper to cache:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Get all cached newspapers (for listing)
 */
export async function getCachedNewspapersList(limit: number = 20): Promise<CachedNewspaper[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('openclaw_newspaper_cache')
    .select('*')
    .order('cache_date', { ascending: false })
    .order('language', { ascending: true })
    .limit(limit)
  
  if (error) {
    console.error('Failed to fetch cached newspapers:', error)
    return []
  }
  
  return (data || []).map(row => ({
    id: row.id,
    cacheDate: row.cache_date,
    dayRange: row.day_range,
    language: row.language,
    data: row.data,
    commitCount: row.commit_count,
    uniqueContributors: row.unique_contributors,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

/**
 * Get the most recent cached newspaper for any language
 */
export async function getMostRecentNewspaper(language?: 'en' | 'de'): Promise<CachedNewspaper | null> {
  const supabase = await createClient()
  
  let query = supabase
    .from('openclaw_newspaper_cache')
    .select('*')
    .order('cache_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
  
  if (language) {
    query = query.eq('language', language)
  }
  
  const { data, error } = await query.single()
  
  if (error || !data) {
    return null
  }
  
  return {
    id: data.id,
    cacheDate: data.cache_date,
    dayRange: data.day_range,
    language: data.language,
    data: data.data,
    commitCount: data.commit_count,
    uniqueContributors: data.unique_contributors,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}
