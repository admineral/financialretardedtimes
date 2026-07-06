'use client'

/**
 * blocks.tsx (Newspaper v2 — block renderer registry)
 *
 * Maps the dynamic AI block list onto newspaper-styled React components.
 * Blocks are validated individually (streaming-safe: complete blocks render
 * immediately, the incomplete tail shows a skeleton). Data components bind
 * to the deterministic V2Data payload; chat excerpts prefer server-resolved
 * authentic messages.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessagesSquare, Quote as QuoteIcon } from 'lucide-react'
import { LeaderboardWidget } from '@/app/chart-leader/components'
import { UserAvatar } from '@/app/chart-leader/components/UserAvatar'
import {
  BlockSchema,
  V2LeaderboardResponseSchema,
  type ArticleBlock,
  type ChatExcerptBlock,
  type CoverStoryBlock,
  type DataComponentBlock,
  type QuoteWallBlock,
  type SectionHeaderBlock,
  type StatsBoxBlock,
  type V2Block,
  type V2Data,
  type V2ResolvedChatMessage
} from '../lib/types'
import { ActivityBars, CandleChart, FearGreedLine, SentimentChart } from './charts'

// ═══════════════════════════════════════════════════════════════════════
// Progressive reveal
// ═══════════════════════════════════════════════════════════════════════

export function Reveal({ children, immediate = false }: { children: React.ReactNode; immediate?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(immediate)

  useEffect(() => {
    if (immediate || visible) return
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '120px 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [immediate, visible])

  return (
    <div ref={ref} className={`v2-reveal ${visible ? 'v2-reveal-visible' : ''}`}>
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Shared bits
// ═══════════════════════════════════════════════════════════════════════

export function stripAt(username: string): string {
  return username.trim().replace(/^@+/, '')
}

function Byline({ author, contributors }: { author: string; contributors?: string[] }) {
  const cleanAuthor = stripAt(author)
  const extra = (contributors ?? []).map(stripAt).filter(name => name && name !== cleanAuthor)
  return (
    <div className="v2-byline flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>Von @{cleanAuthor}</span>
      {extra.length > 0 && <span className="opacity-60">· mit {extra.map(name => `@${name}`).join(', ')}</span>}
    </div>
  )
}

function PullQuote({ quote }: { quote: { text: string; author: string } }) {
  return (
    <blockquote className="v2-pullquote">
      „{quote.text}&quot;
      <cite>— @{stripAt(quote.author)}</cite>
    </blockquote>
  )
}

function berlinTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin'
  })
}

// ═══════════════════════════════════════════════════════════════════════
// Cover story (Titelblatt)
// ═══════════════════════════════════════════════════════════════════════

function CoverStoryView({ block }: { block: CoverStoryBlock }) {
  return (
    <article className="v2-rule-double pt-5">
      <div className="v2-kicker mb-3">{block.kicker}</div>
      <h1 className="v2-headline text-4xl sm:text-5xl lg:text-6xl mb-4">{block.headline}</h1>
      <p className="v2-standfirst text-lg mb-3 max-w-3xl">{block.standfirst}</p>
      <div className="mb-5 flex items-center gap-3">
        <Byline author={block.author} contributors={block.contributors} />
        <div className="flex -space-x-2">
          {block.contributors.slice(0, 5).map(name => (
            <UserAvatar key={name} username={name} size="sm" className="ring-2 ring-background" />
          ))}
        </div>
      </div>
      <div className="v2-rule-thin pt-4">
        <div className="v2-columns-3 v2-dropcap v2-body">
          {block.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {block.pullQuote && <PullQuote quote={block.pullQuote} />}
      </div>
    </article>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Articles
// ═══════════════════════════════════════════════════════════════════════

function ArticleView({ block }: { block: ArticleBlock }) {
  const isLongRead = block.variant === 'investigative' || block.variant === 'monthlyFocus'

  if (block.variant === 'shortNews') {
    return (
      <article className="v2-brief">
        <div className="v2-kicker text-[0.58rem] mb-1">{block.kicker}</div>
        <h4 className="v2-headline text-base mb-1.5">{block.headline}</h4>
        <p className="v2-body text-[0.82rem] leading-relaxed opacity-90">{block.paragraphs[0]}</p>
        <div className="v2-byline mt-1.5 text-[0.6rem]">@{stripAt(block.author)}</div>
      </article>
    )
  }

  return (
    <article className={`v2-card p-5 sm:p-7 ${isLongRead ? 'border-l-4' : ''}`}
      style={isLongRead ? { borderLeftColor: 'hsl(var(--v2-kicker))' } : undefined}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div className="v2-kicker">{block.kicker}</div>
        {block.weekLabel && (
          <span className="v2-byline whitespace-nowrap">{block.weekLabel}</span>
        )}
      </div>
      <h3 className={`v2-headline mb-3 ${isLongRead ? 'text-3xl sm:text-4xl' : 'text-2xl'}`}>{block.headline}</h3>
      {block.standfirst && <p className="v2-standfirst mb-3">{block.standfirst}</p>}
      <div className="mb-4">
        <Byline author={block.author} contributors={block.contributors} />
      </div>
      <div className={`v2-body ${isLongRead ? 'v2-columns-2 v2-dropcap' : 'space-y-3'}`}>
        {block.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {block.quote && <PullQuote quote={block.quote} />}
    </article>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Section header, quote wall, stats box
// ═══════════════════════════════════════════════════════════════════════

function SectionHeaderView({ block }: { block: SectionHeaderBlock }) {
  return (
    <div className="v2-section-banner mt-4">
      <span className="v2-section-title">{block.title}</span>
      {block.subtitle && <span className="v2-standfirst text-sm">{block.subtitle}</span>}
    </div>
  )
}

function QuoteWallView({ block }: { block: QuoteWallBlock }) {
  return (
    <section className="v2-card p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <QuoteIcon className="h-4 w-4" style={{ color: 'hsl(var(--v2-kicker))' }} />
        <h3 className="v2-headline text-xl">{block.title}</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {block.quotes.map((quote, index) => (
          <figure key={index} className="v2-rule-thin pt-3">
            <blockquote className="v2-body italic text-[0.88rem]">„{quote.text}&quot;</blockquote>
            <figcaption className="mt-2 flex items-center gap-2">
              <UserAvatar username={quote.username} size="sm" />
              <div>
                <div className="v2-byline">@{stripAt(quote.username)}</div>
                {quote.context && <div className="text-[0.65rem] opacity-60">{quote.context}</div>}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

function StatsBoxView({ block }: { block: StatsBoxBlock }) {
  return (
    <section className="v2-card p-5">
      <h3 className="v2-kicker mb-4">{block.title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {block.stats.map((stat, index) => (
          <div key={index}>
            <div className="v2-stat-value">{stat.value}</div>
            <div className="v2-stat-label mt-0.5">{stat.label}</div>
            {stat.hint && <div className="text-[0.62rem] opacity-50 mt-0.5">{stat.hint}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Chat excerpt ("Aus dem Chat")
// ═══════════════════════════════════════════════════════════════════════

function ChatExcerptView({
  block,
  resolved
}: {
  block: ChatExcerptBlock
  resolved?: V2ResolvedChatMessage[]
}) {
  const messages: V2ResolvedChatMessage[] = resolved && resolved.length > 0
    ? resolved
    : block.messageRefs.map(ref => ({
        username: ref.username,
        text: ref.text,
        time: ref.time,
        avatar: null,
        isModerator: false,
        matched: false
      }))

  return (
    <section className="v2-chat-panel">
      <div className="px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-3.5 w-3.5" style={{ color: 'hsl(var(--v2-kicker))' }} />
          <span className="v2-kicker">Aus dem Chat</span>
        </div>
        <h3 className="v2-headline text-lg mt-1.5">{block.title}</h3>
        <p className="v2-standfirst text-[0.82rem] mt-1">{block.context}</p>
      </div>
      <div className="v2-rule-thin">
        {messages.map((message, index) => (
          <div key={index} className="v2-chat-msg">
            <UserAvatar username={message.username} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="v2-byline">@{stripAt(message.username)}</span>
                <span className="v2-chat-time">{berlinTime(message.time)}</span>
              </div>
              <p className="v2-body text-[0.84rem] mt-0.5 break-words">{message.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Data components — real data, AI commentary
// ═══════════════════════════════════════════════════════════════════════

function FigureFrame({
  number,
  title,
  commentary,
  annotations,
  children
}: {
  number: number
  title: string
  commentary: string
  annotations?: DataComponentBlock['annotations']
  children: React.ReactNode
}) {
  return (
    <figure className="v2-figure">
      <div className="v2-figure-header">
        <span className="v2-figure-number">Abb. {number}</span>
        <h3 className="v2-headline text-lg">{title}</h3>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
      <figcaption className="v2-figure-caption">
        {commentary}
        {annotations && annotations.length > 0 && (
          <span className="mt-1.5 block not-italic space-y-0.5">
            {annotations.map((annotation, index) => (
              <span key={index} className="block text-[0.7rem]">
                <span className="font-bold" style={{ color: 'hsl(var(--v2-kicker))' }}>({index + 1})</span>{' '}
                {annotation.date}: {annotation.text}
              </span>
            ))}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

function DataComponentView({
  block,
  data,
  leaderboard,
  figureNumber
}: {
  block: DataComponentBlock
  data: V2Data | null
  leaderboard: unknown
  figureNumber: number
}) {
  if (block.component === 'traderLeaderboard') {
    const parsed = V2LeaderboardResponseSchema.safeParse(leaderboard)
    const widgetData = parsed.success
      ? {
          ...parsed.data,
          leaderboard: parsed.data.leaderboard.map(entry => ({
            ...entry,
            worstCall: entry.worstCall ?? undefined
          }))
        }
      : null
    return (
      <div>
        <div className="v2-figure-header border border-b-0 v2-figure !rounded-b-none" style={{ borderColor: 'var(--v2-figure-border)' }}>
          <span className="v2-figure-number">Abb. {figureNumber}</span>
          <h3 className="v2-headline text-lg">{block.title}</h3>
        </div>
        {widgetData ? (
          <LeaderboardWidget embedded dataOverride={widgetData} disableAutoFetch isLoadingOverride={false} />
        ) : (
          <div className="v2-card p-8 text-center text-sm opacity-60">
            Leaderboard wird ausgewertet…
          </div>
        )}
        <div className="v2-figure-caption v2-card mt-0 border-t-0">{block.commentary}</div>
      </div>
    )
  }

  let chart: React.ReactNode = null
  if (!data) {
    chart = <div className="py-10 text-center text-xs opacity-50">Daten werden geladen…</div>
  } else if (block.component === 'btcChart') {
    chart = <CandleChart candles={data.btc.candles} annotations={block.annotations} />
  } else if (block.component === 'sentimentTimeline') {
    chart = <SentimentChart points={data.sentimentSeries} />
  } else if (block.component === 'activityHeatmap') {
    chart = <ActivityBars points={data.activitySeries} />
  } else if (block.component === 'fearGreed') {
    chart = <FearGreedLine history={data.fearGreedHistory} />
  } else if (block.component === 'predictionRecap') {
    chart = <PredictionRecap data={data} />
  }

  return (
    <FigureFrame
      number={figureNumber}
      title={block.title}
      commentary={block.commentary}
      annotations={block.component === 'btcChart' ? block.annotations : undefined}
    >
      {chart}
    </FigureFrame>
  )
}

function PredictionRecap({ data }: { data: V2Data }) {
  const items = data.predictions.items.slice(0, 10)
  if (items.length === 0) {
    return <div className="py-8 text-center text-xs opacity-50">Keine Vorhersagen im Archiv.</div>
  }

  return (
    <div className="divide-y" style={{ borderColor: 'hsl(var(--v2-rule) / 0.3)' }}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <UserAvatar username={item.username} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="v2-byline">@{stripAt(item.username)}</span>
              <span
                className="text-[0.6rem] font-bold uppercase tracking-wider"
                style={{ color: item.direction === 'bullish' ? 'hsl(var(--v2-up))' : item.direction === 'bearish' ? 'hsl(var(--v2-down))' : 'hsl(var(--v2-ink) / 0.5)' }}
              >
                {item.direction}
              </span>
            </div>
            <p className="v2-body text-[0.82rem] truncate">„{item.prediction}&quot;</p>
          </div>
          <div className="text-right shrink-0">
            <div className="v2-stat-value !text-sm">
              {item.targetPrice ? `$${item.targetPrice.toLocaleString('de-DE')}` : '—'}
            </div>
            <div className="text-[0.6rem] opacity-50">{item.targetDateText}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Block stream — parse, segment, render
// ═══════════════════════════════════════════════════════════════════════

interface ParsedBlock {
  block: V2Block
  originalIndex: number
}

function parseBlocks(rawBlocks: unknown[]): { parsed: ParsedBlock[]; failedTail: boolean } {
  const parsed: ParsedBlock[] = []
  let failedTail = false

  rawBlocks.forEach((raw, index) => {
    const result = BlockSchema.safeParse(raw)
    if (result.success) {
      parsed.push({ block: result.data, originalIndex: index })
      failedTail = false
    } else if (index === rawBlocks.length - 1) {
      failedTail = true
    }
  })

  return { parsed, failedTail }
}

type Segment =
  | { kind: 'single'; entry: ParsedBlock }
  | { kind: 'briefGroup'; entries: ParsedBlock[] }
  | { kind: 'featureGroup'; entries: ParsedBlock[] }

function segmentBlocks(parsed: ParsedBlock[]): Segment[] {
  const segments: Segment[] = []
  let briefBuffer: ParsedBlock[] = []
  let featureBuffer: ParsedBlock[] = []

  const flushBriefs = () => {
    if (briefBuffer.length > 0) {
      segments.push({ kind: 'briefGroup', entries: briefBuffer })
      briefBuffer = []
    }
  }
  const flushFeatures = () => {
    if (featureBuffer.length === 1) {
      segments.push({ kind: 'single', entry: featureBuffer[0] })
    } else if (featureBuffer.length > 1) {
      segments.push({ kind: 'featureGroup', entries: featureBuffer })
    }
    featureBuffer = []
  }

  for (const entry of parsed) {
    const isBrief = entry.block.type === 'article' && entry.block.variant === 'shortNews'
    const isFeature = entry.block.type === 'article' &&
      (entry.block.variant === 'feature' || entry.block.variant === 'weeklyRecap')

    if (isBrief) {
      flushFeatures()
      briefBuffer.push(entry)
      continue
    }
    if (isFeature) {
      flushBriefs()
      featureBuffer.push(entry)
      continue
    }
    flushBriefs()
    flushFeatures()
    segments.push({ kind: 'single', entry })
  }
  flushBriefs()
  flushFeatures()

  return segments
}

function BlockSkeleton() {
  return (
    <div className="v2-card p-6 animate-pulse space-y-3">
      <div className="h-3 w-28 rounded-sm" style={{ background: 'hsl(var(--v2-rule) / 0.3)' }} />
      <div className="h-6 w-3/4 rounded-sm" style={{ background: 'hsl(var(--v2-rule) / 0.35)' }} />
      <div className="h-3 w-full rounded-sm" style={{ background: 'hsl(var(--v2-rule) / 0.25)' }} />
      <div className="h-3 w-5/6 rounded-sm" style={{ background: 'hsl(var(--v2-rule) / 0.25)' }} />
    </div>
  )
}

export function BlockStream({
  rawBlocks,
  data,
  chatExcerpts,
  leaderboard,
  isStreaming
}: {
  rawBlocks: unknown[]
  data: V2Data | null
  chatExcerpts: Record<string, V2ResolvedChatMessage[]>
  leaderboard: unknown
  isStreaming: boolean
}) {
  const { parsed, failedTail } = useMemo(() => parseBlocks(rawBlocks), [rawBlocks])
  const segments = useMemo(() => segmentBlocks(parsed), [parsed])

  // Figure numbers follow dataComponent order in the parsed list.
  const figureNumbers = useMemo(() => {
    const numbers = new Map<number, number>()
    let counter = 0
    for (const entry of parsed) {
      if (entry.block.type === 'dataComponent') {
        counter += 1
        numbers.set(entry.originalIndex, counter)
      }
    }
    return numbers
  }, [parsed])

  const renderBlock = (entry: ParsedBlock) => {
    const { block, originalIndex } = entry
    switch (block.type) {
      case 'coverStory':
        return <CoverStoryView block={block} />
      case 'article':
        return <ArticleView block={block} />
      case 'sectionHeader':
        return <SectionHeaderView block={block} />
      case 'quoteWall':
        return <QuoteWallView block={block} />
      case 'statsBox':
        return <StatsBoxView block={block} />
      case 'chatExcerpt':
        return <ChatExcerptView block={block} resolved={chatExcerpts[String(originalIndex)]} />
      case 'dataComponent':
        return (
          <DataComponentView
            block={block}
            data={data}
            leaderboard={leaderboard}
            figureNumber={figureNumbers.get(originalIndex) ?? 1}
          />
        )
      default:
        return null
    }
  }

  let revealBudget = 5

  return (
    <div className="space-y-8">
      {segments.map((segment, segmentIndex) => {
        const immediate = isStreaming || revealBudget-- > 0

        if (segment.kind === 'briefGroup') {
          return (
            <Reveal key={`segment-${segmentIndex}`} immediate={immediate}>
              <div className="v2-card p-5">
                <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                  {segment.entries.map(entry => (
                    <div key={entry.originalIndex}>{renderBlock(entry)}</div>
                  ))}
                </div>
              </div>
            </Reveal>
          )
        }

        if (segment.kind === 'featureGroup') {
          return (
            <Reveal key={`segment-${segmentIndex}`} immediate={immediate}>
              <div className="grid gap-6 lg:grid-cols-2">
                {segment.entries.map(entry => (
                  <div key={entry.originalIndex}>{renderBlock(entry)}</div>
                ))}
              </div>
            </Reveal>
          )
        }

        return (
          <Reveal key={`segment-${segmentIndex}`} immediate={immediate}>
            {renderBlock(segment.entry)}
          </Reveal>
        )
      })}

      {isStreaming && (failedTail || rawBlocks.length === 0) && <BlockSkeleton />}
    </div>
  )
}
