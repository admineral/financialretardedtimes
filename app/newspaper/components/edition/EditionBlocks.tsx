'use client'

/**
 * EditionBlocks.tsx (Newspaper edition v3 — block renderer)
 *
 * Renders the ordered block stream of one edition in the NY-Post dark/gold
 * look: cover story, articles (incl. the investigative 14-Tage-Rückblick),
 * section headers, quote walls, authentic chat excerpts and genui
 * dataComponent figures whose numbers are bound from the deterministic
 * EditionData payload.
 *
 * Streaming-safe: blocks arrive as deep partials while the AI streams, so
 * every access is defensive and incomplete blocks render as skeletons.
 */

import { useState } from 'react'
import { ExternalLink, Quote, MessageSquare, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { LeaderboardWidget } from '@/app/chart-leader/components'
import type {
  DataComponentBlock,
  EditionBlock,
  EditionChartRange,
  EditionData,
  EditionResolvedChatMessage,
  NewspaperEdition
} from '../../edition/types'
import {
  ActivityVsBtcChart,
  EditionCandleChart,
  FearGreedGauge,
  FearGreedVsBtcChart,
  SentimentVsBtcChart,
  type EditionChartAnnotation
} from './EditionCharts'

/** Deep-partial view of a block while the object streams in. */
type PartialBlock = Record<string, unknown> & { type?: EditionBlock['type'] }

// ═══════════════════════════════════════════════════════════════════════
// Small shared pieces
// ═══════════════════════════════════════════════════════════════════════

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function Byline({ author, contributors }: { author: string | null; contributors: string[] }) {
  if (!author && contributors.length === 0) return null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-wider text-muted-foreground/70 font-headline">
      {author && <span className="text-primary/80">Von @{author}</span>}
      {contributors.length > 0 && (
        <span>Mit {contributors.map(c => `@${c}`).join(', ')}</span>
      )}
    </div>
  )
}

function PullQuote({ text, author }: { text: string; author: string | null }) {
  return (
    <blockquote className="my-5 border-l-2 border-primary/50 bg-primary/5 px-5 py-4 rounded-r-sm">
      <Quote className="h-4 w-4 text-primary/60 mb-2" />
      <p className="font-body text-base italic leading-relaxed text-foreground/90">
        &bdquo;{text}&ldquo;
      </p>
      {author && <footer className="mt-2 text-xs font-headline uppercase tracking-wider text-primary/80">@{author}</footer>}
    </blockquote>
  )
}

function isValidChartUrl(url: string): boolean {
  return url.includes('tradingview.com/x/') || url.includes('tradingview.com/chart/')
}

function getChartImageUrl(url: string): string {
  const match = url.match(/\/x\/([A-Za-z0-9]+)/)
  if (match) return `https://www.tradingview.com/x/${match[1]}/`
  return url
}

