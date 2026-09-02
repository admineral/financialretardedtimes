import { describe, expect, it } from 'vitest'
import { tvChatOrigin, tvHistoryUrl } from '../tv-history'

describe('tvHistoryUrl', () => {
  it('uses de.tradingview.com for German rooms', () => {
    const url = tvHistoryUrl('bitcoin_de_DE', '2026-09-01', 'alice')
    expect(tvChatOrigin('bitcoin_de_DE')).toBe('https://de.tradingview.com')
    expect(url).toContain('https://de.tradingview.com/chat/history/')
    expect(url).toContain('room=bitcoin_de_DE')
  })

  it('uses www.tradingview.com for English rooms', () => {
    const url = tvHistoryUrl('bitcoin', '2026-09-01', 'alice')
    expect(tvChatOrigin('bitcoin')).toBe('https://www.tradingview.com')
    expect(url).toContain('https://www.tradingview.com/chat/history/')
    expect(url).toContain('room=bitcoin')
    expect(url).not.toContain('de.tradingview.com')
  })
})
