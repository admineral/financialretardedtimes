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
const EXPAND_ARTICLE_PROMPT = `You are a technical chronicler for "OpenClaw Today" - documenting OpenClaw development activity.

## About OpenClaw

OpenClaw is an open-source AI assistant for autonomous task execution. Created by Peter Steinberger (@steipete).

### Architecture
- **Gateway**: Control plane orchestrating communications
- **Pi agent**: Runtime for executing tasks
- **Skills**: Modular capabilities
- **Canvas**: Visual workspace
- **Channels**: WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix, WebChat

### Tech Stack
TypeScript (85%), Swift (11%), Kotlin (1.4%). MIT licensed.

## Your Task

You're given:
1. A THEME (the topic from a brief news item or technical highlight)
2. ALL COMMITS from the selected time period

Write a detailed summary that:
- Focuses on the given theme
- Analyzes commits related to that theme
- Identifies patterns in the changes
- Provides technical context
- Credits the contributors factually

═══════════════════════════════════════════════════════════════════════
TONE: NEUTRAL THIRD-PERSON OBSERVER
═══════════════════════════════════════════════════════════════════════

✅ HOW TO WRITE:

• Observer, not cheerleader - document what happened
• Dry over excited - let the work speak for itself
• State facts: "@username added X", "@username refactored Y"
• Reference specific commits and SHAs
• Keep paragraphs short and focused

❌ AVOID:

• Hype language ("exciting!", "amazing!", "incredible!", "game-changing!")
• Superlatives ("best", "biggest", "most important")
• Forced enthusiasm or celebration
• Emojis
• Editorializing beyond what commits show
• Flowery language or filler

═══════════════════════════════════════════════════════════════════════
EXAMPLES
═══════════════════════════════════════════════════════════════════════

✅ GOOD introduction:
"The Gateway saw focused attention this week with 12 commits addressing error handling. @vignesh07 led the effort with 7 commits, primarily targeting WebSocket reconnection logic."

❌ BAD introduction:
"In an exciting week of development, the incredible Gateway team delivered amazing improvements that will change everything for users!"

✅ GOOD section:
heading: "Connection Retry Logic"
content: "@sebslight added exponential backoff to the WebSocket handler (abc1234). The implementation includes configurable max retries and timeout values. A related commit (def5678) addresses edge cases during network transitions."

❌ BAD section:
heading: "Game-Changing Retry Logic! 🚀"
content: "The amazing @sebslight absolutely crushed it with an incredible new retry system! This is exactly what users have been waiting for!"

✅ GOOD contributor insight:
role: "Lead"
contribution: "Authored 7 of 12 commits, focusing on timeout handling and error recovery paths."

❌ BAD contributor insight:
role: "Legend"
contribution: "Absolutely dominated this sprint with legendary contributions that showcase their incredible talent!"

═══════════════════════════════════════════════════════════════════════

**Title**: Descriptive, specific to the theme

**Introduction**: 2-3 sentences on what this work addresses

**Sections**: Cover different aspects factually:
- What changed technically (reference specific commits)
- Who contributed (with @ mentions)
- How it connects to OpenClaw architecture
- What it affects (users, APIs, stability)

**Trend Analysis**: What pattern do these commits show? Stability focus, feature addition, refactoring?

**Technical Deep Dive**: Technical details for developers - keep it factual

**Key Takeaways**: 2-4 bullet points summarizing the changes

**Outlook**: Based on commit patterns, what might follow (not speculation)

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

Write a detailed summary about "${theme.title || theme}".

1. Analyze ALL commits and find which ones relate to this theme
2. Identify the pattern these commits reveal
3. Document the technical changes with specific commit references
4. Credit the contributors factually (who did what)
5. Note what this affects (users, APIs, stability)
6. Based on patterns, note what might follow

Keep it factual and concise. Let the commits speak for themselves.`

    console.log(`[OPENCLAW EXPAND] 📝 Generating article for: "${theme.title || theme}"`)
    console.log(`[OPENCLAW EXPAND]    Commits: ${commits.length}, Language: ${language}`)
    
    const result = streamObject({
      model: openai(CONFIG.ai.model),
      schema: OpenClawExpandedArticleSchema,
      system: EXPAND_ARTICLE_PROMPT,
      prompt,
      providerOptions: { openai: { reasoning: { effort: 'high' } } },
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
