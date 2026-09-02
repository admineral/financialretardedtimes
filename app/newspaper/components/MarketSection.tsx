'use client'

/**
 * MarketSection.tsx ("Der Marktteil")
 *
 * The four self-contained market widgets (Chart.js + their own APIs). They
 * are live tools, not part of the selected edition, so they are code-split
 * out of the newspaper's first-load bundle and mounted only when the
 * reader scrolls down to them.
 */

import dynamic from 'next/dynamic'
import { TrendingUp } from 'lucide-react'
import { LazySection } from './ui/LazySection'

function WidgetPlaceholder({ height = 360 }: { height?: number }) {
  return <div className="animate-pulse rounded-sm border border-primary/10 bg-card/40" style={{ height }} />
}

const ChartTimelineWidget = dynamic(
  () => import('@/components/market-widgets/ChartTimelineWidget').then(m => m.ChartTimelineWidget),
  { ssr: false, loading: () => <WidgetPlaceholder height={420} /> }
)
const SentimentWidget = dynamic(
  () => import('@/components/market-widgets/SentimentWidget').then(m => m.SentimentWidget),
  { ssr: false, loading: () => <WidgetPlaceholder /> }
)
const PredictionWidget = dynamic(
  () => import('@/components/market-widgets/PredictionWidget').then(m => m.PredictionWidget),
  { ssr: false, loading: () => <WidgetPlaceholder /> }
)
const TraderLeaderboardWidget = dynamic(
  () => import('@/components/market-widgets/TraderLeaderboardWidget').then(m => m.TraderLeaderboardWidget),
  { ssr: false, loading: () => <WidgetPlaceholder /> }
)

export function MarketSection() {
  return (
    <section className="border-t border-primary/10 mt-8 bg-card/20 relative z-10">
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-4 mb-3">
            <div className="w-16 h-px bg-gradient-to-r from-transparent to-primary/40" />
            <TrendingUp className="w-5 h-5 text-primary/60" />
            <div className="w-16 h-px bg-gradient-to-l from-transparent to-primary/40" />
          </div>
          <h2 className="font-masthead text-3xl sm:text-4xl gold-text mb-2">
            Der Marktteil
          </h2>
          <p className="text-sm text-muted-foreground font-body max-w-md mx-auto">
            Chart-Chronik, Stimmungsbarometer und Wettbüro — live aus dem Chat analysiert
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/50 font-headline">
            Live-Daten, unabhängig von der gewählten Ausgabe
          </p>
        </div>
        <LazySection minHeight={1400} fallback={<div className="space-y-8"><WidgetPlaceholder height={420} /><WidgetPlaceholder /><WidgetPlaceholder /><WidgetPlaceholder /></div>}>
          <div className="space-y-8">
            <ChartTimelineWidget />
            <SentimentWidget />
            <PredictionWidget />
            <TraderLeaderboardWidget />
          </div>
        </LazySection>
      </div>
    </section>
  )
}
