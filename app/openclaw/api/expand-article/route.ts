/**
 * route.ts (expand-article API)
 * 
 * AI-powered article expansion endpoint for OpenClaw commits.
 * 
 * Takes a theme (from brief news or technical highlight) and all commits,
 * then generates a full in-depth article about that specific topic.
 * 
 * ENDPOINT: POST /openclaw/api/expand-article
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { OpenClawExpandedArticleSchema } from '../../lib/schemas'
import { CONFIG } from '../../lib/config'

/**
 * System prompt for expanding OpenClaw commit themes into full articles
 */
const EXPAND_ARTICLE_PROMPT = `You are a senior technical editor for "OpenClaw Today" - a premium tech newspaper covering OpenClaw development.

## About OpenClaw

OpenClaw is the viral open-source AI assistant that "actually does things" - not just chat, but autonomous task execution. Created by Peter Steinberger (@steipete, founder of PSPDFKit), it became one of the fastest-growing GitHub projects ever.

### The Project
- 218k+ GitHub stars, 700+ contributors, 13,900+ commits
- Reached 100k stars in under a month (January 2026)
- Described as "Claude with hands" - connecting LLMs to real-world actions

### Architecture
- **Gateway**: Control plane orchestrating all communications
- **Pi agent**: Runtime for executing tasks
- **Skills**: Modular capabilities (5,700+ community-built)
- **Canvas**: Live visual workspace
- **Channels**: WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix, WebChat

### Tech Stack
TypeScript (85%), Swift (11%), Kotlin (1.4%). MIT licensed, self-hosted.

## Your Task

You're given:
1. A THEME (the article topic from a brief news item or technical highlight)
2. ALL COMMITS from the selected time period

Your job is to write an IN-DEPTH article that:
- Focuses specifically on the given theme
- Analyzes the commits related to that theme
- Identifies patterns, trends, and the "story" behind the changes
- Provides technical insights for developers
- Celebrates the contributors

## Writing Guidelines

**Title**: Catchy, specific to the theme (not generic)

**Introduction**: Hook the reader with why this matters

**Sections**: Deep dive into different aspects:
- What changed technically
- Who drove the changes
- How it connects to OpenClaw's architecture
- Impact on users

**Trend Analysis**: What pattern do these commits reveal? Is it a stability push, feature expansion, refactoring effort?

**Technical Deep Dive**: For the developer audience - explain the technical details

**Key Takeaways**: What should readers remember?

**Outlook**: What might come next based on these patterns?

## Tone

- Enthusiastic but professional
- Write like a tech journalist who genuinely cares about open source
- Occasional lobster references 🦞
- Celebrate the Claw Crew community
- Be specific - reference actual commits and contributors

## Commit Prefixes

- feat(scope): → Feature
- fix(scope): → Bugfix  
- refactor(scope): → Refactor
- docs(scope): → Documentation
- perf(scope): → Performance
- test(scope): → Testing
- chore(scope): → Infrastructure`

/**
 * POST handler for article expansion
 */
export async function POST(request: NextRequest) {
  await headers()
  
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  try {
    const body = await request.json()
    const {
      theme,
      themeType,
      commits,
      language = 'en',
      dayRange = 1,
      selectedDate,
    } = body
    
    if (!theme || !commits || commits.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: theme, commits' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const languageInstruction = language === 'de'
      ? 'Schreibe den gesamten Artikel auf Deutsch.'
      : 'Write the entire article in English.'
    
    const formattedCommits = commits.map((c: {
      sha: string
      message: string
      author: { name: string; username?: string }
      date: string
      isMerge?: boolean
    }) => {
      const author = c.author.username || c.author.name
      const date = new Date(c.date).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      const mergeTag = c.isMerge ? ' [MERGE]' : ''
      return `[${date}] ${c.sha.substring(0, 7)}${mergeTag} @${author}: ${c.message.split('\n')[0]}`
    }).join('\n')
    
    const prompt = `${languageInstruction}

═══════════════════════════════════════════════════════════════════════
ARTICLE THEME
═══════════════════════════════════════════════════════════════════════

Type: ${themeType || 'general'}
Theme: ${theme.title || theme}
${theme.description ? `Description: ${theme.description}` : ''}
${theme.relatedCommits ? `Related Commits Count: ${theme.relatedCommits}` : ''}

═══════════════════════════════════════════════════════════════════════
ALL COMMITS (${commits.length} total, ${dayRange} day${dayRange > 1 ? 's' : ''})
═══════════════════════════════════════════════════════════════════════

Date: ${selectedDate}
Repository: ${CONFIG.repo.fullName}

${formattedCommits}

═══════════════════════════════════════════════════════════════════════
TASK
═══════════════════════════════════════════════════════════════════════

Write a comprehensive article about "${theme.title || theme}".

1. Analyze ALL commits and find which ones relate to this theme
2. Identify the pattern/trend these commits reveal
3. Deep dive into the technical changes
4. Celebrate the contributors involved
5. Explain why this matters for OpenClaw users
6. Predict what might come next

Focus on storytelling - don't just list commits, tell the STORY of this development effort.`

    console.log(`[OPENCLAW EXPAND] 📝 Generating article for: "${theme.title || theme}"`)
    console.log(`[OPENCLAW EXPAND]    Commits: ${commits.length}, Language: ${language}`)
    
    const result = streamObject({
      model: openai(CONFIG.ai.model),
      schema: OpenClawExpandedArticleSchema,
      system: EXPAND_ARTICLE_PROMPT,
      maxOutputTokens: CONFIG.ai.maxTokens,
      prompt,
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[OPENCLAW EXPAND API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
