import { z } from 'zod'
import { ShortNewsSchema } from '../lib/types'
import { defineNewspaperModule } from '../engine/module'
import { chat } from '../engine/resources'

export const sidebarHighlightsModule = defineNewspaperModule({
  id: 'community.sidebarHighlights',
  version: '1.0.0',
  title: 'Sidebar Highlights',
  description: 'Top contributors, trending topics, and short news for sidebars.',
  resourceNeeds: [chat.range('selectedDates')],
  outputSchema: z.object({
    topContributors: z.array(z.object({
      username: z.string(),
      initial: z.string(),
      avatar: z.string().optional()
    })),
    trendingTopics: z.array(z.string()),
    shortNews: z.array(ShortNewsSchema)
  }),
  prompt: () => ({
    id: 'sidebar_highlights',
    resources: ['chat.range.selectedDates'],
    outputPath: 'modules.sidebarHighlights',
    instructions: [
      'Reuse article digest output to render sidebars.',
      'Avoid repeating low-value generic market labels.'
    ]
  }),
  cache: {
    ttlSeconds: 24 * 60 * 60,
    tags: ['newspaper:module:community.sidebarHighlights']
  }
})
