'use client'

/**
 * WidgetFrame — newspaper-style figure frame shared by the market widgets.
 *
 * Mirrors the v2 in-text figure look (figure number + headline + caption)
 * but in the main NY-Post glass/gold theme, so the widgets sit natively
 * under the edition blocks on /newspaper.
 */

import type { LucideIcon } from 'lucide-react'
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { formatRelativeTime } from './lib'

export function StaleBadge({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider text-amber-400">
      Veraltet
    </span>
  )
}

export function WidgetFrame({
  icon: Icon,
  kicker,
  title,
  fetchedAt,
  stale = false,
  fullscreenHref,
  fullscreenLabel = 'Vollbild',
  onRegenerate,
  isGenerating = false,
  regenerateLabel = 'Neu generieren',
  statusText,
  children,
  footer
}: {
  icon: LucideIcon
  kicker: string
  title: string
  fetchedAt: string | null
  stale?: boolean
  fullscreenHref: string
  fullscreenLabel?: string
  onRegenerate: () => void
  isGenerating?: boolean
  regenerateLabel?: string
  statusText?: string | null
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section className="glass-card glass-grain rounded-sm overflow-hidden">
      <header className="border-b border-primary/15 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-headline font-bold uppercase tracking-[0.25em] text-primary/70">
                {kicker}
              </span>
              <StaleBadge show={stale && !isGenerating} />
            </div>
            <h2 className="mt-1 font-masthead text-2xl sm:text-3xl leading-tight gold-text">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col items-end mr-1">
              <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/70">
                <Sparkles className="h-3 w-3 text-primary/60" />
                {isGenerating ? 'generiert…' : formatRelativeTime(fetchedAt)}
              </span>
              {statusText && (
                <span className="text-[10px] text-muted-foreground/50">{statusText}</span>
              )}
            </div>
            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-headline font-semibold uppercase tracking-wider transition-all ${
                isGenerating
                  ? 'border-primary/20 bg-primary/5 text-primary/50 cursor-wait'
                  : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-lg hover:shadow-primary/10'
              }`}
              title={regenerateLabel}
            >
              <RefreshCw className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isGenerating ? 'Analysiere…' : regenerateLabel}</span>
            </button>
            <Link
              href={fullscreenHref}
              className="flex items-center gap-1.5 rounded-sm border border-primary/20 px-2.5 py-1.5 text-[11px] font-headline uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">{fullscreenLabel}</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="p-5 sm:p-6">{children}</div>

      {footer && (
        <footer className="border-t border-primary/10 px-5 py-3 sm:px-6">
          {footer}
        </footer>
      )}
    </section>
  )
}

export function WidgetEmptyState({
  icon: Icon,
  text,
  actionLabel,
  onAction
}: {
  icon: LucideIcon
  text: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-primary/20 bg-background/30 py-12">
      <Icon className="h-8 w-8 text-primary/30" />
      <p className="text-sm text-muted-foreground font-body">{text}</p>
      <button
        onClick={onAction}
        className="rounded-sm border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-headline font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
      >
        {actionLabel}
      </button>
    </div>
  )
}

export function ChartSkeleton({ height = 420 }: { height?: number }) {
  return (
    <div
      className="flex w-full items-center justify-center rounded-sm bg-muted/20 animate-pulse"
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="h-7 w-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <span className="text-xs text-muted-foreground">Chart lädt…</span>
      </div>
    </div>
  )
}
