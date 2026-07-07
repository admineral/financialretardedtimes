/**
 * fixtures.ts — shared builders for edition v3 unit tests.
 * All fixtures are valid against the Zod schemas in ../types.ts.
 */

import { getEditionDateKeys, type EditionChatMessage, type EditionGenerationInputs } from '../context'
import { buildChatDays } from '../context'
import {
  EDITION_FORMAT_VERSION,
  EDITION_MODEL,
  EDITION_WINDOW_DAYS,
  type EditionContent,
  type EditionData,
  type EditionLeaderboard,
  type NewspaperEdition,
  type TriEditionAI
} from '../types'

export const ANCHOR_DATE = '2026-07-07'

export function makeEditionContent(label: string): EditionContent {
  return {
    masthead: {
      dateline: `${label} · Dienstag, 07. Juli 2026`,
      motto: 'Alle Kerzen, die zum Drucken passen'
    },
    blocks: [
      {
        type: 'coverStory',
        kicker: 'DIE GESCHICHTE DES TAGES',
        headline: `${label}: BTC haelt die 100k`,
        standfirst: 'Der Chat stritt, der Preis blieb.',
        paragraphs: ['Absatz eins.', 'Absatz zwei.'],
        pullQuote: { text: 'wird schon', author: 'satoshi_jr' },
        chartImage: null,
        contributors: ['satoshi_jr'],
        author: 'satoshi_jr'
      },
      {
        type: 'sectionHeader',
        title: 'Der Markt',
        subtitle: null
      },
      {
        type: 'dataComponent',
        component: 'btcChart',
        range: '24h',
        title: 'BTC — die letzten 24 Stunden',
        commentary: 'Seitwaerts mit einem Spike um 14:00.',
        annotations: [{ date: ANCHOR_DATE, text: 'Spike' }]
      },
      {
        type: 'quoteWall',
        title: 'Zitate des Tages',
        quotes: [
          { text: 'long', username: 'bulldude', context: null },
          { text: 'short', username: 'beartroll', context: 'kurz vor dem Dip' },
          { text: 'hebel raus', username: 'papertrader', context: null }
        ]
      },
      {
        type: 'chatExcerpt',
        title: 'Der Moment des Tages',
        context: 'Als der Preis kippte, kippte der Ton.',
        messageRefs: [
          { username: 'bulldude', time: '2026-07-07T09:00:00.000Z', text: 'long' },
          { username: 'beartroll', time: '2026-07-07T09:01:00.000Z', text: 'short' }
        ]
      },
      {
        type: 'article',
        variant: 'shortNews',
        kicker: 'IN KUERZE',
        headline: 'Kurzmeldung',
        standfirst: null,
        paragraphs: ['Eine kleine Meldung.'],
        quote: null,
        chartImage: null,
        author: 'redaktion',
        contributors: []
      }
    ],
    ticker: {
      events: [
        {
          date: ANCHOR_DATE,
          time: '09:00',
          username: 'bulldude',
          text: 'long',
          type: 'bullish',
          emoji: null,
          label: null,
          headline: null,
          quote: null,
          quoteAuthor: null
        }
      ]
    },
    timeline: {
      events: [
        {
          timestamp: '2026-07-07T09:00:00.000Z',
          time: '11:00',
          date: ANCHOR_DATE,
          label: 'LONG-CALL',
          title: 'bulldude ruft den Boden aus',
          quote: 'long',
          quoteAuthor: 'bulldude',
          description: null,
          type: 'prediction',
          participants: ['bulldude'],
          sentiment: 'bullish'
        }
      ],
      summary: 'Ruhiger Tag mit einem Spike.',
      activityLevel: 'medium',
      dominantSentiment: 'mixed'
    }
  }
}

export function makeLeaderboard(): EditionLeaderboard {
  const entry = (rank: number, username: string) => ({
    rank,
    username,
    score: 80 - rank * 10,
    correctCalls: 4 - rank,
    wrongCalls: rank,
    totalCalls: 4,
    winRate: 100 - rank * 20,
    bestCall: {
      quote: 'long hier',
      priceAtCall: 100_000,
      priceTarget: 105_000,
      direction: 'bullish' as const,
      outcome: '+3% in 2h',
      timestamp: '2026-07-06T10:00:00.000Z'
    },
    worstCall: rank === 1
      ? null
      : {
          quote: 'short jetzt',
          priceAtCall: 101_000,
          outcome: '-2% dagegen',
          timestamp: '2026-07-05T15:00:00.000Z'
        },
    callHistory: [
      {
        quote: 'long hier',
        direction: 'bullish' as const,
        wasCorrect: true,
        priceAtCall: 100_000,
        timestamp: '2026-07-06T10:00:00.000Z',
        priceContext: 'BTC bei $100.000'
      }
    ],
    badge: 'analyst' as const,
    badgeReason: 'Trifft oefter als er verfehlt',
    commentaryText: 'Solide Woche.'
  })

  return {
    weekSummary: {
      headline: 'Die Woche der Geduld',
      subheadline: 'Wer nicht hebelte, gewann',
      startPrice: 98_000,
      endPrice: 102_000,
      changePercent: 4.1,
      topWinner: 'bulldude',
      topLoser: 'beartroll'
    },
    leaderboard: [entry(1, 'bulldude'), entry(2, 'papertrader'), entry(3, 'beartroll')],
    hallOfShame: [
      {
        username: 'beartroll',
        worstQuote: 'short jetzt',
        priceAtCall: 101_000,
        outcome: '+4% dagegen',
        badge: 'bottom_feeder'
      }
    ],
    dataRange: {
      from: '2026-06-30',
      to: ANCHOR_DATE,
      totalMessages: 4_200,
      uniqueTraders: 37
    }
  }
}

