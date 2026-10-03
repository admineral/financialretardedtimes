'use client'

/**
 * Details of the person selected in the network: profile, archive stats,
 * both directions of the relation, a month-by-month bar chart of their
 * exchange with the centre, and the contacts they share.
 */

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowUpRight, Crosshair, X } from 'lucide-react'
import { ProfilePic } from '@/components/chat/ProfilePic'
import { monthRange } from '@/lib/people/communities'
import type { Counts, NetworkLink, NetworkNode } from '@/lib/people/types'
import { MENTION_COLOR, QUOTE_COLOR } from './colors'

function fmtDate(date: string | null) {
  if (!date) return '—'
  const [y, m, d] = date.split('-')
  return d ? `${d}.${m}.${y}` : date
}

function Direction({ label, counts, max }: { label: string; counts: Counts; max: number }) {
  const total = counts.quotes + counts.mentions
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{total}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted/40">
        <div style={{ width: `${(counts.quotes / max) * 100}%`, background: QUOTE_COLOR }} />
        <div style={{ width: `${(counts.mentions / max) * 100}%`, background: MENTION_COLOR }} />
      </div>
      <div className="flex gap-3 text-[10px] text-muted-foreground">
        <span>{counts.quotes}× Zitat</span>
        <span>{counts.mentions}× @</span>
      </div>
    </div>
  )
}

export function PersonPanel({
  person,
  center,
  room,
  nodes,
  links,
  onClose,
  onSelect,
  onRecenter
}: {
  person: NetworkNode
  center: string
  room: string
  nodes: NetworkNode[]
  links: NetworkLink[]
  onClose: () => void
  onSelect: (username: string) => void
  onRecenter: (username: string) => void
}) {
  const centerLink = useMemo(
    () => links.find(l => (l.a === person.username && l.b === center) || (l.b === person.username && l.a === center)),
    [links, person.username, center]
  )

  const timeline = useMemo(() => {
    if (!centerLink) return []
    const keys = Object.keys(centerLink.months).sort()
    if (!keys.length) return []
    return monthRange(keys[0], keys.at(-1)!).map(month => ({ month, count: centerLink.months[month] ?? 0 }))
  }, [centerLink])
  const peak = Math.max(1, ...timeline.map(t => t.count))

  const shared = useMemo(() => {
    const of = (name: string) =>
      new Set(links.flatMap(l => (l.a === name ? [l.b] : l.b === name ? [l.a] : [])))
    const mine = of(person.username)
    const theirs = of(center)
    const byName = new Map(nodes.map(n => [n.username, n]))
    return Array.from(mine)
      .filter(name => theirs.has(name) && name !== center)
      .map(name => byName.get(name)!)
      .filter(Boolean)
      .sort((a, b) => b.weight - a.weight)
  }, [links, nodes, person.username, center])

  const maxDirection = Math.max(
    1,
    person.toCenter.quotes + person.toCenter.mentions,
    person.fromCenter.quotes + person.fromCenter.mentions
  )
  const joined = person.joinDate
    ? new Date(`${person.joinDate}T12:00:00Z`).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })
    : null

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-sm border border-primary/30 bg-card/60">
      <div className="relative border-b border-border/60 bg-gradient-to-br from-primary/10 to-transparent p-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="absolute right-2 top-2 rounded-sm p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <ProfilePic username={person.username} src={person.avatar} size="lg" />
          <div className="min-w-0">
            <div className="truncate font-headline text-lg font-semibold">{person.username}</div>
            <div className="text-[11px] text-muted-foreground">
              {joined ? `TradingView seit ${joined}` : 'Kein Profil gespeichert'}
              {person.followers != null && ` · ${person.followers.toLocaleString('de-DE')} Follower`}
            </div>
            <div className="text-[10px] text-muted-foreground/80">
              {person.hop === 1 ? 'Direkter Kontakt' : person.hop === 2 ? 'Zweiter Kreis' : 'Zentrum'} · im Archiv {fmtDate(person.firstDate)} – {fmtDate(person.lastDate)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {person.hop !== 0 && (
            <button
              type="button"
              onClick={() => onRecenter(person.username)}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Crosshair className="h-3 w-3" /> Ins Zentrum
            </button>
          )}
          <Link
            href={`/chat-archive?room=${encodeURIComponent(room)}&username=${encodeURIComponent(person.username)}`}
            className="inline-flex items-center gap-1 rounded-sm border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Profilseite <ArrowUpRight className="h-3 w-3" />
          </Link>
          <a
            href={`https://www.tradingview.com/u/${encodeURIComponent(person.username)}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            TradingView <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Nachrichten', person.messages.toLocaleString('de-DE')],
            ['Aktive Tage', person.activeDays.toLocaleString('de-DE')],
            ['Ø / Tag', person.activeDays ? (person.messages / person.activeDays).toFixed(1) : '—']
          ].map(([label, value]) => (
            <div key={label} className="rounded-sm bg-muted/40 px-1 py-2">
              <dt className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</dt>
              <dd className="font-mono text-base tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {person.hop === 1 && (
          <section className="space-y-3">
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground">Austausch mit {center}</h4>
            <Direction label={`${person.username} → ${center}`} counts={person.toCenter} max={maxDirection} />
            <Direction label={`${center} → ${person.username}`} counts={person.fromCenter} max={maxDirection} />
          </section>
        )}

        {timeline.length > 0 && (
          <section className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground">Verlauf pro Monat</h4>
              <span className="font-mono text-[10px] text-muted-foreground">
                {timeline[0].month} – {timeline.at(-1)!.month}
              </span>
            </div>
            <div className="flex h-16 items-end gap-px" role="img" aria-label="Austausch pro Monat">
              {timeline.map(t => (
                <div
                  key={t.month}
                  title={`${t.month}: ${t.count}`}
                  className="flex-1 rounded-t-[1px] bg-primary/80 transition-colors hover:bg-primary"
                  style={{ height: `${Math.max(t.count ? 6 : 1, (t.count / peak) * 100)}%`, opacity: t.count ? 1 : 0.25 }}
                />
              ))}
            </div>
          </section>
        )}

        {shared.length > 0 && (
          <section className="space-y-1.5">
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Gemeinsame Kontakte · {shared.length}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {shared.slice(0, 24).map(n => (
                <button
                  key={n.username}
                  type="button"
                  onClick={() => onSelect(n.username)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 py-0.5 pl-0.5 pr-2 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                >
                  <ProfilePic username={n.username} src={n.avatar} />
                  {n.username}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
