'use client'

/** Ranked contacts next to the graph: who addresses whom, how often. Hover syncs with the graph. */

import { ProfilePic } from '@/components/chat/ProfilePic'
import type { NetworkNode } from '@/lib/people/types'
import { MENTION_COLOR, QUOTE_COLOR } from './colors'

export function ContactList({
  center,
  nodes,
  highlight,
  onHighlight,
  onSelect
}: {
  center: string
  nodes: NetworkNode[]
  highlight: string | null
  onHighlight: (username: string | null) => void
  onSelect: (username: string) => void
}) {
  const contacts = nodes.filter(n => n.hop === 1).sort((a, b) => b.weight - a.weight)
  const max = Math.max(1, ...contacts.map(c => Math.max(c.toCenter.quotes + c.toCenter.mentions, c.fromCenter.quotes + c.fromCenter.mentions)))

  const bar = (quotes: number, mentions: number, align: 'left' | 'right') => (
    <div className={`flex h-1.5 w-full ${align === 'right' ? 'justify-end' : ''}`}>
      <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${((quotes + mentions) / max) * 100}%` }}>
        <div style={{ flex: quotes, background: QUOTE_COLOR }} />
        <div style={{ flex: mentions, background: MENTION_COLOR }} />
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-sm border border-primary/15 bg-card/40">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/60 px-3 py-2 text-[9px] uppercase tracking-wider text-muted-foreground">
        <span className="text-right">{center} →</span>
        <span className="w-24 text-center">Kontakt</span>
        <span>→ {center}</span>
      </div>
      <ol className="flex-1 overflow-y-auto">
        {contacts.map(contact => (
          <li key={contact.username}>
            <button
              type="button"
              onMouseEnter={() => onHighlight(contact.username)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(contact.username)}
              onBlur={() => onHighlight(null)}
              onClick={() => onSelect(contact.username)}
              title={`${contact.username}: Details`}
              className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                highlight === contact.username ? 'bg-primary/10' : 'hover:bg-muted/40'
              }`}
            >
              <div className="space-y-0.5">
                {bar(contact.fromCenter.quotes, contact.fromCenter.mentions, 'right')}
                <div className="text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                  {contact.fromCenter.quotes + contact.fromCenter.mentions || ''}
                </div>
              </div>
              <div className="flex w-24 items-center gap-1.5 min-w-0">
                <ProfilePic username={contact.username} src={contact.avatar} />
                <span className="truncate text-[11px] font-medium">{contact.username}</span>
              </div>
              <div className="space-y-0.5">
                {bar(contact.toCenter.quotes, contact.toCenter.mentions, 'left')}
                <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {contact.toCenter.quotes + contact.toCenter.mentions || ''}
                </div>
              </div>
            </button>
          </li>
        ))}
        {contacts.length === 0 && (
          <li className="px-3 py-8 text-center text-xs text-muted-foreground">Keine Zitate oder Erwähnungen in diesem Zeitraum.</li>
        )}
      </ol>
    </div>
  )
}
