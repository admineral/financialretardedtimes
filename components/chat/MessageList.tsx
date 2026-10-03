'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageBody } from './MessageBody'
import { MESSAGE_LIST_PAGE } from '@/lib/tv-chat/types'
import { timeMs } from '@/lib/tv-chat/messages'
import { resolveAvatar } from '@/lib/tv-chat/client'
import type { ListedMessage } from '@/lib/tv-chat/types'

interface MessageListProps {
  username: string
  messages: ListedMessage[]
  avatar?: string | null
  title?: string
  loading: boolean
  /** Shown next to the count while older years stream in. */
  progress?: string | null
  selectedDate: string | null
  onMention?: (username: string) => void
  emptyHint?: string
}

function stamp(time: string) {
  const ms = timeMs(time)
  if (!ms) return time
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export function MessageList({
  username,
  messages,
  avatar,
  title = 'Nachrichten',
  loading,
  progress,
  selectedDate,
  onMention,
  emptyHint = 'Für diese Person sind keine Nachrichten gespeichert.'
}: MessageListProps) {
  const [visible, setVisible] = useState(MESSAGE_LIST_PAGE)

  useEffect(() => {
    setVisible(MESSAGE_LIST_PAGE)
  }, [username])

  useEffect(() => {
    if (!selectedDate) return
    const index = messages.findIndex(message => message.date === selectedDate)
    if (index >= 0) {
      setVisible(current => (index >= current ? index + MESSAGE_LIST_PAGE : current))
    }
    const timer = window.setTimeout(() => {
      document.getElementById(`msg-day-${selectedDate}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    }, 40)
    return () => window.clearTimeout(timer)
  }, [selectedDate, messages])

  const slice = messages.slice(0, visible)
  const days = useMemo(() => {
    const groups: Array<{ date: string; messages: ListedMessage[] }> = []
    for (const message of slice) {
      const last = groups[groups.length - 1]
      if (last && last.date === message.date) last.messages.push(message)
      else groups.push({ date: message.date, messages: [message] })
    }
    return groups
  }, [slice])

  const empty = !loading && messages.length === 0

  return (
    <section className="rounded-sm border border-primary/15 bg-card/40 overflow-hidden flex flex-col min-h-[520px]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {loading && messages.length === 0
              ? 'Lade Nachrichten…'
              : `${messages.length.toLocaleString('de-DE')} Nachrichten`}
            {progress ? ` · ${progress}` : ''}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto max-h-[70vh] px-4 py-4">
        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Hole Nachrichten für {username}…
          </div>
        )}
        {empty && (
          <p className="text-sm text-muted-foreground py-16 text-center font-body">
            {emptyHint}
          </p>
        )}
        <div className="space-y-8">
          {days.map(day => (
            <section key={day.date} id={`msg-day-${day.date}`} className="scroll-mt-24">
              <h3 className="sticky top-0 z-10 bg-card/95 backdrop-blur text-xs font-medium text-muted-foreground py-1.5 border-b border-border/40 mb-3">
                {format(parseISO(`${day.date}T12:00:00`), 'EEEE, d. MMMM yyyy', { locale: de })}
                <span className="tabular-nums ml-2">{day.messages.length}</span>
              </h3>
              <div className="space-y-4">
                {day.messages.map(message => (
                  <article key={message.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex-shrink-0 mt-0.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveAvatar(avatar, username)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-sm font-medium">{username}</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {stamp(message.time)}
                        </span>
                      </div>
                      <MessageBody text={message.text} onMention={onMention} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        {visible < messages.length && (
          <div className="py-6 text-center">
            <Button variant="outline" size="sm" onClick={() => setVisible(v => v + MESSAGE_LIST_PAGE)}>
              Weitere {Math.min(MESSAGE_LIST_PAGE, messages.length - visible).toLocaleString('de-DE')} von{' '}
              {(messages.length - visible).toLocaleString('de-DE')} laden
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
