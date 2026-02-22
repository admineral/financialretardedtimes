import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

interface GitHubCommit {
  sha: string
  commit: {
    author: {
      name: string
      email: string
      date: string
    }
    message: string
  }
  author: {
    login: string
    avatar_url: string
    html_url: string
  } | null
  html_url: string
  parents: Array<{ sha: string }>
}

interface CommitResponse {
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
  url: string
  isMerge: boolean
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const repoUrl = searchParams.get('repo')
  const page = searchParams.get('page') || '1'
  const perPage = searchParams.get('per_page') || '30'

  if (!repoUrl) {
    return NextResponse.json(
      { error: 'Repository URL is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  const parsed = parseGitHubUrl(repoUrl)
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid GitHub repository URL. Use format: owner/repo or https://github.com/owner/repo' },
      { status: 400, headers: corsHeaders }
    )
  }

  const { owner, repo } = parsed

  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits?page=${page}&per_page=${perPage}`
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'FinancialRetardedTimes-GitHistory',
      },
      next: { revalidate: 60 },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: `Repository not found: ${owner}/${repo}. Make sure it's a public repository.` },
          { status: 404, headers: corsHeaders }
        )
      }
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'GitHub API rate limit exceeded. Please try again later.' },
          { status: 429, headers: corsHeaders }
        )
      }
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const commits: GitHubCommit[] = await response.json()

    const formattedCommits: CommitResponse[] = commits.map((commit) => ({
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

    const linkHeader = response.headers.get('Link')
    let hasNextPage = false
    let hasPrevPage = false
    
    if (linkHeader) {
      hasNextPage = linkHeader.includes('rel="next"')
      hasPrevPage = linkHeader.includes('rel="prev"')
    }

    return NextResponse.json({
      repository: {
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        url: `https://github.com/${owner}/${repo}`,
      },
      commits: formattedCommits,
      pagination: {
        page: parseInt(page),
        perPage: parseInt(perPage),
        hasNextPage,
        hasPrevPage,
      },
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error fetching commits:', error)
    return NextResponse.json(
      { error: 'Failed to fetch commits. Please check the repository URL and try again.' },
      { status: 500, headers: corsHeaders }
    )
  }
}
