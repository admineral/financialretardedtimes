import { NextRequest, NextResponse } from 'next/server'
import type { BranchResponse, CompareResponse } from '../../lib/types'

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

/**
 * Generate a unique color for each branch using HSL
 */
function generateBranchColor(index: number, total: number): string {
  if (index === 0) return '#10b981' // Green for default branch
  
  // Generate distinct colors using golden ratio
  const hue = (index * 137.508) % 360 // Golden angle
  const saturation = 70 + (index % 3) * 10
  const lightness = 55 + (index % 2) * 10
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const repoUrl = searchParams.get('repo')
  const includeStats = searchParams.get('stats') === 'true'

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
    // Fetch repository info to get default branch
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'FinancialRetardedTimes-GitHistory',
        },
        next: { revalidate: 300 },
      }
    )

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        return NextResponse.json(
          { error: 'Repository not found' },
          { status: 404, headers: corsHeaders }
        )
      }
      throw new Error(`GitHub API error: ${repoResponse.status}`)
    }

    const repoData = await repoResponse.json()
    const defaultBranch = repoData.default_branch

    // Fetch all branches
    const branchesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'FinancialRetardedTimes-GitHistory',
        },
        next: { revalidate: 300 },
      }
    )

    if (!branchesResponse.ok) {
      throw new Error(`Failed to fetch branches: ${branchesResponse.status}`)
    }

    const branches: BranchResponse[] = await branchesResponse.json()

    // Optionally fetch ahead/behind stats for each branch
    const branchesWithStats = await Promise.all(
      branches.map(async (branch, index) => {
        let aheadBy = 0
        let behindBy = 0
        let lastCommitDate = ''

        if (includeStats && branch.name !== defaultBranch) {
          try {
            // Compare branch with default branch
            const compareResponse = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/compare/${defaultBranch}...${branch.name}`,
              {
                headers: {
                  'Accept': 'application/vnd.github.v3+json',
                  'User-Agent': 'FinancialRetardedTimes-GitHistory',
                },
                next: { revalidate: 300 },
              }
            )

            if (compareResponse.ok) {
              const compareData: CompareResponse = await compareResponse.json()
              aheadBy = compareData.ahead_by
              behindBy = compareData.behind_by
            }
          } catch (error) {
            console.warn(`Failed to compare branch ${branch.name}:`, error)
          }
        }

        // Fetch last commit date
        try {
          const commitResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits/${branch.commit.sha}`,
            {
              headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'FinancialRetardedTimes-GitHistory',
              },
              next: { revalidate: 300 },
            }
          )

          if (commitResponse.ok) {
            const commitData = await commitResponse.json()
            lastCommitDate = commitData.commit.author.date
          }
        } catch (error) {
          console.warn(`Failed to fetch commit date for ${branch.name}:`, error)
        }

        // Sort: default branch first, then by most recent activity
        const sortOrder = branch.name === defaultBranch ? 0 : index + 1

        return {
          name: branch.name,
          sha: branch.commit.sha,
          lane: sortOrder,
          color: generateBranchColor(sortOrder, branches.length),
          isDefault: branch.name === defaultBranch,
          isProtected: branch.protected,
          aheadBy,
          behindBy,
          lastCommitDate,
        }
      })
    )

    // Sort branches: default first, then by recent activity
    branchesWithStats.sort((a, b) => {
      if (a.isDefault) return -1
      if (b.isDefault) return 1
      return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime()
    })

    // Reassign lanes after sorting
    branchesWithStats.forEach((branch, index) => {
      branch.lane = index
    })

    return NextResponse.json(
      {
        repository: {
          owner,
          repo,
          fullName: `${owner}/${repo}`,
          url: `https://github.com/${owner}/${repo}`,
          defaultBranch,
        },
        branches: branchesWithStats,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Error fetching branches:', error)
    return NextResponse.json(
      { error: 'Failed to fetch branches' },
      { status: 500, headers: corsHeaders }
    )
  }
}
