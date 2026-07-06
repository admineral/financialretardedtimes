'use client'

/**
 * page.tsx (/newspaper/v2 — Monthly Edition)
 *
 * The Financial Retarded Times Monatsausgabe: always the last 30 days,
 * composed by the AI as a dynamic list of content blocks. Print-newspaper
 * design in day mode, elegant dark/gold in dark mode (see newspaper-v2.css).
 */

import './newspaper-v2.css'

import Link from 'next/link'
import { useMemo } from 'react'
import {
  ArrowLeft,
  CalendarRange,
  Layers,
  Newspaper,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Users
} from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { AvatarProvider } from '../components/AvatarContext'
import { UserAvatar } from '@/app/chart-leader/components/UserAvatar'
import { V2IssueProvider, type V2State } from './components/V2IssueProvider'
import { BlockStream, stripAt } from './components/blocks'
import type { V2Data } from './lib/types'

function formatRange(data: V2Data | null): string {
  if (!data) return 'Letzte 30 Tage'
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Europe/Berlin'
  })
  return `${fmt(data.range.startDate)} – ${fmt(data.range.endDate)}`
}

function DigestProgressBanner({ covered, total }: { covered: number; total: number }) {
  const percent = total > 0 ? Math.round((covered / total) * 100) : 0
  return (
    <div className="v2-card mx-auto max-w-2xl p-6 text-center">
      <Sparkles className="mx-auto mb-3 h-6 w-6 animate-pulse" style={{ color: 'hsl(var(--v2-kicker))' }} />
      <h3 className="v2-headline text-lg mb-1">Tagesdigests werden erstellt</h3>
      <p className="v2-body text-sm opacity-70 mb-4">
        Jeder Tag des Monats wird einmalig verdichtet und dauerhaft archiviert — das passiert nur beim ersten Aufruf.
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'hsl(var(--v2-rule) / 0.25)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${percent}%`, background: 'hsl(var(--v2-kicker))' }}
        />
      </div>
      <div className="v2-byline mt-2">{covered} / {total} Tage</div>
    </div>
  )
}

