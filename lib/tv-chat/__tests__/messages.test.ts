import { describe, expect, it } from 'vitest'
import {
  dateFromTime,
  listedToDays,
  listedToMarkdown,
  mergeListedMessages,
  timeMs
} from '../messages'

describe('time helpers', () => {
  it('reads unix seconds and iso timestamps', () => {
    expect(dateFromTime('1521072000')).toBe('2018-03-15')
    expect(dateFromTime('2018-03-15T08:00:00.000Z')).toBe('2018-03-15')
    expect(timeMs('1521072000')).toBe(1521072000000)
  })
})

describe('mergeListedMessages', () => {
  it('merges history and live, dropping duplicate ids and text fingerprints', () => {
    const merged = mergeListedMessages({
      username: 'alice',
      historyDays: [
        {
          date: '2018-03-15',
          messages: [
            { id: 'h1', text: 'moinsn', time: '1521072000' },
            { id: 'dup', text: 'same', time: '1521072100' }
          ]
        }
      ],
      live: [
        { id: 'h1', text: 'moinsn', time: '1521072000' },
        { id: 'l2', text: 'live later', time: '2018-03-16T10:00:00.000Z' },
        { id: 'other', text: 'same', time: '1521072100' }
      ]
    })

        expect(merged.map(m => m.id)).toEqual(['l2', 'dup', 'h1'])
    expect(merged[0]).toMatchObject({ source: 'live', date: '2018-03-16' })
    expect(merged[1]).toMatchObject({ source: 'history', date: '2018-03-15' })
  })

  it('enriches quotes from raw text', () => {
    const [message] = mergeListedMessages({
      username: 'alice',
      historyDays: [
        {
          date: '2018-03-15',
          messages: [{ id: '1', text: '[quote="bob"]hi[/quote] later', time: '1' }]
        }
      ],
      live: []
    })
    expect(message.quotes).toEqual([{ username: 'bob', content: 'hi' }])
  })
})

describe('listed export shapes', () => {
  it('groups by date and writes markdown', () => {
    const messages = mergeListedMessages({
      username: 'alice',
      historyDays: [
        {
          date: '2018-03-15',
          messages: [
            {
              id: '1',
              time: '1521072000',
              text: '[quote="bob"]hi[/quote] see https://de.tradingview.com/chart/BTCUSD/abc/'
            }
          ]
        }
      ],
      live: []
    })
    expect(listedToDays(messages)).toHaveLength(1)
    const md = listedToMarkdown('alice', messages)
    expect(md).toContain('# Chat export — alice')
    expect(md).toContain('## 2018-03-15')
    expect(md).toContain('> **bob:** hi')
    expect(md).toContain('/chart/BTCUSD/abc/')
  })
})
