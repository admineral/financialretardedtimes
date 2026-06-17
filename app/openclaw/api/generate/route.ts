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
import { isGitHubRateLimitError } from '../../lib/github-api'
import { OpenClawNewspaperSchema } from '../../lib/schemas'
import { getPrompts, type Language } from '../../lib/prompts'
import { fetchCommitsForDateRange, formatCommitsForPrompt, calculateStats } from '../../actions/github'
import { 
  getCachedNewspaper, 
  saveNewspaperToCache,
  getCachedCommits,
  calculateStatsFromCache,
  syncCommits,
} from '../../actions/cache'

function getSelectedDateRange(selectedDates: unknown, fallbackDate: string): { startDate: string; endDate: string; dates: string[] } {
  if (!Array.isArray(selectedDates)) {
    return { startDate: fallbackDate, endDate: fallbackDate, dates: [] }
  }

  const dates = selectedDates
    .filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()

  if (dates.length === 0) {
    return { startDate: fallbackDate, endDate: fallbackDate, dates }
  }

  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dates,
  }
}

function createAttemptId(clientAttemptId: unknown): string {
  if (typeof clientAttemptId === 'string' && clientAttemptId.trim()) {
    return clientAttemptId
  }

  return `server-${Date.now().toString(36)}`
}

function isOpenClawDebugEnabled(): boolean {
  return process.env.OPENCLAW_DEBUG_LOGS === 'true'
}

