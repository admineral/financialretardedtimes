/**
 * OpenClaw Today - GitHub Actions
 * 
 * Server actions for fetching GitHub data.
 * These run on the server and can be called from client components.
 */

'use server'

import { CONFIG } from '../lib/config'
import { assertGitHubResponseOk, getGitHubHeaders } from '../lib/github-api'
import type { 
  GitHubCommit, 
  RepoInfo, 
  CommitStats,
  GitHubIssue,
  GitHubPullRequest,
  IssueStats,
} from '../lib/types'

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

interface GitHubRepoResponse {
  full_name: string
  description: string | null
  html_url: string
  stargazers_count: number
  language: string | null
  owner: { login: string }
  name: string
}

function isOpenClawDebugEnabled(): boolean {
  return process.env.OPENCLAW_DEBUG_LOGS === 'true'
}

function logOpenClawGitHub(message: string, details?: Record<string, unknown>, debugOnly: boolean = false): void {
  if (debugOnly && !isOpenClawDebugEnabled()) {
    return
  }

  if (details) {
    console.log(`[OPENCLAW GITHUB] ${message}`, details)
    return
  }

  console.log(`[OPENCLAW GITHUB] ${message}`)
}

function mapGitHubCommit(commit: GitHubCommitResponse): GitHubCommit {
  return {
    sha: commit.sha,
    shortSha: commit.sha.substring(0, 7),
    message: commit.commit.message,
    author: {
      name: commit.commit.author.name,
      email: commit.commit.author.email,
      username: commit.author?.login || null,
      avatar: commit.author?.avatar_url || null,
      profileUrl: commit.author?.html_url || null,
    },
    date: commit.commit.author.date,
    url: commit.html_url,
    isMerge: commit.parents.length > 1,
  }
}

/**
 * Fetch commits from the configured repository
 */
export async function fetchCommits(count: number = CONFIG.newspaper.defaultCommitCount): Promise<GitHubCommit[]> {
  const { owner, name } = CONFIG.repo
  const perPage = Math.min(count, CONFIG.newspaper.maxCommitCount)
  
  const apiUrl = `https://api.github.com/repos/${owner}/${name}/commits?per_page=${perPage}`
  
  const response = await fetch(apiUrl, {
    headers: getGitHubHeaders(),
    next: { revalidate: CONFIG.cache.commits },
  })

  await assertGitHubResponseOk(response, `fetching commits for ${CONFIG.repo.fullName}`)

  const commits: GitHubCommitResponse[] = await response.json()

  return commits.map(mapGitHubCommit)
}

/**
 * Fetch commits for a specific date range from the configured repository.
 */
export async function fetchCommitsForDateRange(
  startDate: string,
  endDate: string,
  maxCommits: number = CONFIG.newspaper.maxCommitCount
): Promise<GitHubCommit[]> {
  const { owner, name } = CONFIG.repo
  const perPage = Math.min(maxCommits, CONFIG.newspaper.maxCommitCount)
  const since = `${startDate}T00:00:00Z`
  const until = `${endDate}T23:59:59Z`
  const apiUrl = `https://api.github.com/repos/${owner}/${name}/commits?per_page=${perPage}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`

  logOpenClawGitHub('Fetching commits for selected date range', {
    repo: `${owner}/${name}`,
    startDate,
    endDate,
    maxCommits,
    perPage,
    since,
    until,
  }, true)
  logOpenClawGitHub('Fetching selected date range', {
    startDate,
    endDate,
    maxCommits,
  })

  const response = await fetch(apiUrl, {
    headers: getGitHubHeaders(),
    cache: 'no-store',
  })

  logOpenClawGitHub('Date range commits response', {
    status: response.status,
    ok: response.ok,
    rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
    rateLimitReset: response.headers.get('x-ratelimit-reset'),
  }, true)

  await assertGitHubResponseOk(
    response,
    `fetching commits for ${CONFIG.repo.fullName} from ${startDate} to ${endDate}`
  )

  const commits: GitHubCommitResponse[] = await response.json()
  logOpenClawGitHub('Date range commits parsed', {
    fetched: commits.length,
    newestSha: commits[0]?.sha?.substring(0, 7) || null,
    oldestSha: commits[commits.length - 1]?.sha?.substring(0, 7) || null,
  }, true)
  logOpenClawGitHub('Selected date range loaded', {
    fetched: commits.length,
  })

  return commits.map(mapGitHubCommit)
}

