/**
 * OpenClaw Issues Today - Generate API
 * 
 * POST endpoint to generate issues/PRs newspaper content using AI.
 * Analyzes all issues and PRs, clusters them, and generates actionable prompts.
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { CONFIG, detectLanguage } from '../../lib/config'
import { OpenClawIssuesNewspaperSchema } from '../../lib/schemas'
import { getIssuesPrompts, type Language } from '../../lib/prompts'
import { 
  fetchAllIssues, 
  fetchAllPullRequests, 
  calculateIssueStats,
  formatIssuesForPrompt,
} from '../../actions/github'

export const maxDuration = 120

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
      language: requestedLanguage,
      state = 'all',
      maxPages = 40,
    } = body
    
    const language: Language = requestedLanguage || detectLanguage(headersList)
    
    // Cap maxPages to 10 (GitHub's pagination limit is ~1000 results)
    const effectiveMaxPages = Math.min(maxPages, 10)
    
    console.log(`[OPENCLAW-ISSUES] Starting fetch for ${language} analysis, state: ${state}, maxPages: ${effectiveMaxPages}`)
    
    // Fetch issues first, then PRs (sequentially to avoid rate limits)
    console.log(`[OPENCLAW-ISSUES] Fetching issues...`)
    const issues = await fetchAllIssues(state, effectiveMaxPages)
    console.log(`[OPENCLAW-ISSUES] ✅ Fetched ${issues.length} issues`)
    
    console.log(`[OPENCLAW-ISSUES] Fetching pull requests...`)
    const pullRequests = await fetchAllPullRequests(state, effectiveMaxPages)
    console.log(`[OPENCLAW-ISSUES] ✅ Fetched ${pullRequests.length} PRs`)
    
    console.log(`[OPENCLAW-ISSUES] Total: ${issues.length} issues + ${pullRequests.length} PRs`)
    
    if (issues.length === 0 && pullRequests.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No issues or pull requests found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Calculate stats
    const stats = await calculateIssueStats(issues, pullRequests)
    
    // Format for AI prompt
    const formattedIssues = await formatIssuesForPrompt(issues, pullRequests, stats)
    
    const prompts = getIssuesPrompts(language)
    const today = new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
    })
    
    console.log(`[OPENCLAW-ISSUES] Generating analysis with AI...`)
    
    const result = streamObject({
      model: openai('gpt-5.4'),
      schema: OpenClawIssuesNewspaperSchema,
      system: prompts.system,
      prompt: prompts.generatePrompt(today, CONFIG.repo.fullName, formattedIssues),
      providerOptions: { openai: { reasoning: { effort: 'high' } } },
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[OPENCLAW-ISSUES API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({ 
      message: 'Use POST to generate issues newspaper',
      params: {
        language: 'en | de (optional, auto-detected)',
        state: 'all | open | closed (default: all)',
        maxPages: 'number (default: 10, max 10 due to GitHub pagination limits)',
      }
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