function ChartImageFigure({
  url,
  caption,
  author
}: {
  url: string
  caption: string | null
  author: string | null
}) {
  const [failed, setFailed] = useState(false)
  if (!isValidChartUrl(url) || failed) return null

  return (
    <figure className="my-5">
      <a href={url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-sm border border-primary/20 hover:border-primary/50 transition-all">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getChartImageUrl(url)}
          alt={caption || 'Chart aus dem Chat'}
          className="w-full h-auto transition-transform duration-300 group-hover:scale-[1.02]"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </a>
      {(caption || author) && (
        <figcaption className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-body italic">{caption}</span>
          <span className="flex items-center gap-2">
            {author && <span className="text-primary/80 font-headline">@{author}</span>}
            <ExternalLink className="h-3 w-3 opacity-60" />
          </span>
        </figcaption>
      )}
    </figure>
  )
}

function Paragraphs({ paragraphs, lead = false }: { paragraphs: string[]; lead?: boolean }) {
  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className={`font-body leading-relaxed text-foreground/85 ${
            lead && index === 0
              ? 'text-lg first-letter:float-left first-letter:mr-2 first-letter:font-masthead first-letter:text-5xl first-letter:leading-[0.85] first-letter:text-primary'
              : 'text-[15px]'
          }`}
        >
          {paragraph}
        </p>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Block components
// ═══════════════════════════════════════════════════════════════════════

function CoverStoryBlockView({ block }: { block: PartialBlock }) {
  const headline = str(block.headline)
  const paragraphs = strArray(block.paragraphs)
  const pullQuote = block.pullQuote as { text?: string; author?: string } | null | undefined
  const chartImage = block.chartImage as { url?: string; caption?: string | null; author?: string | null } | null | undefined

  return (
    <article className="glass-card-gold rounded-sm p-6 sm:p-8 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      {str(block.kicker) && (
        <span className="inline-block mb-3 text-[11px] font-headline font-bold uppercase tracking-[0.25em] text-primary">
          {str(block.kicker)}
        </span>
      )}
      {headline ? (
        <h2 className="font-masthead text-3xl sm:text-4xl lg:text-5xl leading-[1.05] gold-text mb-4">
          {headline}
        </h2>
      ) : (
        <div className="h-12 w-3/4 animate-pulse rounded bg-primary/10 mb-4" />
      )}
      {str(block.standfirst) && (
        <p className="font-body text-lg text-muted-foreground italic leading-relaxed border-b border-primary/15 pb-4 mb-5">
          {str(block.standfirst)}
        </p>
      )}
      {chartImage?.url && (
        <ChartImageFigure url={chartImage.url} caption={chartImage.caption ?? null} author={chartImage.author ?? null} />
      )}
      <Paragraphs paragraphs={paragraphs} lead />
      {pullQuote?.text && <PullQuote text={pullQuote.text} author={pullQuote.author ?? null} />}
      <Byline author={str(block.author)} contributors={strArray(block.contributors)} />
    </article>
  )
}

const VARIANT_STYLES: Record<string, { label: string; frame: string }> = {
  investigative: { label: 'DIE GROSSE RECHERCHE', frame: 'glass-card-gold border-l-4 border-l-primary' },
  analysis: { label: 'ANALYSE', frame: 'glass-card' },
  feature: { label: '', frame: 'glass-card' },
  shortNews: { label: '', frame: '' }
}

function ArticleBlockView({ block }: { block: PartialBlock }) {
  const variant = typeof block.variant === 'string' ? block.variant : 'feature'
  const style = VARIANT_STYLES[variant] ?? VARIANT_STYLES.feature
  const headline = str(block.headline)
  const paragraphs = strArray(block.paragraphs)
  const quote = block.quote as { text?: string; author?: string } | null | undefined
  const chartImage = block.chartImage as { url?: string; caption?: string | null; author?: string | null } | null | undefined

  if (variant === 'shortNews') {
    return (
      <article className="border-l-2 border-primary/25 pl-4 py-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          {str(block.kicker) && (
            <span className="text-[10px] font-headline font-bold uppercase tracking-[0.2em] text-primary/70">
              {str(block.kicker)}
            </span>
          )}
        </div>
        {headline && <h4 className="font-headline text-base font-bold leading-snug mt-1">{headline}</h4>}
        {paragraphs[0] && <p className="font-body text-sm text-muted-foreground leading-relaxed mt-1.5">{paragraphs[0]}</p>}
        {str(block.author) && (
          <span className="mt-1.5 inline-block text-[10px] uppercase tracking-wider text-muted-foreground/60 font-headline">
            @{str(block.author)}
          </span>
        )}
      </article>
    )
  }

  return (
    <article className={`${style.frame} rounded-sm p-6 sm:p-7`}>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {style.label && (
          <span className="inline-flex items-center rounded-sm bg-primary/15 px-2 py-0.5 text-[10px] font-headline font-bold uppercase tracking-[0.2em] text-primary">
            {style.label}
          </span>
        )}
        {str(block.kicker) && (
          <span className="text-[11px] font-headline font-bold uppercase tracking-[0.22em] text-primary/70">
            {str(block.kicker)}
          </span>
        )}
      </div>
      {headline ? (
        <h3 className={`font-masthead leading-tight mb-3 ${variant === 'investigative' ? 'text-3xl sm:text-4xl gold-text' : 'text-2xl sm:text-3xl text-foreground'}`}>
          {headline}
        </h3>
      ) : (
        <div className="h-9 w-2/3 animate-pulse rounded bg-primary/10 mb-3" />
      )}
      {str(block.standfirst) && (
        <p className="font-body text-base text-muted-foreground italic leading-relaxed mb-4">
          {str(block.standfirst)}
        </p>
      )}
      {chartImage?.url && (
        <ChartImageFigure url={chartImage.url} caption={chartImage.caption ?? null} author={chartImage.author ?? null} />
      )}
      <Paragraphs paragraphs={paragraphs} lead={variant === 'investigative'} />
      {quote?.text && <PullQuote text={quote.text} author={quote.author ?? null} />}
      <Byline author={str(block.author)} contributors={strArray(block.contributors)} />
    </article>
  )
}