/**
 * Fetch repository information
 */
export async function fetchRepoInfo(): Promise<RepoInfo> {
  const { owner, name } = CONFIG.repo
  const apiUrl = `https://api.github.com/repos/${owner}/${name}`
  
  const response = await fetch(apiUrl, {
    headers: getGitHubHeaders(),
    next: { revalidate: CONFIG.cache.repoInfo },
  })

  await assertGitHubResponseOk(response, `fetching repository info for ${CONFIG.repo.fullName}`)

  const repo: GitHubRepoResponse = await response.json()

  return {
    owner: repo.owner.login,
    repo: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    stars: repo.stargazers_count,
    language: repo.language,
  }
}

/**
 * Calculate statistics from commits
 */
export async function calculateStats(commits: GitHubCommit[]): Promise<CommitStats> {
  const uniqueContributors = new Set(
    commits.map(c => c.author.username || c.author.name)
  ).size
  
  const merges = commits.filter(c => c.isMerge).length
  
  // Group commits by date
  const commitsByDate = commits.reduce((acc, commit) => {
    const date = commit.date.split('T')[0]
    acc[date] = (acc[date] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const mostActiveDay = Object.entries(commitsByDate)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null
  
  // Categorize commits based on conventional commit prefixes
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
 * Format commits for the AI prompt
 */
export async function formatCommitsForPrompt(commits: GitHubCommit[]): Promise<string> {
  const stats = await calculateStats(commits)
  
  // Find dominant category
  const dominantCategory = Object.entries(stats.categories)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed'
  
  let output = `═══════════════════════════════════════════════════
📊 COMMIT STATISTICS
═══════════════════════════════════════════════════
• Total: ${stats.total} commits
• Merge commits: ${stats.merges}
• Unique contributors: ${stats.uniqueContributors}
• Most active day: ${stats.mostActiveDay || 'N/A'}
• Dominant category: ${dominantCategory}

Category breakdown:
${Object.entries(stats.categories)
  .sort((a, b) => b[1] - a[1])
  .map(([cat, count]) => `  • ${cat}: ${count}`)
  .join('\n')}
═══════════════════════════════════════════════════

📝 COMMIT LOG:
`
  
  for (const commit of commits) {
    const date = new Date(commit.date).toLocaleString('en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    })
    const author = commit.author.username || commit.author.name
    const mergeTag = commit.isMerge ? ' [MERGE]' : ''
    const messageFirstLine = commit.message.split('\n')[0]
    
    output += `[${date}] ${author}${mergeTag}: ${messageFirstLine} (${commit.shortSha})\n`
  }
  
  return output
}

// ============================================
// Issues & Pull Requests Functions
// ============================================

interface GitHubIssueResponse {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  labels: Array<{ name: string; color: string; description: string | null }>
  user: { login: string; avatar_url: string; html_url: string }
  assignees: Array<{ login: string; avatar_url: string; html_url: string }>
  created_at: string
  updated_at: string
  closed_at: string | null
  html_url: string
  comments: number
  reactions?: {
    total_count: number
    '+1': number
    '-1': number
    laugh: number
    hooray: number
    confused: number
    heart: number
    rocket: number
    eyes: number
  }
  pull_request?: { url: string }
}

interface GitHubPRResponse extends GitHubIssueResponse {
  merged_at: string | null
  merge_commit_sha: string | null
  draft: boolean
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  additions?: number
  deletions?: number
  changed_files?: number
}

/**
 * Fetch all issues from the configured repository (with pagination)
 * GitHub limits pagination to ~1000 results, so we cap at 10 pages
 */
export async function fetchAllIssues(
  state: 'open' | 'closed' | 'all' = 'all',
  maxPages: number = 10
): Promise<GitHubIssue[]> {
  const { owner, name } = CONFIG.repo
  const perPage = 100
  const allIssues: GitHubIssue[] = []
  
  // GitHub has a hard limit of ~1000 results via pagination
  const effectiveMaxPages = Math.min(maxPages, 10)
  
  for (let page = 1; page <= effectiveMaxPages; page++) {
    const apiUrl = `https://api.github.com/repos/${owner}/${name}/issues?state=${state}&per_page=${perPage}&page=${page}`
    
    const response = await fetch(apiUrl, {
      headers: getGitHubHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      const remaining = response.headers.get('x-ratelimit-remaining')
      const resetTime = response.headers.get('x-ratelimit-reset')
      const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleTimeString() : 'unknown'
      
      if (response.status === 403) {
        console.warn(`[OPENCLAW] GitHub API rate limit hit at page ${page}. Remaining: ${remaining}, Resets at: ${resetDate}`)
        if (page === 1) {
          console.error(`[OPENCLAW] ⚠️ Rate limited on first request! You may need to wait or add a GITHUB_TOKEN to .env`)
        }
        break
      }
      if (response.status === 422) {
        console.warn(`[OPENCLAW] GitHub pagination limit reached at page ${page}`)
        break
      }
      console.error(`[OPENCLAW] GitHub API error ${response.status} at page ${page}`)
      break
    }

    const issues: GitHubIssueResponse[] = await response.json()
    
    if (issues.length === 0) break
    
    // Filter out pull requests (they appear in issues endpoint too)
    const pureIssues = issues.filter(issue => !issue.pull_request)
    
    allIssues.push(...pureIssues.map(issue => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels.map(l => ({ name: l.name, color: l.color, description: l.description })),
      user: { login: issue.user.login, avatar_url: issue.user.avatar_url, html_url: issue.user.html_url },
      assignees: issue.assignees.map(a => ({ login: a.login, avatar_url: a.avatar_url, html_url: a.html_url })),
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at,
      html_url: issue.html_url,
      comments: issue.comments,
      reactions: issue.reactions,
    })))
    
    console.log(`[OPENCLAW] Fetched page ${page}: ${pureIssues.length} issues (total: ${allIssues.length})`)
    
    if (issues.length < perPage) break
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  return allIssues
}

/**
 * Fetch all pull requests from the configured repository (with pagination)
 * GitHub limits pagination to ~1000 results, so we cap at 10 pages
 */
export async function fetchAllPullRequests(
  state: 'open' | 'closed' | 'all' = 'all',
  maxPages: number = 10
): Promise<GitHubPullRequest[]> {
  const { owner, name } = CONFIG.repo
  const perPage = 100
  const allPRs: GitHubPullRequest[] = []
  
  // GitHub has a hard limit of ~1000 results via pagination
  const effectiveMaxPages = Math.min(maxPages, 10)
  
  for (let page = 1; page <= effectiveMaxPages; page++) {
    const apiUrl = `https://api.github.com/repos/${owner}/${name}/pulls?state=${state}&per_page=${perPage}&page=${page}`
    
    const response = await fetch(apiUrl, {
      headers: getGitHubHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      const remaining = response.headers.get('x-ratelimit-remaining')
      const resetTime = response.headers.get('x-ratelimit-reset')
      const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleTimeString() : 'unknown'
      
      if (response.status === 403) {
        console.warn(`[OPENCLAW] GitHub API rate limit hit at page ${page}. Remaining: ${remaining}, Resets at: ${resetDate}`)
        if (page === 1) {
          console.error(`[OPENCLAW] ⚠️ Rate limited on first request! You may need to wait or add a GITHUB_TOKEN to .env`)
        }
        break
      }
      if (response.status === 422) {
        console.warn(`[OPENCLAW] GitHub pagination limit reached at page ${page}`)
        break
      }
      console.error(`[OPENCLAW] GitHub API error ${response.status} at page ${page}`)
      break
    }

    const prs: GitHubPRResponse[] = await response.json()
    
    if (prs.length === 0) break
    
    allPRs.push(...prs.map(pr => ({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      labels: pr.labels.map(l => ({ name: l.name, color: l.color, description: l.description })),
      user: { login: pr.user.login, avatar_url: pr.user.avatar_url, html_url: pr.user.html_url },
      assignees: pr.assignees.map(a => ({ login: a.login, avatar_url: a.avatar_url, html_url: a.html_url })),
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      closed_at: pr.closed_at,
      html_url: pr.html_url,
      comments: pr.comments,
      reactions: pr.reactions,
      merged_at: pr.merged_at,
      merge_commit_sha: pr.merge_commit_sha,
      draft: pr.draft,
      head: pr.head,
      base: pr.base,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
    })))
    
    console.log(`[OPENCLAW] Fetched page ${page}: ${prs.length} PRs (total: ${allPRs.length})`)
    
    if (prs.length < perPage) break
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  return allPRs
}

/**
 * Calculate statistics from issues and PRs
 */
export async function calculateIssueStats(
  issues: GitHubIssue[], 
  pullRequests: GitHubPullRequest[]
): Promise<IssueStats> {
  const openIssues = issues.filter(i => i.state === 'open').length
  const closedIssues = issues.filter(i => i.state === 'closed').length
  
  const openPRs = pullRequests.filter(pr => pr.state === 'open' && !pr.merged_at).length
  const mergedPRs = pullRequests.filter(pr => pr.merged_at !== null).length
  const closedPRs = pullRequests.filter(pr => pr.state === 'closed' && !pr.merged_at).length
  
  const allAuthors = new Set([
    ...issues.map(i => i.user.login),
    ...pullRequests.map(pr => pr.user.login),
  ])
  
  const allAssignees = new Set([
    ...issues.flatMap(i => i.assignees.map(a => a.login)),
    ...pullRequests.flatMap(pr => pr.assignees.map(a => a.login)),
  ])
  
  // Count labels across issues and PRs
  const labelCounts: Record<string, number> = {}
  for (const item of [...issues, ...pullRequests]) {
    for (const label of item.labels) {
      labelCounts[label.name] = (labelCounts[label.name] || 0) + 1
    }
  }
  
  const mostActiveLabels = Object.entries(labelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))
  
  const totalIssueComments = issues.reduce((sum, i) => sum + i.comments, 0)
  const totalPRComments = pullRequests.reduce((sum, pr) => sum + pr.comments, 0)
  
  return {
    totalIssues: issues.length,
    openIssues,
    closedIssues,
    totalPRs: pullRequests.length,
    openPRs,
    mergedPRs,
    closedPRs,
    uniqueAuthors: allAuthors.size,
    uniqueAssignees: allAssignees.size,
    mostActiveLabels,
    avgCommentsPerIssue: issues.length > 0 ? Math.round(totalIssueComments / issues.length * 10) / 10 : 0,
    avgCommentsPerPR: pullRequests.length > 0 ? Math.round(totalPRComments / pullRequests.length * 10) / 10 : 0,
  }
}

/**
 * Format issues and PRs for the AI prompt
 */
export async function formatIssuesForPrompt(
  issues: GitHubIssue[],
  pullRequests: GitHubPullRequest[],
  stats: IssueStats
): Promise<string> {
  let output = `═══════════════════════════════════════════════════
📊 REPOSITORY OVERVIEW
═══════════════════════════════════════════════════
ISSUES:
• Total: ${stats.totalIssues}
• Open: ${stats.openIssues}
• Closed: ${stats.closedIssues}

PULL REQUESTS:
• Total: ${stats.totalPRs}
• Open: ${stats.openPRs}
• Merged: ${stats.mergedPRs}
• Closed (unmerged): ${stats.closedPRs}

CONTRIBUTORS:
• Unique authors: ${stats.uniqueAuthors}
• Unique assignees: ${stats.uniqueAssignees}
• Avg comments/issue: ${stats.avgCommentsPerIssue}
• Avg comments/PR: ${stats.avgCommentsPerPR}

TOP LABELS:
${stats.mostActiveLabels.map(l => `  • ${l.name}: ${l.count}`).join('\n')}
═══════════════════════════════════════════════════

🐛 OPEN ISSUES (${stats.openIssues}):
`

  // Show open issues (most recent first, limit to manageable amount)
  const openIssues = issues
    .filter(i => i.state === 'open')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 100)
  
  for (const issue of openIssues) {
    const labels = issue.labels.map(l => l.name).join(', ') || 'none'
    const assignees = issue.assignees.map(a => `@${a.login}`).join(', ') || 'unassigned'
    const reactions = issue.reactions?.total_count || 0
    const bodyPreview = issue.body 
      ? issue.body.substring(0, 200).replace(/\n/g, ' ').trim() + (issue.body.length > 200 ? '...' : '')
      : 'No description'
    
    output += `
#${issue.number}: ${issue.title}
  Author: @${issue.user.login} | Assignees: ${assignees}
  Labels: [${labels}] | Comments: ${issue.comments} | Reactions: ${reactions}
  Created: ${issue.created_at.split('T')[0]} | Updated: ${issue.updated_at.split('T')[0]}
  Body: ${bodyPreview}
`
  }

  output += `
═══════════════════════════════════════════════════

🔀 OPEN PULL REQUESTS (${stats.openPRs}):
`

  // Show open PRs
  const openPRs = pullRequests
    .filter(pr => pr.state === 'open')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 50)
  
  for (const pr of openPRs) {
    const labels = pr.labels.map(l => l.name).join(', ') || 'none'
    const assignees = pr.assignees.map(a => `@${a.login}`).join(', ') || 'unassigned'
    const draft = pr.draft ? ' [DRAFT]' : ''
    const bodyPreview = pr.body 
      ? pr.body.substring(0, 200).replace(/\n/g, ' ').trim() + (pr.body.length > 200 ? '...' : '')
      : 'No description'
    
    output += `
#${pr.number}${draft}: ${pr.title}
  Author: @${pr.user.login} | Assignees: ${assignees}
  Branch: ${pr.head.ref} → ${pr.base.ref}
  Labels: [${labels}] | Comments: ${pr.comments}
  Created: ${pr.created_at.split('T')[0]} | Updated: ${pr.updated_at.split('T')[0]}
  Body: ${bodyPreview}
`
  }

  // Show recently closed/merged for context
  output += `
═══════════════════════════════════════════════════

✅ RECENTLY CLOSED ISSUES (last 50):
`

  const recentlyClosed = issues
    .filter(i => i.state === 'closed')
    .sort((a, b) => new Date(b.closed_at || b.updated_at).getTime() - new Date(a.closed_at || a.updated_at).getTime())
    .slice(0, 50)
  
  for (const issue of recentlyClosed) {
    const labels = issue.labels.map(l => l.name).join(', ') || 'none'
    output += `#${issue.number}: ${issue.title} [${labels}] - closed ${issue.closed_at?.split('T')[0] || 'unknown'}\n`
  }

  output += `
═══════════════════════════════════════════════════

🎉 RECENTLY MERGED PRs (last 50):
`

  const recentlyMerged = pullRequests
    .filter(pr => pr.merged_at !== null)
    .sort((a, b) => new Date(b.merged_at!).getTime() - new Date(a.merged_at!).getTime())
    .slice(0, 50)
  
  for (const pr of recentlyMerged) {
    const labels = pr.labels.map(l => l.name).join(', ') || 'none'
    output += `#${pr.number}: ${pr.title} [${labels}] - merged ${pr.merged_at?.split('T')[0] || 'unknown'} by @${pr.user.login}\n`
  }

  return output
}
