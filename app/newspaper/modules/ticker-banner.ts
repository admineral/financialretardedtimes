import { z } from 'zod'
import { DailyTickerEventSchema } from '../lib/types'
import { defineNewspaperModule } from '../engine/module'
import { chat } from '../engine/resources'

export const tickerBannerModule = defineNewspaperModule({
  id: 'chat.tickerBanner',
  version: '1.0.0',
  title: 'Ticker Banner',
  description: 'Moving banner with punchy rolling 24h chat highlights.',
  resourceNeeds: [chat.rolling('24h')],
  outputSchema: z.array(DailyTickerEventSchema),
  prompt: () => ({
    id: 'ticker_banner',
    resources: ['chat.rolling.24h'],
    outputPath: 'modules.tickerBanner.events',
    instructions: [
      'Extract 15-25 punchy moving-banner events from the rolling 24h chat.',
      'Every event needs a concise headline, label, timestamp, username, and exact quote when useful.',
      'Sort chronologically from oldest to newest.'
    ],
    forbidden: ['Never include //price Rate-Chart game tips.']
  }),
  cache: {
    ttlSeconds: 24 * 60 * 60,
    staleSeconds: 60 * 60,
    tags: ['newspaper:module:chat.tickerBanner']
  },
  standaloneRoute: '/api/chat-ticker',
  legacyAdapter: output => ({ events: output, eventCount: output.length })
})

export type TickerBannerOutput = z.infer<typeof DailyTickerEventSchema>[]
