/**
 * Schema round-trips for the tri-edition AI contract, including the
 * leaderboard fix (worstCall nullable — the old pipeline forced
 * traderLeaderboard.data to z.null() and aborted saves).
 */

import { describe, expect, it } from 'vitest'
import {
  EditionBlockSchema,
  EditionContentSchema,
  EditionLeaderboardSchema,
  TriEditionAISchema,
  isNewspaperEdition
} from '../types'
import { makeEdition, makeEditionContent, makeLeaderboard, makeTriEdition } from './fixtures'

describe('TriEditionAISchema', () => {
  it('round-trips a full tri-edition object unchanged', () => {
    const fixture = makeTriEdition()
    const parsed = TriEditionAISchema.parse(fixture)
    expect(parsed).toEqual(fixture)
  })

  it('accepts a null traderLeaderboard (thin data situation)', () => {
    const fixture = { ...makeTriEdition(), traderLeaderboard: null }
    expect(TriEditionAISchema.parse(fixture).traderLeaderboard).toBeNull()
  })

  it('survives JSON serialization (what gets stored in newspaper_cache)', () => {
    const fixture = makeTriEdition()
    const parsed = TriEditionAISchema.parse(JSON.parse(JSON.stringify(fixture)))
    expect(parsed).toEqual(fixture)
  })

  it('rejects an edition with too few blocks', () => {
    const broken = makeTriEdition()
    broken.edition1d.blocks = broken.edition1d.blocks.slice(0, 2)
    expect(() => TriEditionAISchema.parse(broken)).toThrow()
  })
})

describe('EditionLeaderboardSchema (the v1 save-abort fix)', () => {
  it('accepts entries with worstCall: null', () => {
    const leaderboard = makeLeaderboard()
    expect(leaderboard.leaderboard.some(entry => entry.worstCall === null)).toBe(true)
    expect(() => EditionLeaderboardSchema.parse(leaderboard)).not.toThrow()
  })

  it('accepts entries with a full worstCall object', () => {
    const leaderboard = makeLeaderboard()
    expect(leaderboard.leaderboard.some(entry => entry.worstCall !== null)).toBe(true)
    const parsed = EditionLeaderboardSchema.parse(leaderboard)
    expect(parsed.leaderboard[1].worstCall?.quote).toBe('short jetzt')
  })
})

describe('EditionBlockSchema union', () => {
  it('parses every block type of the fixture edition', () => {
    const content = EditionContentSchema.parse(makeEditionContent('Tagesausgabe'))
    const types = content.blocks.map(block => EditionBlockSchema.parse(block).type)
    expect(types).toEqual(['coverStory', 'sectionHeader', 'dataComponent', 'quoteWall', 'chatExcerpt', 'article'])
  })

  it('rejects unknown block types', () => {
    expect(() => EditionBlockSchema.parse({ type: 'marquee', text: 'nope' })).toThrow()
  })
})

describe('isNewspaperEdition (stored envelope guard)', () => {
  it('recognizes a current-format edition', () => {
    expect(isNewspaperEdition(makeEdition())).toBe(true)
  })

  it('rejects legacy rows and garbage', () => {
    expect(isNewspaperEdition({ meta: { formatVersion: 'old' }, content: { blocks: [] } })).toBe(false)
    expect(isNewspaperEdition({ featuredArticle: {} })).toBe(false)
    expect(isNewspaperEdition(null)).toBe(false)
  })
})
