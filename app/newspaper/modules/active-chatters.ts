import { z } from 'zod'
import { ActiveChatterSchema } from '../lib/types'
import { defineNewspaperModule } from '../engine/module'
import { avatar, chat } from '../engine/resources'

export const activeChattersModule = defineNewspaperModule({
  id: 'community.activeChatters',
  version: '1.0.0',
  title: 'Active Chatters',
  description: 'Most active users for the issue date range.',
  resourceNeeds: [chat.activeChatters(), avatar.userMap()],
  outputSchema: z.array(ActiveChatterSchema),
  prompt: () => ({
    id: 'active_chatters',
    resources: ['chat.activeChatters', 'avatar.userMap'],
    outputPath: 'modules.activeChatters.users',
    instructions: [
      'This module is deterministic and should be computed by connectors.',
      'Expose active chatters with avatars and message counts for rendering.'
    ]
  }),
  cache: {
    ttlSeconds: 24 * 60 * 60,
    tags: ['newspaper:module:community.activeChatters']
  }
})
