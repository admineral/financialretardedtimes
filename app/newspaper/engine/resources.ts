import type { ResourceNeed } from './types'

function need(id: string, kind: ResourceNeed['kind'], params?: Record<string, unknown>): ResourceNeed {
  return { id, kind, params }
}

export const chat = {
  range(id: string, params?: Record<string, unknown>) {
    return need(`chat.range.${id}`, 'chat', params)
  },
  rolling(window: '24h' | '3d' | '7d') {
    return need(`chat.rolling.${window}`, 'chat', { window })
  },
  activeChatters() {
    return need('chat.activeChatters', 'chat')
  },
  chartUrls() {
    return need('chat.chartUrls', 'chat')
  }
}

export const market = {
  btc() {
    return need('market.btc', 'market')
  },
  ohlc(timeframe = '15m') {
    return need(`market.ohlc.${timeframe}`, 'market', { timeframe })
  }
}

export const avatar = {
  userMap() {
    return need('avatar.userMap', 'avatar')
  }
}

export const cache = {
  issue() {
    return need('cache.issue', 'cache')
  }
}
