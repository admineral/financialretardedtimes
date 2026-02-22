import { NextRequest, NextResponse } from 'next/server'
import { buildCommitGraph } from '../../lib/graph-utils'
import type { Branch, Commit, GraphData } from '../../lib/types'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
    /^([^\/]+)\/([^\/]+)$/,
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
    }
  }
  
  return null
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const repoUrl = searchParams.get('repo')
  const branchNames = searchParams.get('branches')?.split(',') || []
  const limit = parseInt(searchParams.get('limit') || '100')

  if (!repoUrl) {
    return NextResponse.json(
      { error: 'Repository URL is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  const parsed = parseGitHubUrl(repoUrl)
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid GitHub repository URL' },
      { status: 400, headers: corsHeaders }
    )
  }

  const { owner, repo } = parsed

  try {
    // First, get branches info
    const branchesResponse = await fetch(
      `${request.nextUrl.origin}/git-history/api/branches?repo=${encodeURIComponent(repoUrl)}&stats=true`,
      { next: { revalidate: 300 } }
    )

    if (!branchesResponse.ok) {
      throw new Error('Failed to fetch branches')
    }

    const branchesData = await branchesResponse.json()
    const branches: Branch[] = branchesData.branches
    const repository = branchesData.repository

    // Filter branches if specific ones requested
    const selectedBranches = branchNames.length > 0
      ? branches.filter(b => branchNames.includes(b.name))
      : branches

    if (selectedBranches.length === 0) {
      return NextResponse.json(
        { error: 'No branches selected or found' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Fetch commits from each branch
    const commitMap = new Map<string, Commit>()
    const commitParents = new Map<string, string[]>()

    // Fetch commits in parallel for all branches (limited to prevent rate limiting)
    const branchesToFetch = selectedBranches.slice(0, 5) // Limit to 5 branches to avoid rate limits
    
    await Promise.all(
      branchesToFetch.map(async (branch) => {
        try {
          const commitsResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch.sha}&per_page=${Math.min(limit, 100)}`,
            {
              headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'FinancialRetardedTimes-GitHistory',
              },
              next: { revalidate: 300 },
            }
          )

          if (!commitsResponse.ok) {
            console.warn(`Failed to fetch commits for branch ${branch.name}`)
            return
          }

          const commits: GitHubCommitResponse[] = await commitsResponse.json()

          commits.forEach(commit => {
            // Deduplicate commits by SHA
            if (!commitMap.has(commit.sha)) {
              commitMap.set(commit.sha, {
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
              })

              // Store parent relationships
              commitParents.set(
                commit.sha,
                commit.parents.map(p => p.sha)
              )
            }
          })
        } catch (error) {
          console.error(`Error fetching commits for branch ${branch.name}:`, error)
        }
      })
    )

    // Build the commit graph with lane assignments
    const commits = Array.from(commitMap.values())
    const graphCommits = buildCommitGraph(commits, selectedBranches, commitParents)

    // Calculate max lanes
    const maxLanes = Math.max(...graphCommits.map(c => c.lane), 0) + 1

    const graphData: GraphData = {
      repository,
      branches: selectedBranches,
      commits: graphCommits,
      maxLanes,
    }

    return NextResponse.json(graphData, { headers: corsHeaders })
  } catch (error) {
    console.error('Error building commit graph:', error)
    return NextResponse.json(
      { error: 'Failed to build commit graph' },
      { status: 500, headers: corsHeaders }
    )
  }
}