function IssueRail({ state }: { state: V2State }) {
  const content = state.streamingContent ?? state.issue?.content ?? null
  const data = state.data
  const contributors = (content?.topContributors ?? []).filter(
    (c): c is { username: string; reason?: string } => Boolean(c?.username)
  )
  const topics = (content?.trendingTopics ?? []).filter((t): t is string => Boolean(t))

  return (
    <aside className="space-y-6">
      {/* Issue stats */}
      {data && (
        <div className="v2-card p-4">
          <div className="v2-kicker mb-3">Diese Ausgabe</div>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <CalendarRange className="h-3.5 w-3.5 opacity-50" />
              <span className="v2-body text-[0.82rem]">{formatRange(data)}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Newspaper className="h-3.5 w-3.5 opacity-50" />
              <span className="v2-body text-[0.82rem]">
                {data.totals.messageCount.toLocaleString('de-DE')} Nachrichten analysiert
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Users className="h-3.5 w-3.5 opacity-50" />
              <span className="v2-body text-[0.82rem]">
                Aktivster Tag: {data.totals.busiestDay ?? '—'}
              </span>
            </div>
            {data.btc.change30d !== null && (
              <div className="flex items-center gap-2.5">
                {data.btc.change30d >= 0
                  ? <TrendingUp className="h-3.5 w-3.5" style={{ color: 'hsl(var(--v2-up))' }} />
                  : <TrendingDown className="h-3.5 w-3.5" style={{ color: 'hsl(var(--v2-down))' }} />}
                <span className="v2-body text-[0.82rem]">
                  BTC 30d: {data.btc.change30d >= 0 ? '+' : ''}{data.btc.change30d}%
                </span>
              </div>
            )}
          </div>

          {/* Digest coverage strip */}
          <div className="v2-rule-thin mt-4 pt-3">
            <div className="v2-stat-label mb-1.5">Archiv-Abdeckung</div>
            <div className="flex gap-[2px]">
              {data.digestCoverage.map(day => (
                <span
                  key={day.date}
                  title={`${day.date}: ${day.messageCount} Nachrichten`}
                  className="h-4 flex-1 rounded-[1px]"
                  style={{
                    background: day.hasDigest
                      ? 'hsl(var(--v2-kicker) / 0.8)'
                      : 'hsl(var(--v2-rule) / 0.25)'
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top contributors */}
      {contributors.length > 0 && (
        <div className="v2-card p-4">
          <div className="v2-kicker mb-3">Köpfe des Monats</div>
          <div className="space-y-3">
            {contributors.map(contributor => (
              <div key={contributor.username} className="flex items-start gap-2.5">
                <UserAvatar username={contributor.username} size="sm" />
                <div className="min-w-0">
                  <div className="v2-byline">@{stripAt(contributor.username)}</div>
                  {contributor.reason && (
                    <p className="v2-body text-[0.74rem] opacity-70 leading-snug">{contributor.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trending topics */}
      {topics.length > 0 && (
        <div className="v2-card p-4">
          <div className="v2-kicker mb-3">Themen des Monats</div>
          <div className="flex flex-wrap gap-1.5">
            {topics.map(topic => (
              <span
                key={topic}
                className="border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide"
                style={{ borderColor: 'hsl(var(--v2-rule) / 0.4)', color: 'hsl(var(--v2-ink) / 0.75)' }}
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI usage */}
      {state.issue?.meta.aiUsage && (
        <div className="v2-card p-4">
          <div className="v2-kicker mb-2">Produktion</div>
          <div className="v2-body text-[0.72rem] space-y-1 opacity-70 font-mono">
            <div>Modell: {state.issue.meta.aiUsage.modelId ?? state.issue.meta.model}</div>
            <div>Input: {state.issue.meta.aiUsage.inputTokens?.toLocaleString('de-DE') ?? 'n/a'} Tokens</div>
            <div>Output: {state.issue.meta.aiUsage.outputTokens?.toLocaleString('de-DE') ?? 'n/a'} Tokens</div>
          </div>
        </div>
      )}
    </aside>
  )
}

function MonthlyPaper({ state }: { state: V2State }) {
  const content = state.streamingContent ?? state.issue?.content ?? null
  const rawBlocks = useMemo(
    () => (content?.blocks ?? []).filter((block): block is NonNullable<typeof block> => block != null),
    [content]
  )
  const isBusy = state.phase === 'loading' || state.phase === 'digests' || state.phase === 'generating'

  return (
    <main className="v2-paper relative min-h-screen bg-background">
      <div className="relative z-10">
        {/* Top utility bar */}
        <div className="border-b" style={{ borderColor: 'hsl(var(--v2-rule) / 0.3)' }}>
          <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-4 py-2 sm:px-6">
            <Link
              href="/newspaper"
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-100 opacity-70"
              style={{ color: 'hsl(var(--v2-ink))' }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Tagesausgabe
            </Link>
            <div className="flex items-center gap-2.5">
              <Link
                href="/newspaper/v2/prompt-inspector"
                className="flex items-center gap-1.5 border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wider transition-opacity hover:opacity-100 opacity-75"
                style={{ borderColor: 'hsl(var(--v2-rule) / 0.4)', color: 'hsl(var(--v2-kicker))' }}
              >
                <Layers className="h-3 w-3" />
                Prompt
              </Link>
              <button
                onClick={state.refresh}
                disabled={isBusy}
                aria-label="Ausgabe neu generieren"
                className="p-1.5 transition-opacity hover:opacity-100 opacity-70 disabled:opacity-40"
                style={{ color: 'hsl(var(--v2-ink))' }}
              >
                <RefreshCw className={`h-4 w-4 ${state.phase === 'generating' || state.phase === 'digests' ? 'animate-spin' : ''}`} />
              </button>
              <ThemeSwitcher />
            </div>
          </div>
        </div>

        {/* Masthead */}
        <header className="mx-auto w-full max-w-[1500px] px-4 pt-8 pb-5 text-center sm:px-6">
          <div className="v2-byline mb-2">
            {content?.masthead?.dateline ?? `Monatsausgabe · ${formatRange(state.data)}`}
          </div>
          <h1 className="font-masthead text-5xl sm:text-6xl lg:text-7xl gold-text tracking-wide">
            Financial Retarded Times
          </h1>
          <div className="mt-3 flex items-center justify-center gap-4">
            <span className="hidden h-px w-16 sm:block" style={{ background: 'hsl(var(--v2-rule) / 0.5)' }} />
            <p className="v2-standfirst text-sm">
              {content?.masthead?.motto ?? 'Die Chronik des Monats — kuratiert aus dem Chat.'}
            </p>
            <span className="hidden h-px w-16 sm:block" style={{ background: 'hsl(var(--v2-rule) / 0.5)' }} />
          </div>
          {content?.masthead?.issueTitle && (
            <div className="v2-kicker mt-3">{content.masthead.issueTitle}</div>
          )}
        </header>

        <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6">
          <div className="v2-rule-heavy" />
        </div>

        {/* Status banners */}
        <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6">
          {state.phase === 'digests' && state.digestProgress && (
            <DigestProgressBanner covered={state.digestProgress.covered} total={state.digestProgress.total} />
          )}

          {state.phase === 'loading' && (
            <div className="py-16 text-center">
              <Sparkles className="mx-auto mb-3 h-6 w-6 animate-pulse" style={{ color: 'hsl(var(--v2-kicker))' }} />
              <p className="v2-body text-sm opacity-60 animate-pulse">Monatsausgabe wird geladen…</p>
            </div>
          )}

          {state.phase === 'error' && (
            <div className="v2-card mx-auto max-w-xl p-6 text-center">
              <h3 className="v2-headline text-lg mb-2" style={{ color: 'hsl(var(--v2-down))' }}>
                Generierung fehlgeschlagen
              </h3>
              <p className="v2-body text-sm opacity-70 mb-4">{state.error?.message ?? 'Unbekannter Fehler'}</p>
              <button
                onClick={state.refresh}
                className="border px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                style={{ borderColor: 'hsl(var(--v2-kicker))', color: 'hsl(var(--v2-kicker))' }}
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {state.phase === 'generating' && rawBlocks.length === 0 && (
            <div className="py-10 text-center">
              <Sparkles className="mx-auto mb-3 h-6 w-6 animate-pulse" style={{ color: 'hsl(var(--v2-kicker))' }} />
              <p className="v2-body text-sm opacity-60 animate-pulse">
                Der Chefredakteur komponiert die Monatsausgabe…
              </p>
            </div>
          )}

          {/* The paper */}
          {(rawBlocks.length > 0 || state.phase === 'ready') && (
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-9">
                <BlockStream
                  rawBlocks={rawBlocks}
                  data={state.data}
                  chatExcerpts={state.chatExcerpts}
                  leaderboard={content?.traderLeaderboard ?? null}
                  isStreaming={state.phase === 'generating'}
                />
              </div>
              <div className="lg:col-span-3">
                <div className="sticky top-6">
                  <IssueRail state={state} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t py-8 text-center" style={{ borderColor: 'hsl(var(--v2-rule) / 0.3)' }}>
          <div className="v2-byline">
            © Financial Retarded Times · Monatsausgabe · „Keine Finanzberatung – nur Entertainment&quot;
          </div>
        </footer>
      </div>
    </main>
  )
}

export default function NewspaperV2Page() {
  return (
    <AvatarProvider>
      <V2IssueProvider>
        {state => <MonthlyPaper state={state} />}
      </V2IssueProvider>
    </AvatarProvider>
  )
}
