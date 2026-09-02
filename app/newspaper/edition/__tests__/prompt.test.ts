/**
 * Prompt lego blocks: structure snapshots for the mega tri-edition
 * prompt and the widget-scoped single-mode prompts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildEditionPromptBlocks,
  buildWidgetPromptBlocks,
  renderEditionPrompt,
  EDITION_EDITORIAL_PROMPT,
  EDITION_SYSTEM_PROMPT
} from '../prompt'
import { makeInputs } from './fixtures'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buildEditionPromptBlocks (mega call)', () => {
  it('produces the expected lego structure', () => {
    const blocks = buildEditionPromptBlocks(makeInputs())

    expect(blocks.map(block => ({ id: block.id, group: block.group, active: block.active }))).toEqual([
      { id: 'editorial_rules', group: 'system', active: true },
      { id: 'issue_context', group: 'context', active: true },
      { id: 'input_chat_raw', group: 'input', active: true },
      { id: 'input_market', group: 'input', active: true },
      { id: 'task', group: 'task', active: true },
      { id: 'output_contract', group: 'contract', active: true }
    ])

    for (const block of blocks) {
      expect(block.charCount).toBe(block.body.length)
      expect(block.tokenEstimate).toBeGreaterThan(0)
    }
  })

  it('renders one prompt string with all key sections', () => {
    const prompt = renderEditionPrompt(buildEditionPromptBlocks(makeInputs()))

    expect(prompt).toContain('AUSGABE_KONTEXT/')
    expect(prompt).toContain('<chat-history timezone="Europe/Berlin" days="14"')
    expect(prompt).toContain('<market>')
    expect(prompt).toContain('AUFTRAG/')
    expect(prompt).toContain('OUTPUT_CONTRACT/')
    // Compact Berlin stamp + original text (no ISO / mod= prefix).
    expect(prompt).toContain('[2026-07-07 11:00] @bulldude (BTC:$?): long')
  })

  it('editorial briefing exposes genui catalog + rules but no caching/widget plumbing', () => {
    expect(EDITION_EDITORIAL_PROMPT).toContain('investigative')
    expect(EDITION_EDITORIAL_PROMPT).toContain('fearGreedVsBtc')
    expect(EDITION_EDITORIAL_PROMPT).toContain('DIVERSITAETS-REGELN')
    // The model must never see the persistence/caching machinery.
    expect(EDITION_EDITORIAL_PROMPT.toLowerCase()).not.toContain('cache')
    expect(EDITION_EDITORIAL_PROMPT.toLowerCase()).not.toContain('supabase')
    expect(EDITION_EDITORIAL_PROMPT.toLowerCase()).not.toContain('generation_id')
  })

  it('static prompts stay stable (snapshot)', () => {
    expect(EDITION_SYSTEM_PROMPT).toMatchSnapshot()
    expect(EDITION_EDITORIAL_PROMPT).toMatchSnapshot()
  })
})

describe('buildWidgetPromptBlocks (single mode)', () => {
  it('ticker/timeline get chat context but no market section', () => {
    for (const widgetId of ['ticker', 'timeline'] as const) {
      const blocks = buildWidgetPromptBlocks(makeInputs(), widgetId, 3)
      expect(blocks.map(block => block.id)).toEqual([
        'editorial_rules',
        'issue_context',
        'input_chat_raw',
        `widget_task_${widgetId}`
      ])
    }
  })

  it('fearGreed/traderLeaderboard additionally get the market section', () => {
    for (const widgetId of ['fearGreed', 'traderLeaderboard'] as const) {
      const blocks = buildWidgetPromptBlocks(makeInputs(), widgetId, 1)
      expect(blocks.map(block => block.id)).toEqual([
        'editorial_rules',
        'issue_context',
        'input_chat_raw',
        'input_market',
        `widget_task_${widgetId}`
      ])
    }
  })

  it('the widget task is scoped to the requested day range', () => {
    const blocks = buildWidgetPromptBlocks(makeInputs(), 'ticker', 3)
    const task = blocks[blocks.length - 1]
    expect(task.body).toContain('letzten 3 Tage')
    expect(task.refreshedBy).toEqual(['widget:ticker'])

    const blocks1d = buildWidgetPromptBlocks(makeInputs(), 'timeline', 1)
    expect(blocks1d[blocks1d.length - 1].body).toContain('24 Stunden')
  })
})
