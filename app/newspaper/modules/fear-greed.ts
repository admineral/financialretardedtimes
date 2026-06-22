import { DailyFearGreedSchema } from '../lib/types'
import { defineNewspaperModule } from '../engine/module'
import { chat, market } from '../engine/resources'

export const fearGreedModule = defineNewspaperModule({
  id: 'sentiment.fearGreed',
  version: '1.0.0',
  title: 'Fear & Greed',
  description: 'Sentiment gauge for today, 3 days, and 7 days.',
  resourceNeeds: [chat.rolling('7d'), market.btc()],
  outputSchema: DailyFearGreedSchema,
  prompt: () => ({
    id: 'fear_greed',
    resources: ['chat.rolling.7d', 'market.btc'],
    outputPath: 'modules.fearGreed.data',
    instructions: [
      'Analyze sentiment for today, 3 days, and 7 days.',
      'Use only fear_greed_messages.',
      'Return numeric indices, German classifications, trend, insight, and top drivers.'
    ],
    forbidden: ['Never include //price Rate-Chart game tips.']
  }),
  cache: {
    ttlSeconds: 24 * 60 * 60,
    staleSeconds: 60 * 60,
    tags: ['newspaper:module:sentiment.fearGreed']
  },
  standaloneRoute: '/test-fg/api/analyze'
})
