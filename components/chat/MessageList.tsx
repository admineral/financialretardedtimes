'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { DownloadIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageBody } from './MessageBody'
import { MESSAGE_LIST_PAGE } from '@/lib/tv-chat/types'
import { timeMs } from '@/lib/tv-chat/messages'
import type { ListedMessage } from '@/lib/tv-chat/types'

interface MessageListProps {
  username: string
  messages: ListedMessage[]
  loading: boolean
  refreshing: boolean
  selectedDate: string | null
  onRefresh: () => void
  onExportJson: () => void
  onExportMd: () => void
  onMention?: (username: string) => void
  emptyHint?: string
}

function stamp(time: string) {
  const ms = timeMs(time)
  if (!ms) return time
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, payload: unknown) {
  download(filename, JSON.stringify(payload, null, 2), 'application/json; charset=utf-8')
}

export function downloadText(filename: string, content: string, type: string) {
  download(filename, content, type)
}

export function MessageList({
  username,
  messages,
  loading,
  refreshing,
  selectedDate,
  onRefresh,
  onExportJson,
  onExportMd,
  onMention,
  emptyHint = 'Noch keine Nachrichten. „Frisch laden“ holt die fehlenden Tage aus dem TradingView-Archiv.'
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
    <section className="rounded-2xl border bg-card/40 overflow-hidden flex flex-col min-h-[520px]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Nachrichten</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {loading && messages.length === 0
              ? 'Lade Nachrichten…'
              : `${messages.length.toLocaleString('de-DE')} Nachrichten`}
            {refreshing ? ' · hole frische Tage vom TV-Archiv' : ''}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading || refreshing}>
          {refreshing ? (
            <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <RefreshCwIcon className="h-3.5 w-3.5 mr-1" />
          )}
          Frisch laden
        </Button>
        <Button size="sm" variant="outline" onClick={onExportMd} disabled={messages.length === 0}>
          <DownloadIcon className="h-3.5 w-3.5 mr-1" />
          Markdown
        </Button>
        <Button size="sm" onClick={onExportJson} disabled={messages.length === 0}>
          <DownloadIcon className="h-3.5 w-3.5 mr-1" />
          Export
        </Button>
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
                        src={`https://s3.tradingview.com/userpics/${username.toLowerCase()}_50.png`}
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
