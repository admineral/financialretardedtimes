/**
 * OpenClaw Today - Generate API
 * 
 * POST endpoint to generate newspaper content using AI.
 * Caches generated content in Supabase for persistence.
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { CONFIG, detectLanguage } from '../../lib/config'
import { OpenClawNewspaperSchema, type OpenClawNewspaperData } from '../../lib/schemas'
import { getPrompts, type Language } from '../../lib/prompts'
import { fetchCommits, formatCommitsForPrompt, calculateStats } from '../../actions/github'
import { 
  getCachedNewspaper, 
  saveNewspaperToCache,
  getCachedCommits,
  calculateStatsFromCache,
} from '../../actions/cache'

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const headersList = await headers()
    const body = await request.json().catch(() => ({}))
    const { 
      commitCount = CONFIG.newspaper.defaultCommitCount,
      language: requestedLanguage,
      dayRange = 1,
      forceRegenerate = false,
    } = body
    
    const language: Language = requestedLanguage || detectLanguage(headersList)
    const todayDate = new Date().toISOString().split('T')[0]
    
    console.log(`[OPENCLAW] Request for ${language} newspaper, date: ${todayDate}, dayRange: ${dayRange}`)
    
    // Check cache first (unless forced regeneration)
    if (!forceRegenerate) {
      const cached = await getCachedNewspaper(todayDate, dayRange, language)
      if (cached) {
        console.log(`[OPENCLAW] Returning cached newspaper from ${cached.updatedAt}`)
        return new Response(
          JSON.stringify({
            cached: true,
            cachedAt: cached.updatedAt,
            data: cached.data,
          }),
          { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
          }
        )
      }
    }
    
    console.log(`[OPENCLAW] Generating new newspaper in ${language}`)
    
    const prompts = getPrompts(language)
    
    // Calculate exact date range for commits
    // For "today", we want commits from today's date only
    // For multi-day ranges, we go back from today
    const endDate = todayDate // Today
    let startDate = todayDate // Default to today only
    
    if (dayRange > 1) {
      const start = new Date()
      start.setDate(start.getDate() - (dayRange - 1))
      startDate = start.toISOString().split('T')[0]
    }
    
    // Fetch commits for the exact date range
    let commits = await getCachedCommits({ 
      startDate, 
      endDate,
    })
    let uniqueContributors = 0
    
    console.log(`[OPENCLAW] Found ${commits.length} cached commits from ${startDate} to ${endDate} (${dayRange} day(s))`)
    
    if (commits.length === 0) {
      const githubCommits = await fetchCommits(commitCount)
      if (githubCommits.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No commits found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
      const stats = await calculateStats(githubCommits)
      uniqueContributors = stats.uniqueContributors
      
      const formattedCommits = await formatCommitsForPrompt(githubCommits)
      const today = new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
      
      console.log(`[OPENCLAW] Processing ${githubCommits.length} commits from GitHub`)
      
      const result = streamObject({
        model: openai(CONFIG.ai.model),
        schema: OpenClawNewspaperSchema,
        system: prompts.system,
        maxOutputTokens: CONFIG.ai.maxTokens,
        prompt: prompts.generatePrompt(today, CONFIG.repo.fullName, formattedCommits),
        async onFinish({ object }) {
          if (object) {
            console.log(`[OPENCLAW] Saving generated newspaper to cache`)
            await saveNewspaperToCache(
              todayDate, dayRange, language, 
              object as Record<string, unknown>,
              githubCommits.length, uniqueContributors
            )
          }
        },
      })
      
      return result.toTextStreamResponse()
    }
    
    // Use cached commits
    const stats = await calculateStatsFromCache(commits)
    uniqueContributors = stats.uniqueContributors
    
    // For very large commit counts, we send stats from ALL commits
    // but only the most recent commits in detail (to fit context window)
    const maxCommitsInPrompt = 200 // Enough for AI to understand patterns
    const commitsForPrompt = commits.length > maxCommitsInPrompt 
      ? commits.slice(0, maxCommitsInPrompt)
      : commits
    
    const formattedCommits = formatCachedCommitsForPrompt(
      commitsForPrompt, 
      stats, // Stats always include ALL commits
      commits.length // Total count for reference
    )
    const today = new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    
    console.log(`[OPENCLAW] Processing ${commits.length} cached commits (${commitsForPrompt.length} in prompt) for ${today}`)
    
    const result = streamObject({
      model: openai(CONFIG.ai.model),
      schema: OpenClawNewspaperSchema,
      system: prompts.system,
      maxOutputTokens: CONFIG.ai.maxTokens,
      prompt: prompts.generatePrompt(today, CONFIG.repo.fullName, formattedCommits),
      async onFinish({ object }) {
        if (object) {
          console.log(`[OPENCLAW] Saving generated newspaper to cache`)
          await saveNewspaperToCache(
            todayDate, dayRange, language,
            object as Record<string, unknown>,
            commits.length, uniqueContributors
          )
        }
      },
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[OPENCLAW API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Format cached commits for the AI prompt
 */
function formatCachedCommitsForPrompt(
  commits: Array<{
    sha: string
    shortSha: string
    message: string
    author: { name: string; username: string | null }
    date: string
    isMerge: boolean
  }>,
  stats: {
    total: number
    merges: number
    uniqueContributors: number
    mostActiveDay: string | null
    categories: Record<string, number>
  },
  totalCommitCount?: number
): string {
  const dominantCategory = Object.entries(stats.categories)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed'
  
  const actualTotal = totalCommitCount || stats.total
  const showingSubset = commits.length < actualTotal
  
  let output = `═══════════════════════════════════════════════════
📊 COMMIT STATISTICS (from ${actualTotal} total commits)
═══════════════════════════════════════════════════
• Total: ${actualTotal} commits
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

📝 COMMIT LOG${showingSubset ? ` (showing ${commits.length} most recent of ${actualTotal})` : ''}:
`
  
  for (const commit of commits) {
    const date = new Date(commit.date).toLocaleString('en-US', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    })
    const author = commit.author.username || commit.author.name
    const mergeTag = commit.isMerge ? ' [MERGE]' : ''
    
    // Include full commit message (header + body) for better context
    // Trim and normalize whitespace
    const fullMessage = commit.message.trim()
    const messageLines = fullMessage.split('\n')
    const firstLine = messageLines[0]
    const hasBody = messageLines.length > 1 && messageLines.slice(1).some(l => l.trim())
    
    output += `[${date}] ${author}${mergeTag}: ${firstLine} (${commit.shortSha})`
    
    // If commit has additional body text, include it indented
    if (hasBody) {
      const bodyLines = messageLines.slice(1)
        .map(l => l.trim())
        .filter(l => l)
        .slice(0, 5) // Max 5 body lines to keep prompt reasonable
        .map(l => `    ${l}`)
        .join('\n')
      if (bodyLines) {
        output += `\n${bodyLines}`
      }
    }
    output += '\n'
  }
  
  return output
}
