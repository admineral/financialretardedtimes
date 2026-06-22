import { z } from 'zod'
import { NewspaperAISchema } from '../lib/types'
import { defineNewspaperModule } from '../engine/module'
import { chat, market } from '../engine/resources'

export const articleDigestModule = defineNewspaperModule({
  id: 'newspaper.articleDigest',
  version: '1.0.0',
  title: 'Article Digest',
  description: 'Main newspaper articles, events, short news, contributors, and topics.',
  resourceNeeds: [
    chat.range('selectedDates'),
    chat.chartUrls(),
    chat.activeChatters(),
    market.btc()
  ],
  outputSchema: NewspaperAISchema,
  prompt: () => ({
    id: 'article_digest',
    resources: ['chat.range.selectedDates', 'chat.chartUrls', 'market.btc'],
    outputPath: 'modules.articleDigest.data',
    instructions: [
      'Create the main Financial Retarded Times article digest from selected-date messages only.',
      'Use concrete chat evidence, exact usernames, and short article summaries.',
      'Do not use rolling live messages when generating archived issues.'
    ],
    forbidden: [
      'Never mention Rate-Chart game tips that start with // and a price.',
      'Do not repeat the same topic or TradingView chart URL in multiple sections.'
    ]
  }),
  cache: {
    ttlSeconds: 24 * 60 * 60,
    staleSeconds: 60 * 60,
    tags: ['newspaper:module:newspaper.articleDigest']
  },
  standaloneRoute: '/newspaper/api/summarize',
  legacyAdapter: output => output
})

export type ArticleDigestOutput = z.infer<typeof NewspaperAISchema>
