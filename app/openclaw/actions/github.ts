/**
 * OpenClaw Today - GitHub Actions
 * 
 * Server actions for fetching GitHub data.
 * These run on the server and can be called from client components.
 */

'use server'

import { CONFIG } from '../lib/config'
import type { GitHubCommit, RepoInfo, CommitStats } from '../lib/types'

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

/**
 * Fetch commits from the configured repository
 */
export async function fetchCommits(count: number = CONFIG.newspaper.defaultCommitCount): Promise<GitHubCommit[]> {
  const { owner, name } = CONFIG.repo
  const perPage = Math.min(count, CONFIG.newspaper.maxCommitCount)
  
  const apiUrl = `https://api.github.com/repos/${owner}/${name}/commits?per_page=${perPage}`
  
  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpenClawToday-Newspaper',
    },
    next: { revalidate: CONFIG.cache.commits },
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  const commits: GitHubCommitResponse[] = await response.json()

  return commits.map((commit) => ({
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
  }))
}

/**
 * Fetch repository information
 */
export async function fetchRepoInfo(): Promise<RepoInfo> {
  const { owner, name } = CONFIG.repo
  const apiUrl = `https://api.github.com/repos/${owner}/${name}`
  
  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpenClawToday-Newspaper',
    },
    next: { revalidate: CONFIG.cache.repoInfo },
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

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