function logAttempt(attemptId: string, message: string, details?: Record<string, unknown>, debugOnly: boolean = false) {
  if (debugOnly && !isOpenClawDebugEnabled()) {
    return
  }

  if (details) {
    console.log(`[OPENCLAW API:${attemptId}] ${message}`, details)
    return
  }

  console.log(`[OPENCLAW API:${attemptId}] ${message}`)
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let language: Language = 'en'
  let attemptId = 'unknown'
  const startedAt = Date.now()

  try {
    const headersList = await headers()
    const body = await request.json().catch(() => ({}))
    const { 
      commitCount = CONFIG.newspaper.defaultCommitCount,
      language: requestedLanguage,
      dayRange = 1,
      forceRegenerate = false,
      selectedDates = [],
      attemptId: clientAttemptId,
    } = body
    attemptId = createAttemptId(clientAttemptId)
    
    language = requestedLanguage || detectLanguage(headersList)
    const todayDate = new Date().toISOString().split('T')[0]
    const selectedRange = getSelectedDateRange(selectedDates, todayDate)
    const cacheDate = selectedRange.endDate
    
    logAttempt(attemptId, 'Received generation request', {
      language,
      todayDate,
      cacheDate,
      dayRange,
      forceRegenerate,
      requestedCommitCount: commitCount,
      selectedDates,
      selectedRange,
      model: CONFIG.ai.model,
    }, true)
    logAttempt(attemptId, 'Request received', {
      language,
      cacheDate,
      dayRange,
      forceRegenerate,
      model: CONFIG.ai.model,
    })
    
    // Check cache first (unless forced regeneration)
    if (!forceRegenerate) {
      logAttempt(attemptId, 'Checking newspaper cache before generation', {
        requestDate: todayDate,
        cacheDate,
        dayRange,
        language,
      }, true)
      const cached = await getCachedNewspaper(cacheDate, dayRange, language)
      if (cached) {
        logAttempt(attemptId, 'Returning cached newspaper', {
          cachedAt: cached.updatedAt,
          commitCount: cached.commitCount,
          uniqueContributors: cached.uniqueContributors,
          durationMs: Date.now() - startedAt,
        })
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
      logAttempt(attemptId, 'No fresh newspaper cache found; continuing to generation')
    }
    
    const { startDate, endDate } = selectedRange
    const selectedRangeIncludesToday = endDate >= todayDate

    logAttempt(attemptId, 'Generating new newspaper')
    
    // Sync new commits only when the selected range can include current data.
    // Historical regenerations should not page through every commit since the latest cached commit.
    if (forceRegenerate && selectedRangeIncludesToday) {
      logAttempt(attemptId, 'Running capped incremental commit sync before regeneration', {
        reason: 'selected range includes today',
        startDate,
        endDate,
      }, true)
      logAttempt(attemptId, 'Syncing latest commits')
      const syncResult = await syncCommits(false, 'auto')
      logAttempt(attemptId, 'Incremental sync finished', syncResult)
    } else if (forceRegenerate) {
      logAttempt(attemptId, 'Skipping incremental sync for historical regeneration', {
        reason: 'selected range does not include today',
        startDate,
        endDate,
        todayDate,
      }, true)
      logAttempt(attemptId, 'Skipped sync for historical range', {
        startDate,
        endDate,
      })
    }
    
    const prompts = getPrompts(language)
    
    logAttempt(attemptId, 'Using commit date range for generation', {
      startDate,
      endDate,
      selectedDateCount: selectedRange.dates.length,
      fallbackUsed: selectedRange.dates.length === 0,
    }, true)
    
    // Fetch commits for the exact date range
    const commits = await getCachedCommits({ 
      startDate, 
      endDate,
    })
    let uniqueContributors = 0
    
    logAttempt(attemptId, 'Loaded cached commits for prompt range', {
      startDate,
      endDate,
      dayRange,
      cachedCommitCount: commits.length,
    })
    
    if (commits.length === 0) {
      logAttempt(attemptId, 'No cached commits found; fetching selected date range from GitHub', {
        startDate,
        endDate,
        commitCount,
      }, true)
      logAttempt(attemptId, 'Cache miss; fetching selected range from GitHub', {
        startDate,
        endDate,
      })
      const githubCommits = await fetchCommitsForDateRange(startDate, endDate, commitCount)
      if (githubCommits.length === 0) {
        logAttempt(attemptId, 'No commits found after selected-range GitHub fallback', {
          startDate,
          endDate,
          durationMs: Date.now() - startedAt,
        })
        return new Response(
          JSON.stringify({ error: 'No commits found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
      const stats = await calculateStats(githubCommits)
      uniqueContributors = stats.uniqueContributors
      
      const formattedCommits = await formatCommitsForPrompt(githubCommits)
      const today = new Date(`${endDate}T00:00:00Z`).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
        timeZone: 'UTC',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
      
      const promptText = prompts.generatePrompt(today, CONFIG.repo.fullName, formattedCommits)
      logAttempt(attemptId, 'Starting AI stream from selected-range GitHub commits', {
        startDate,
        endDate,
        githubCommitCount: githubCommits.length,
        uniqueContributors,
        promptCharacters: promptText.length,
      }, true)
      logAttempt(attemptId, 'Starting AI stream', {
        source: 'github-range',
        commitCount: githubCommits.length,
        promptCharacters: promptText.length,
      })
      
      const result = streamObject({
        model: openai(CONFIG.ai.model),
        schema: OpenClawNewspaperSchema,
        system: prompts.system,
        prompt: promptText,
        providerOptions: { openai: { reasoning: { effort: 'high' } } },
        async onFinish({ object }) {
          if (object) {
            logAttempt(attemptId, 'AI stream finished; saving generated newspaper to cache', {
              durationMs: Date.now() - startedAt,
              headline: typeof object.headline === 'string' ? object.headline : null,
              cacheDate,
            }, true)
            logAttempt(attemptId, 'AI stream finished; saving cache')
            await saveNewspaperToCache(
              cacheDate, dayRange, language, 
              object as Record<string, unknown>,
              githubCommits.length, uniqueContributors
            )
            logAttempt(attemptId, 'Saved generated newspaper to cache', {
              durationMs: Date.now() - startedAt,
            })
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
    const today = new Date(`${endDate}T00:00:00Z`).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      timeZone: 'UTC',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    
    const promptText = prompts.generatePrompt(today, CONFIG.repo.fullName, formattedCommits)
    const dominantCategory = Object.entries(stats.categories)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed'
    
    logAttempt(attemptId, 'Starting AI stream from cached commits', {
      totalCachedCommits: commits.length,
      commitsIncludedInPrompt: commitsForPrompt.length,
      uniqueContributors,
      merges: stats.merges,
      dominantCategory,
      promptCharacters: promptText.length,
      dateLabel: today,
    }, true)
    logAttempt(attemptId, 'Starting AI stream', {
      source: 'db-cache',
      totalCachedCommits: commits.length,
      commitsIncludedInPrompt: commitsForPrompt.length,
      promptCharacters: promptText.length,
    })
    
    const result = streamObject({
      model: openai(CONFIG.ai.model),
      schema: OpenClawNewspaperSchema,
      system: prompts.system,
      prompt: promptText,
      providerOptions: { openai: { reasoning: { effort: 'high' } } },
      async onFinish({ object }) {
        if (object) {
          logAttempt(attemptId, 'AI stream finished; saving generated newspaper to cache', {
            durationMs: Date.now() - startedAt,
            headline: typeof object.headline === 'string' ? object.headline : null,
            cacheDate,
          }, true)
          logAttempt(attemptId, 'AI stream finished; saving cache')
          await saveNewspaperToCache(
            cacheDate, dayRange, language,
            object as Record<string, unknown>,
            commits.length, uniqueContributors
          )
          logAttempt(attemptId, 'Saved generated newspaper to cache', {
            durationMs: Date.now() - startedAt,
          })
        }
      },
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    if (isGitHubRateLimitError(error)) {
      console.warn(`[OPENCLAW API:${attemptId}] GitHub is rate limited; showing friendly retry-later message`, {
        durationMs: Date.now() - startedAt,
      })
      const message = language === 'de'
        ? 'GitHub ist gerade nicht erreichbar. Bitte versuche es später noch einmal.'
        : 'GitHub is not available right now. Please try again later.'

      return new Response(
        JSON.stringify({ error: message, code: 'GITHUB_RATE_LIMITED' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.error(`[OPENCLAW API:${attemptId}] Error after ${Date.now() - startedAt}ms:`, error)
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