function SectionHeaderBlockView({ block }: { block: PartialBlock }) {
  return (
    <div className="pt-4">
      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-primary/40" />
        <h3 className="font-headline text-lg sm:text-xl font-bold uppercase tracking-[0.2em] gold-text whitespace-nowrap">
          {str(block.title) ?? '…'}
        </h3>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-primary/40" />
      </div>
      {str(block.subtitle) && (
        <p className="mt-1.5 text-center text-xs text-muted-foreground font-body italic">{str(block.subtitle)}</p>
      )}
    </div>
  )
}

function QuoteWallBlockView({ block }: { block: PartialBlock }) {
  const quotes = Array.isArray(block.quotes)
    ? (block.quotes as Array<{ text?: string; username?: string; context?: string | null }>).filter(q => q?.text)
    : []

  return (
    <section className="glass-card rounded-sm p-6">
      <h3 className="font-headline text-sm font-bold uppercase tracking-[0.2em] gold-text mb-5 flex items-center gap-2">
        <Quote className="h-4 w-4" />
        {str(block.title) ?? 'Zitate'}
      </h3>
      <div className="columns-1 sm:columns-2 gap-4 space-y-4">
        {quotes.map((quote, index) => (
          <figure key={index} className="break-inside-avoid rounded-sm border border-primary/15 bg-background/40 p-4">
            <blockquote className="font-body text-sm italic leading-relaxed text-foreground/90">
              &bdquo;{quote.text}&ldquo;
            </blockquote>
            <figcaption className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-xs font-headline font-semibold text-primary">@{quote.username}</span>
              {quote.context && <span className="text-[10px] text-muted-foreground/70 text-right">{quote.context}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

function ChatExcerptBlockView({
  block,
  resolved
}: {
  block: PartialBlock
  resolved: EditionResolvedChatMessage[] | undefined
}) {
  const refs = Array.isArray(block.messageRefs)
    ? (block.messageRefs as Array<{ username?: string; time?: string; text?: string }>)
    : []

  const messages: EditionResolvedChatMessage[] = resolved && resolved.length > 0
    ? resolved
    : refs
        .filter(ref => ref?.text && ref?.username)
        .map(ref => ({
          username: ref.username!,
          text: ref.text!,
          time: ref.time ?? '',
          avatar: null,
          isModerator: false,
          matched: false
        }))

  return (
    <section className="glass-card rounded-sm p-6">
      <h3 className="font-headline text-sm font-bold uppercase tracking-[0.2em] gold-text mb-1 flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        {str(block.title) ?? 'Aus dem Chat'}
      </h3>
      {str(block.context) && (
        <p className="text-xs text-muted-foreground font-body italic mb-4">{str(block.context)}</p>
      )}
      <div className="space-y-2.5 mt-4">
        {messages.map((message, index) => (
          <div key={index} className="flex items-start gap-3 rounded-sm border border-primary/10 bg-background/40 px-3.5 py-2.5">
            {message.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={message.avatar} alt="" className="h-7 w-7 rounded-full border border-primary/20 object-cover" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                {message.username.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-headline font-semibold text-primary">@{message.username}</span>
                {message.time && (
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {new Date(message.time).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}
                  </span>
                )}
                {message.isModerator && (
                  <span className="text-[9px] uppercase tracking-wider text-primary/60 border border-primary/30 rounded px-1">Mod</span>
                )}
              </div>
              <p className="font-body text-sm text-foreground/85 leading-relaxed break-words">{message.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// dataComponent — bind deterministic data by component id + range
// ═══════════════════════════════════════════════════════════════════════

const RANGE_HOURS: Record<EditionChartRange, number> = { '24h': 24, '3d': 72, '7d': 168, '14d': 336 }

function defaultRangeForDayRange(dayRange: number): EditionChartRange {
  return dayRange === 1 ? '24h' : dayRange === 3 ? '3d' : '7d'
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'bullish') return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
  if (direction === 'bearish') return <TrendingDown className="h-3.5 w-3.5 text-red-400" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

function PredictionRecapView({ data }: { data: EditionData['predictions'] }) {
  if (data.items.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Keine offenen Vorhersagen im Fenster.</p>
  }
  return (
    <div className="space-y-2">
      {data.items.slice(0, 8).map((item, index) => (
        <div key={index} className="flex items-start gap-3 rounded-sm border border-primary/10 bg-background/40 px-3.5 py-2.5">
          <DirectionIcon direction={item.direction} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-headline font-semibold text-primary">@{item.username}</span>
              <span className="text-[10px] font-mono text-muted-foreground/70">
                Ziel {item.targetPrice ? `$${item.targetPrice.toLocaleString('de-DE')}` : 'n/a'} · {item.targetDateText}
              </span>
            </div>
            <p className="font-body text-sm italic text-foreground/85 leading-snug">&bdquo;{item.prediction}&ldquo;</p>
            <span className="text-[10px] font-mono text-muted-foreground/60">
              BTC beim Call: ${Math.round(item.priceAtPrediction).toLocaleString('de-DE')} · Konfidenz {item.confidence}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

const EMPTY_DATA: EditionData = {
  window: { startDate: '', endDate: '', days: 0 },
  btc: { candlesByRange: { '24h': [], '3d': [], '7d': [], '14d': [] }, currentPrice: null, change14d: null },
  fearGreedHistory: [],
  sentimentSeries: [],
  activitySeries: [],
  predictions: { items: [], summary: null, updatedAt: null },
  totals: { messageCount: 0, uniqueUsers: 0, busiestDay: null }
}

function DataComponentBlockView({
  block,
  edition,
  dayRange
}: {
  block: PartialBlock
  edition: NewspaperEdition | null
  dayRange: number
}) {
  const component = str(block.component) as DataComponentBlock['component'] | null
  if (!component) return null

  const data = edition?.data ?? EMPTY_DATA
  const requestedRange = str(block.range) as EditionChartRange | null
  const range: EditionChartRange = requestedRange && RANGE_HOURS[requestedRange]
    ? requestedRange
    : defaultRangeForDayRange(dayRange)
  const annotations = (Array.isArray(block.annotations) ? block.annotations : []) as EditionChartAnnotation[]

  let body: React.ReactNode = null
  switch (component) {
    case 'btcChart':
      body = (
        <EditionCandleChart
          candles={data.btc.candlesByRange[range] ?? []}
          annotations={annotations.filter(a => a?.date && a?.text)}
          shortRange={range === '24h'}
        />
      )
      break
    case 'fearGreedVsBtc':
      body = (
        <FearGreedVsBtcChart
          history={data.fearGreedHistory}
          candles={data.btc.candlesByRange[range === '24h' || range === '3d' ? '7d' : range] ?? []}
        />
      )
      break
    case 'sentimentVsBtc': {
      const cutoff = Date.now() - RANGE_HOURS[range] * 3600 * 1000
      const points = data.sentimentSeries.filter(p => new Date(p.timestamp).getTime() >= cutoff)
      body = <SentimentVsBtcChart points={points.length > 1 ? points : data.sentimentSeries} />
      break
    }
    case 'activityVsBtc': {
      const days = Math.max(2, Math.round(RANGE_HOURS[range] / 24))
      body = <ActivityVsBtcChart points={data.activitySeries.slice(-days)} />
      break
    }
    case 'traderLeaderboard':
      body = (
        <LeaderboardWidget
          embedded
          dataOverride={edition?.shared.traderLeaderboard.data ?? null}
          disableAutoFetch
        />
      )
      break
    case 'predictionRecap':
      body = <PredictionRecapView data={data.predictions} />
      break
    case 'fearGreedGauge': {
      const fg = edition?.shared.fearGreed.data ?? null
      body = fg
        ? <FearGreedGauge index={fg.today.index} classification={fg.today.classificationDE} />
        : <p className="py-6 text-center text-xs text-muted-foreground">Fear & Greed noch nicht verfügbar.</p>
      break
    }
  }

  return (
    <figure className="glass-card rounded-sm p-5 sm:p-6">
      <figcaption className="mb-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h4 className="font-headline text-sm font-bold uppercase tracking-[0.18em] gold-text">
            {str(block.title) ?? component}
          </h4>
          {requestedRange && component !== 'traderLeaderboard' && component !== 'predictionRecap' && component !== 'fearGreedGauge' && (
            <span className="rounded-sm border border-primary/25 px-2 py-0.5 text-[10px] font-mono uppercase text-primary/80">
              {range}
            </span>
          )}
        </div>
      </figcaption>
      {body}
      {annotations.length > 0 && component === 'btcChart' && (
        <ol className="mt-3 space-y-1">
          {annotations.filter(a => a?.date && a?.text).slice(0, 6).map((annotation, index) => (
            <li key={index} className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {index + 1}
              </span>
              <span className="font-mono text-[10px] text-primary/70">{annotation.date}</span>
              <span className="font-body">{annotation.text}</span>
            </li>
          ))}
        </ol>
      )}
      {str(block.commentary) && (
        <p className="mt-4 border-t border-primary/10 pt-3 font-body text-sm italic leading-relaxed text-muted-foreground">
          {str(block.commentary)}
        </p>
      )}
    </figure>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Block list
// ═══════════════════════════════════════════════════════════════════════

export function EditionBlockList({
  edition,
  dayRange,
  streamingBlocks
}: {
  edition: NewspaperEdition | null
  dayRange: number
  /** While streaming, partial blocks replace the stored ones. */
  streamingBlocks?: PartialBlock[]
}) {
  const blocks = (streamingBlocks ?? edition?.content.blocks ?? []) as PartialBlock[]

  if (!blocks || blocks.length === 0) {
    return (
      <div className="space-y-6">
        {[0, 1, 2].map(i => (
          <div key={i} className="glass-card rounded-sm p-8 animate-pulse">
            <div className="h-4 w-24 rounded bg-primary/15 mb-4" />
            <div className="h-8 w-3/4 rounded bg-primary/10 mb-4" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-muted/40" />
              <div className="h-3 w-5/6 rounded bg-muted/40" />
              <div className="h-3 w-4/6 rounded bg-muted/40" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        if (!block || typeof block !== 'object' || !block.type) return null
        const key = `${block.type}-${index}`
        switch (block.type) {
          case 'coverStory':
            return <CoverStoryBlockView key={key} block={block} />
          case 'article':
            return <ArticleBlockView key={key} block={block} />
          case 'sectionHeader':
            return <SectionHeaderBlockView key={key} block={block} />
          case 'quoteWall':
            return <QuoteWallBlockView key={key} block={block} />
          case 'chatExcerpt':
            return (
              <ChatExcerptBlockView
                key={key}
                block={block}
                resolved={streamingBlocks ? undefined : edition?.chatExcerpts[String(index)]}
              />
            )
          case 'dataComponent':
            return <DataComponentBlockView key={key} block={block} edition={edition} dayRange={dayRange} />
          default:
            return null
        }
      })}
    </div>
  )
}
