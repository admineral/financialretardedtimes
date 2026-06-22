import { z } from 'zod'
import { DailyTimelineEventSchema } from '../lib/types'
import { defineNewspaperModule } from '../engine/module'
import { chat } from '../engine/resources'

export const expandingTimelineModule = defineNewspaperModule({
  id: 'chat.expandingTimeline',
  version: '1.0.0',
  title: 'Expanding Timeline',
  description: 'Expandable chat history timeline with activity context.',
  resourceNeeds: [chat.rolling('24h')],
  outputSchema: z.object({
    events: z.array(DailyTimelineEventSchema),
    summary: z.string().nullable(),
    activityLevel: z.enum(['low', 'medium', 'high']).nullable(),
    dominantSentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).nullable()
  }),
  prompt: () => ({
    id: 'expanding_timeline',
    resources: ['chat.rolling.24h', 'chat.activityBuckets'],
    outputPath: 'modules.expandingTimeline',
    instructions: [
      'Create a compact topic timeline from the configured rolling chat window.',
      'Cover significant activity buckets where possible.',
      'Use only timeline_messages and keep event labels short.'
    ],
    forbidden: ['Never include //price Rate-Chart game tips.']
  }),
  cache: {
    ttlSeconds: 24 * 60 * 60,
    staleSeconds: 60 * 60,
    tags: ['newspaper:module:chat.expandingTimeline']
  },
  standaloneRoute: '/test-timeline/api/analyze'
})
