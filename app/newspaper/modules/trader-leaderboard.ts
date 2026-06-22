import { LeaderboardResponseSchema } from '@/app/chart-leader/lib/schema'
import { defineNewspaperModule } from '../engine/module'
import { avatar, chat, market } from '../engine/resources'

export const traderLeaderboardModule = defineNewspaperModule({
  id: 'trading.traderLeaderboard',
  version: '1.0.0',
  title: 'Trader Leaderboard',
  description: 'Ranks traders by directional BTC calls over the selected issue range.',
  resourceNeeds: [chat.range('selectedDates'), market.ohlc('1h'), avatar.userMap()],
  outputSchema: LeaderboardResponseSchema,
  prompt: () => ({
    id: 'trader_leaderboard',
    resources: ['chat.range.selectedDates', 'market.ohlc.1h'],
    outputPath: 'modules.traderLeaderboard.data',
    instructions: [
      'Evaluate only clear BTC direction calls.',
      'Score calls against BTC price movement after the message.',
      'Ignore all // game tips and questions without a direction claim.',
      'Return leaderboard, hallOfShame, and dataRange.'
    ],
    forbidden: ['Do not score generic market chatter without a concrete bullish or bearish call.']
  }),
  cache: {
    ttlSeconds: 24 * 60 * 60,
    staleSeconds: 60 * 60,
    tags: ['newspaper:module:trading.traderLeaderboard']
  },
  standaloneRoute: '/chart-leader/api/leaderboard'
})
