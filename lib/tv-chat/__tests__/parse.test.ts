import { describe, expect, it } from 'vitest'
import { classifyUrls, edgesFromMessage, enrichMessage, extractMentions, extractQuotes } from '../parse'

describe('extractQuotes', () => {
  it('pulls quoted usernames and bodies', () => {
    const text = '[quote="KevinSagitario"]geh du dir mal schön Schuhe kaufen[/quote]\nich glaub an die Technologie'
    expect(extractQuotes(text)).toEqual([
      { username: 'KevinSagitario', content: 'geh du dir mal schön Schuhe kaufen' }
    ])
  })
})

describe('extractMentions', () => {
  it('finds @handles and skips self', () => {
    expect(extractMentions('hey @carol_x and @alice', 'alice')).toEqual(['carol_x'])
  })
})

describe('classifyUrls', () => {
  it('splits idea, chart and external links', () => {
    const text = [
      'see https://de.tradingview.com/chart/BTCUSD/mcRTdazc/',
      'shot https://www.tradingview.com/x/abc123/',
      'news https://www.crypto51.app/coins'
    ].join(' ')
    const urls = classifyUrls(text)
    expect(urls.chartUrls[0]).toContain('/chart/BTCUSD/')
    expect(urls.ideaUrls[0]).toContain('/x/')
    expect(urls.externalUrls[0]).toContain('crypto51.app')
  })
})

describe('enrichMessage', () => {
  it('attaches quotes, mentions and urls', () => {
    const msg = enrichMessage({
      id: '1',
      time: '1',
      author: 'alice',
      text: '[quote="bob"]dump?[/quote] @dave https://de.tradingview.com/chart/BTCUSD/abc/'
    })
    expect(msg.quotes[0].username).toBe('bob')
    expect(msg.mentions).toEqual(['dave'])
    expect(msg.chartUrls).toHaveLength(1)
  })
})

describe('edgesFromMessage', () => {
  it('builds quote and mention edges from the author', () => {
    const msg = enrichMessage({
      id: '1',
      time: '1',
      author: 'alice',
      text: '[quote="bob"]hi[/quote] ping @carol_x'
    })
    expect(edgesFromMessage('alice', msg)).toEqual([
      { from: 'alice', to: 'bob', kind: 'quote' },
      { from: 'alice', to: 'carol_x', kind: 'mention' }
    ])
  })
})