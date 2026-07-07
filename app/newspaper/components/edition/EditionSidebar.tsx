'use client'

/**
 * EditionSidebar.tsx (Newspaper edition v3)
 *
 * Left rail: top contributors (with reasons), trending topics and the
 * most active chatters — all from the edition's shared modules.
 */

import { Users, Flame, Hash } from 'lucide-react'
import type { NewspaperEdition } from '../../edition/types'

function SkeletonLines({ count }: { count: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-3.5 rounded bg-muted/40" style={{ width: `${85 - i * 9}%` }} />
      ))}
    </div>
  )
}

export function EditionSidebar({
  edition,
  isLoading
}: {
  edition: NewspaperEdition | null
  isLoading: boolean
}) {
  const shared = edition?.shared

  return (
    <div className="space-y-6">
      {/* Top contributors */}
      <div className="glass-card rounded-sm p-4">
        <h4 className="mb-3 flex items-center gap-2 font-headline text-xs font-bold uppercase tracking-[0.18em] gold-text">
          <Users className="h-3.5 w-3.5" />
          Köpfe der Ausgabe
        </h4>
        {isLoading || !shared ? (
          <SkeletonLines count={3} />
        ) : shared.topContributors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Daten.</p>
        ) : (
          <ul className="space-y-3">
            {shared.topContributors.map(contributor => (
              <li key={contributor.username} className="flex items-start gap-2.5">
                {contributor.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={contributor.avatar} alt="" className="h-7 w-7 rounded-full border border-primary/25 object-cover" />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                    {contributor.initial || contributor.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <span className="block text-xs font-headline font-semibold text-foreground">@{contributor.username}</span>
                  {contributor.reason && (
                    <span className="block text-[11px] leading-snug text-muted-foreground font-body">{contributor.reason}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Trending topics */}
      <div className="glass-card rounded-sm p-4">
        <h4 className="mb-3 flex items-center gap-2 font-headline text-xs font-bold uppercase tracking-[0.18em] gold-text">
          <Hash className="h-3.5 w-3.5" />
          Themen
        </h4>
        {isLoading || !shared ? (
          <SkeletonLines count={4} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {shared.trendingTopics.map(topic => (
              <span key={topic} className="rounded-sm border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-body text-foreground/85">
                {topic}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Active chatters */}
      <div className="glass-card rounded-sm p-4">
        <h4 className="mb-3 flex items-center gap-2 font-headline text-xs font-bold uppercase tracking-[0.18em] gold-text">
          <Flame className="h-3.5 w-3.5" />
          Aktivste Chatter
        </h4>
        {isLoading || !shared ? (
          <SkeletonLines count={5} />
        ) : shared.activeChatters.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Daten.</p>
        ) : (
          <ul className="space-y-1.5">
            {shared.activeChatters.slice(0, 8).map((chatter, index) => (
              <li key={chatter.username} className="flex items-center gap-2">
                <span className="w-4 text-right font-mono text-[10px] text-muted-foreground/60">{index + 1}.</span>
                {chatter.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={chatter.avatar} alt="" className="h-5 w-5 rounded-full border border-primary/20 object-cover" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                    {chatter.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-body text-foreground/85">@{chatter.username}</span>
                <span className="font-mono text-[10px] text-muted-foreground/70">{chatter.messageCount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
