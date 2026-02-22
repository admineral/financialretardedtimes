/**
 * OpenClaw Today - Generate API
 * 
 * POST endpoint to generate newspaper content using AI.
 * Automatically detects language from Vercel headers or Accept-Language.
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { CONFIG, detectLanguage } from '../../lib/config'
import { OpenClawNewspaperSchema } from '../../lib/schemas'
import { getPrompts, type Language } from '../../lib/prompts'
import { fetchCommits, formatCommitsForPrompt } from '../../actions/github'

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Get headers for language detection
    const headersList = await headers()
    
    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { 
      commitCount = CONFIG.newspaper.defaultCommitCount,
      language: requestedLanguage,
    } = body
    
    // Detect language: use requested language, or detect from headers
    const language: Language = requestedLanguage || detectLanguage(headersList)
    
    console.log(`[OPENCLAW] Generating newspaper in ${language}`)
    
    // Get prompts for the detected language
    const prompts = getPrompts(language)
    
    // Fetch commits
    const commits = await fetchCommits(commitCount)
    
    if (commits.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No commits found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Format commits for the prompt
    const formattedCommits = await formatCommitsForPrompt(commits)
    
    // Get today's date in the appropriate format
    const today = new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    
    console.log(`[OPENCLAW] Processing ${commits.length} commits for ${today}`)
    
    // Stream AI response
    const result = streamObject({
      model: openai(CONFIG.ai.model),
      schema: OpenClawNewspaperSchema,
      system: prompts.system,
      maxOutputTokens: CONFIG.ai.maxTokens,
      prompt: prompts.generatePrompt(today, CONFIG.repo.fullName, formattedCommits),
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
