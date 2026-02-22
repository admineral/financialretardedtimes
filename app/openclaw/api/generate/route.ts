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
    
    // Fetch commits (prefer cached commits)
    let commits = await getCachedCommits({ days: dayRange * 2, limit: commitCount })
    let uniqueContributors = 0
    
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
    
    const formattedCommits = formatCachedCommitsForPrompt(commits, stats)
    const today = new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    
    console.log(`[OPENCLAW] Processing ${commits.length} cached commits for ${today}`)
    
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
  }
): string {
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
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    })
    const author = commit.author.username || commit.author.name
    const mergeTag = commit.isMerge ? ' [MERGE]' : ''
    const messageFirstLine = commit.message.split('\n')[0]
    
    output += `[${date}] ${author}${mergeTag}: ${messageFirstLine} (${commit.shortSha})\n`
  }
  
  return output
}
