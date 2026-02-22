/**
 * OpenClaw - Commit Caching Actions
 * 
 * Server actions for caching GitHub commits in Supabase.
 * Implements incremental sync - only fetches new commits on refresh.
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { CONFIG } from '../lib/config'
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
 * Fetch commits from GitHub API
 */
async function fetchGitHubCommits(count: number = 100, since?: string): Promise<GitHubCommitResponse[]> {
  const { owner, name } = CONFIG.repo
  let apiUrl = `https://api.github.com/repos/${owner}/${name}/commits?per_page=${count}`
  
  if (since) {
    apiUrl += `&since=${since}`
  }
  
  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpenClawToday-Newspaper',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Store commits in the cache
 */
async function storeCommits(commits: GitHubCommitResponse[]): Promise<number> {
  if (commits.length === 0) return 0
  
  const supabase = await createClient()
  
  const rows = commits.map(commit => ({
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
  
  const { error } = await supabase
    .from('openclaw_commits_cache')
    .upsert(rows, { onConflict: 'sha' })
  
  if (error) {
    console.error('Error storing commits:', error)
    throw new Error(`Failed to store commits: ${error.message}`)
  }
  
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
 */
export async function syncCommits(forceFullSync: boolean = false, triggeredBy: 'manual' | 'auto' | 'cron' = 'manual'): Promise<{ 
  success: boolean
  newCommits: number
  totalCached: number
  error?: string 
}> {
  const startTime = Date.now()
  const syncType = forceFullSync ? 'full' : 'incremental'
  const logId = await createSyncLog(syncType, triggeredBy)
  
  try {
    const settings = await getSettings()
    const supabase = await createClient()
    
    let commits: GitHubCommitResponse[]
    
    if (forceFullSync) {
      commits = await fetchGitHubCommits(settings.maxCommitsPerSync)
    } else {
      const mostRecentSha = await getMostRecentCachedCommitSha()
      
      if (mostRecentSha) {
        const { data: mostRecent } = await supabase
          .from('openclaw_commits_cache')
          .select('committed_at')
          .eq('sha', mostRecentSha)
          .single()
        
        if (mostRecent) {
          commits = await fetchGitHubCommits(settings.maxCommitsPerSync, mostRecent.committed_at)
          commits = commits.filter(c => c.sha !== mostRecentSha)
        } else {
          commits = await fetchGitHubCommits(settings.maxCommitsPerSync)
        }
      } else {
        commits = await fetchGitHubCommits(settings.maxCommitsPerSync)
      }
    }
    
    const newCommits = await storeCommits(commits)
    await updateSyncInfo(newCommits)
    
    const { count } = await supabase
      .from('openclaw_commits_cache')
      .select('*', { count: 'exact', head: true })
    
    const durationMs = Date.now() - startTime
    await updateSyncLog(logId, 'success', {
      commitsFetched: commits.length,
      commitsNew: newCommits,
      durationMs,
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
    
    const commits = await fetchGitHubCommits(100, sinceDate.toISOString())
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