export function makeTriEdition(): TriEditionAI {
  return {
    trendingTopics: ['100k-Marke', 'Leverage-Debatte', 'CPI-Daten', 'Altcoin-Neid'],
    topContributors: [
      { username: 'bulldude', initial: 'B', reason: 'Rief den Boden aus' },
      { username: 'beartroll', initial: 'B', reason: 'Hielt tapfer dagegen' },
      { username: 'papertrader', initial: 'P', reason: 'Kommentierte alles' }
    ],
    fearGreed: {
      today: { index: 62, classification: 'Greed', classificationDE: 'Gier' },
      last3Days: { index: 55, classification: 'Greed', classificationDE: 'Gier' },
      last7Days: { index: 48, classification: 'Neutral', classificationDE: 'Neutral' },
      trend: 'rising',
      insight: 'Der Chat wird mutiger, je laenger die 100k haelt.',
      topDrivers: ['100k-Marke', 'Short-Squeeze']
    },
    edition1d: makeEditionContent('Tagesausgabe'),
    edition3d: makeEditionContent('3-Tage-Ausgabe'),
    edition7d: makeEditionContent('Wochenausgabe'),
    traderLeaderboard: makeLeaderboard()
  }
}

export function makeEditionData(): EditionData {
  return {
    window: { startDate: '2026-06-24', endDate: ANCHOR_DATE, days: EDITION_WINDOW_DAYS },
    btc: {
      candlesByRange: {
        '24h': [{ timestamp: 1_782_000_000_000, open: 100_000, high: 101_000, low: 99_500, close: 100_500 }],
        '3d': [],
        '7d': [],
        '14d': []
      },
      currentPrice: 100_500,
      change14d: 2.5
    },
    fearGreedHistory: [
      {
        createdAt: '2026-07-06T12:00:00.000Z',
        todayIndex: 58,
        todayClassificationDE: 'Gier',
        trend: 'rising',
        insight: 'Mut kehrt zurueck.'
      }
    ],
    sentimentSeries: [
      { timestamp: '2026-07-07T08:00:00.000Z', netSentiment: 20, messageCount: 120, priceAtBucket: 100_200 }
    ],
    activitySeries: [
      { date: ANCHOR_DATE, messageCount: 900, uniqueUsers: 45, btcClose: 100_500 }
    ],
    predictions: { items: [], summary: null, updatedAt: null },
    totals: { messageCount: 12_000, uniqueUsers: 120, busiestDay: '2026-07-03' }
  }
}

export function makeChatMessages(): EditionChatMessage[] {
  return [
    { username: 'bulldude', text: 'long', time: '2026-07-07T09:00:00.000Z', is_moderator: false },
    { username: 'beartroll', text: 'short', time: '2026-07-07T09:01:00.000Z', is_moderator: false },
    { username: 'papertrader', text: 'hebel raus', time: '2026-07-06T18:00:00.000Z', is_moderator: false }
  ]
}

export function makeInputs(): EditionGenerationInputs {
  const dateKeys = getEditionDateKeys(ANCHOR_DATE)
  const messages = makeChatMessages()
  return {
    anchorDate: ANCHOR_DATE,
    dateKeys,
    chatDays: buildChatDays(dateKeys, messages),
    messages,
    data: makeEditionData(),
    btcContext: null,
    leaderboardMessages: [],
    leaderboardOhlc: [],
    leaderboardPrompt: 'LEADERBOARD_ROHDATEN/\n[leer im Test]',
    userAvatarMap: new Map(),
    activeChatters: [{ username: 'bulldude', messageCount: 42 }],
    windowStart: new Date('2026-06-23T22:00:00.000Z'),
    windowEnd: new Date('2026-07-07T12:00:00.000Z')
  }
}

export function makeEdition(overrides: Partial<NewspaperEdition['meta']> = {}): NewspaperEdition {
  const content = makeEditionContent('Tagesausgabe')
  return {
    meta: {
      formatVersion: EDITION_FORMAT_VERSION,
      editionDate: ANCHOR_DATE,
      selectedDates: [ANCHOR_DATE],
      dayRange: 1,
      windowDays: EDITION_WINDOW_DAYS,
      generationId: 'gen-1',
      generatedAt: '2026-07-07T10:30:00.000Z',
      updatedAt: '2026-07-07T10:31:00.000Z',
      isFresh: true,
      source: 'generated',
      model: EDITION_MODEL,
      aiUsage: null,
      ...overrides
    },
    shared: {
      trendingTopics: ['100k-Marke'],
      topContributors: [{ username: 'bulldude', initial: 'B', reason: 'Rief den Boden aus' }],
      fearGreed: { data: null, dateRange: null, updatedAt: null },
      traderLeaderboard: { data: null, updatedAt: null },
      activeChatters: []
    },
    content: {
      ...content,
      ticker: {
        events: content.ticker.events.map((event, i) => ({ ...event, id: `ticker-${i}` }))
      },
      timeline: {
        ...content.timeline,
        events: content.timeline.events.map((event, i) => ({
          ...event,
          id: `timeline-${i}`,
          description: event.description ?? ''
        }))
      }
    },
    activity: { buckets: [], stats: null },
    data: makeEditionData(),
    chatExcerpts: {},
    stats: { messageCount: 900, uniqueUsers: 45 }
  }
}
