import { articleDigestModule } from './article-digest'
import { activeChattersModule } from './active-chatters'
import { expandingTimelineModule } from './expanding-timeline'
import { fearGreedModule } from './fear-greed'
import { sidebarHighlightsModule } from './sidebar-highlights'
import { tickerBannerModule } from './ticker-banner'
import { traderLeaderboardModule } from './trader-leaderboard'

export const firstPartyNewspaperModules = [
  articleDigestModule,
  tickerBannerModule,
  expandingTimelineModule,
  fearGreedModule,
  traderLeaderboardModule,
  activeChattersModule,
  sidebarHighlightsModule
] as const

export {
  activeChattersModule,
  articleDigestModule,
  expandingTimelineModule,
  fearGreedModule,
  sidebarHighlightsModule,
  tickerBannerModule,
  traderLeaderboardModule
}
