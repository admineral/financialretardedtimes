'use client'

/**
 * ExportApp.tsx (/newspaper/export)
 *
 * Pull the last N days of one TradingView user's chat and copy or
 * download it. Cache-first: the database answers instantly, then the
 * server fills missing days from TradingView while a 1s cache poll
 * streams finished days into the list. No new tables, no defaults for
 * people; the URL (`?username=&room=&days=`) only reflects what the
 * visitor typed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { addDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import { CheckIcon, CopyIcon, DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MessageBody } from '@/components/chat/MessageBody'
import { ProfilePic } from '@/components/chat/ProfilePic'
import { LookupForm } from '@/components/chat/LookupForm'
import { listedToJson, listedToMarkdown, timeMs } from '@/lib/tv-chat/messages'
import {
  PartialActivityError,
  downloadFile,
  fetchActivity,
  fetchAvatar,
  messagesFromActivities,
  normalizeUsername,
  windowDates,
  type ActivityDayBucket
} from '@/lib/tv-chat/client'
import { DEFAULT_ROOM, ROOM_OPTIONS, type ListedMessage } from '@/lib/tv-chat/types'
import { ToolHeader } from '../components/ToolHeader'

const DAY_OPTIONS = [7, 30, 90, 180, 365] as const
const DEFAULT_DAYS = 90
const PAGE_SIZE = 200

interface DayStatus {
  date: string
  count: number
  done: boolean
}

function parseDays(value: string | null): number {
  const parsed = Number(value)
  return (DAY_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_DAYS
}

function parseRoom(value: string | null): string {
  return value && ROOM_OPTIONS.some(option => option.id === value) ? value : DEFAULT_ROOM
}

function stamp(time: string) {
  const ms = timeMs(time)
  if (!ms) return time
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function statusFromActivities(window: string[], activities: ActivityDayBucket[]): Map<string, DayStatus> {
  const next = new Map<string, DayStatus>()
  for (const date of window) next.set(date, { date, count: 0, done: false })
  for (const activity of activities) {
    next.set(activity.date, {
      date: activity.date,
      count: activity.count || activity.messages?.length || 0,
      done: true
    })
  }
  return next
}

function cellClass(count: number, done: boolean, fetching: boolean, selected: boolean) {
  return cn(
    'h-7 w-7 rounded-sm border text-[10px] tabular-nums leading-none flex items-center justify-center transition-colors',
    selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
    fetching && 'animate-pulse border-amber-400 bg-amber-400/20 text-amber-200',
    !done && !fetching && 'border-dashed border-border/50 bg-muted/15 text-muted-foreground/40',
    done && count === 0 && 'border-border/40 bg-muted/40 text-muted-foreground',
    done && count > 0 && count < 4 && 'border-emerald-900/50 bg-emerald-950 text-emerald-200',
    done && count >= 4 && count < 10 && 'border-emerald-700/50 bg-emerald-800 text-emerald-100',
    done && count >= 10 && 'border-emerald-400/50 bg-emerald-500 text-emerald-950 font-medium'
  )
}

function MiniCalendars({
  dates,
  status,
  fetchingDate,
  selectedDate,
  onSelect
}: {
  dates: string[]
  status: Map<string, DayStatus>
  fetchingDate: string | null
  selectedDate: string | null
  onSelect: (date: string) => void
}) {
  const months = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const date of dates) {
      const key = date.slice(0, 7)
      if (seen.has(key)) continue
      seen.add(key)
      list.push(key)
    }
    return list
  }, [dates])
  const inWindow = useMemo(() => new Set(dates), [dates])

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {months.map(month => {
        const start = startOfMonth(parseISO(`${month}-01T12:00:00`))
        const pad = (start.getDay() + 6) % 7
        const daysInMonth = endOfMonth(start).getDate()
        const cells: Array<string | null> = [
          ...Array.from({ length: pad }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'))
        ]
        return (
          <div key={month}>
            <div className="mb-2 font-headline text-[11px] uppercase tracking-wider text-muted-foreground">
              {format(start, 'MMMM yyyy', { locale: de })}
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-[9px] text-muted-foreground/60">
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(label => (
                <div key={`${month}-${label}`} className="text-center">{label[0]}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date || !inWindow.has(date)) {
                  return <div key={`${month}-cell-${i}`} className="h-7 w-7" />
                }
                const day = status.get(date)
                const done = Boolean(day?.done)
                const count = day?.count || 0
                return (
                  <button
                    key={`${month}-cell-${i}`}
                    type="button"
                    title={`${date} · ${done ? `${count} Nachrichten` : 'ausstehend'}`}
                    onClick={() => onSelect(date)}
                    className={cellClass(count, done, fetchingDate === date, selectedDate === date)}
                  >
                    {parseISO(`${date}T12:00:00`).getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ExportApp() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [username, setUsername] = useState(() => normalizeUsername(searchParams.get('username') ?? ''))
  const [room, setRoom] = useState(() => parseRoom(searchParams.get('room')))
  const [days, setDays] = useState(() => parseDays(searchParams.get('days')))

  const [activeUser, setActiveUser] = useState('')
  const [activeRoom, setActiveRoom] = useState(DEFAULT_ROOM)
  const [activeDays, setActiveDays] = useState(DEFAULT_DAYS)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [dates, setDates] = useState<string[]>([])
  const [messages, setMessages] = useState<ListedMessage[]>([])
  const [status, setStatus] = useState<Map<string, DayStatus>>(() => new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const runRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoStarted = useRef(false)

  const doneCount = useMemo(() => Array.from(status.values()).filter(day => day.done).length, [status])
  const fetchingDate = loading ? dates.find(date => !status.get(date)?.done) || null : null
  const roomLabel = ROOM_OPTIONS.find(item => item.id === activeRoom)?.label || activeRoom
  const progress = Math.round((doneCount / Math.max(activeDays, 1)) * 100)
  const started = Boolean(activeUser)

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current)
    abortRef.current?.abort()
  }, [])

  const syncUrl = useCallback((user: string, chatRoom: string, dayCount: number) => {
    const params = new URLSearchParams()
    if (user) params.set('username', user)
    if (chatRoom !== DEFAULT_ROOM) params.set('room', chatRoom)
    if (dayCount !== DEFAULT_DAYS) params.set('days', String(dayCount))
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [pathname, router])

  const startFetch = useCallback(async (userInput: string, chatRoom: string, dayCount: number) => {
    const user = normalizeUsername(userInput)
    if (!user) return

    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    const run = ++runRef.current
    const window = windowDates(dayCount)

    setLoading(true)
    setError(null)
    setMessages([])
    setVisible(PAGE_SIZE)
    setSelectedDate(null)
    setCopied(null)
    setAvatar(null)
    setActiveUser(user)
    setActiveRoom(chatRoom)
    setActiveDays(dayCount)
    setDates(window)
    setStatus(statusFromActivities(window, []))
    syncUrl(user, chatRoom, dayCount)

    void fetchAvatar(user, abort.signal).then(url => {
      if (run === runRef.current) setAvatar(url)
    })

    const applyCache = async () => {
      const data = await fetchActivity({ room: chatRoom, username: user, days: dayCount, cacheOnly: true, signal: abort.signal })
      if (run !== runRef.current) return
      setStatus(statusFromActivities(window, data.activities))
      setMessages(messagesFromActivities(user, data.activities))
    }

    let poll: ReturnType<typeof setInterval> | null = null
    try {
      await applyCache()
      if (run !== runRef.current) return

      // Finished days land in the database one by one; the poll streams
      // them into the list while the long scrape is still running.
      poll = setInterval(() => {
        if (run !== runRef.current) return
        applyCache().catch(() => undefined)
      }, 1000)

      const data = await fetchActivity({ room: chatRoom, username: user, days: dayCount, forceRefresh: true, signal: abort.signal })
      if (run !== runRef.current) return
      setStatus(statusFromActivities(window, data.activities))
      setMessages(messagesFromActivities(user, data.activities))
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      if (run !== runRef.current) return
      if (err instanceof PartialActivityError) {
        setStatus(statusFromActivities(window, err.partial))
        setMessages(messagesFromActivities(user, err.partial))
        setError('Nur teilweise geladen: TradingView hat den Abruf unterbrochen. Erneut laden füllt die Lücken.')
      } else {
        setError(err instanceof Error ? err.message : 'Abruf fehlgeschlagen')
      }
    } finally {
      if (poll) clearInterval(poll)
      if (run === runRef.current) setLoading(false)
    }
  }, [syncUrl])

  // Deep links (`?username=`) start immediately; a bare visit stays empty.
  useEffect(() => {
    if (autoStarted.current) return
    autoStarted.current = true
    if (username) void startFetch(username, room, days)
  }, [username, room, days, startFetch])

  const selectDate = (date: string) => {
    setSelectedDate(prev => (prev === date ? null : date))
    const index = messages.findIndex(message => message.date === date)
    if (index >= 0) setVisible(current => (index >= current ? index + PAGE_SIZE : current))
    requestAnimationFrame(() => {
      document.getElementById(`msg-day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 1600)
    } catch {
      setError('Kopieren in die Zwischenablage nicht möglich')
    }
  }

  const dayGroups = useMemo(() => {
    const groups: Array<{ date: string; messages: ListedMessage[] }> = []
    for (const message of messages.slice(0, visible)) {
      const last = groups[groups.length - 1]
      if (last && last.date === message.date) last.messages.push(message)
      else groups.push({ date: message.date, messages: [message] })
    }
    return groups
  }, [messages, visible])

  const markdown = useMemo(() => (started ? listedToMarkdown(activeUser, messages) : ''), [started, activeUser, messages])
  const json = useMemo(
    () => (started ? JSON.stringify(listedToJson({ username: activeUser, room: activeRoom, messages }), null, 2) : ''),
    [started, activeUser, activeRoom, messages]
  )

  return (
    <main className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />
      <ToolHeader section="Export" subtitle="Chat-Verlauf eines Nutzers kopieren oder herunterladen" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <LookupForm
          username={username}
          room={room}
          onUsernameChange={value => setUsername(normalizeUsername(value))}
          onRoomChange={setRoom}
          onSubmit={() => void startFetch(username, room, days)}
          loading={loading}
          submitLabel={`${days} Tage laden`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-headline text-[10px] uppercase tracking-wider text-muted-foreground/70">Zeitraum</span>
            {DAY_OPTIONS.map(option => (
              <button
                key={option}
                type="button"
                disabled={loading}
                onClick={() => setDays(option)}
                className={cn(
                  'h-7 rounded-sm border px-3 text-[11px] font-headline uppercase tracking-wide tabular-nums transition-colors',
                  days === option
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-primary/20 text-muted-foreground hover:border-primary/50 hover:text-primary'
                )}
              >
                {option} Tage
              </button>
            ))}
          </div>
        </LookupForm>

        {!started && (
          <div className="rounded-sm border border-dashed border-primary/20 bg-card/20 px-6 py-16 text-center space-y-2">
            <p className="font-headline text-sm uppercase tracking-wider text-foreground/80">Wessen Chat soll es sein?</p>
            <p className="text-xs text-muted-foreground font-body max-w-md mx-auto">
              Benutzername eingeben, Raum wählen, Zeitraum setzen. Bereits gespeicherte Tage erscheinen sofort,
              fehlende Tage werden live aus dem TradingView-Archiv nachgeladen.
            </p>
          </div>
        )}

        {started && (
          <section className="glass-card glass-grain rounded-sm border border-primary/15 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <ProfilePic username={activeUser} src={avatar} size="md" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-headline text-sm font-semibold truncate">{activeUser}</div>
                <p className="text-xs text-muted-foreground font-body">
                  {roomLabel}
                  <span className="tabular-nums">
                    {' '}· {messages.length.toLocaleString('de-DE')} Nachrichten · {doneCount}/{activeDays} Tage
                  </span>
                </p>
                <div className="h-1.5 max-w-md overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full transition-all', loading ? 'bg-amber-400' : 'bg-emerald-500')}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              {loading && (
                <p className="text-xs text-amber-300 font-mono">Lade {fetchingDate || 'nächsten Tag'}…</p>
              )}
            </div>
            {error && (
              <div className="rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 font-body">
                {error}
              </div>
            )}
            {dates.length > 0 && (
              <div className="space-y-3">
                <MiniCalendars
                  dates={dates}
                  status={status}
                  fetchingDate={fetchingDate}
                  selectedDate={selectedDate}
                  onSelect={selectDate}
                />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-border/60" /> ausstehend</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted/60" /> keine</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-950" /> wenige</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> viele</span>
                </div>
              </div>
            )}
          </section>
        )}

        {started && (
          <section className="glass-card glass-grain flex min-h-[420px] flex-col overflow-hidden rounded-sm border border-primary/15">
            <div className="flex flex-wrap items-center gap-2 border-b border-primary/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-headline text-sm font-semibold uppercase tracking-wider">Chat</div>
                <div className="text-[11px] text-muted-foreground tabular-nums font-body">
                  {loading && messages.length === 0
                    ? 'Warte auf den ersten Tag…'
                    : `${messages.length.toLocaleString('de-DE')} Nachrichten`}
                  {selectedDate ? ` · ${selectedDate}` : ''}
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={messages.length === 0} onClick={() => copyText('chat', markdown)}>
                {copied === 'chat' ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                {copied === 'chat' ? 'Kopiert' : 'Kopieren'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={messages.length === 0}
                onClick={() => downloadFile(`${activeUser.toLowerCase()}-chat.md`, markdown, 'text/markdown; charset=utf-8')}
              >
                Markdown
              </Button>
              <Button
                size="sm"
                disabled={messages.length === 0}
                onClick={() => downloadFile(`${activeUser.toLowerCase()}-chat.json`, json, 'application/json; charset=utf-8')}
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                JSON
              </Button>
            </div>

            <div className="max-h-[70vh] flex-1 overflow-auto px-4 py-4">
              {messages.length === 0 && !error && (
                <p className="py-16 text-center text-sm text-muted-foreground font-body">
                  {loading
                    ? 'Noch keine Nachrichten. Tage mit Chat erscheinen hier, sobald sie geladen sind.'
                    : `Keine Nachrichten in den letzten ${activeDays} Tagen in diesem Raum.`}
                </p>
              )}
              <div className="space-y-8">
                {dayGroups.map(day => (
                  <section key={day.date} id={`msg-day-${day.date}`} className="scroll-mt-3">
                    <h2
                      className={cn(
                        'sticky top-0 z-10 mb-3 border-b bg-card/95 py-1.5 font-headline text-xs uppercase tracking-wider text-muted-foreground backdrop-blur',
                        selectedDate === day.date ? 'border-primary/40 text-foreground' : 'border-border/40'
                      )}
                    >
                      {format(parseISO(`${day.date}T12:00:00`), 'EEEE, d. MMMM yyyy', { locale: de })}
                      <span className="ml-2 tabular-nums">{day.messages.length}</span>
                      {loading && <span className="ml-2 text-amber-300">live</span>}
                    </h2>
                    <div className="space-y-4">
                      {day.messages.map(message => (
                        <article key={message.id} className="group flex gap-3">
                          <div className="mt-0.5 flex-shrink-0">
                            <ProfilePic username={activeUser} src={avatar} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-baseline gap-2">
                              <span className="text-sm font-medium">{activeUser}</span>
                              <span className="text-[11px] tabular-nums text-muted-foreground">{stamp(message.time)}</span>
                              <button
                                type="button"
                                title="Nachricht kopieren"
                                onClick={() => copyText(message.id, message.text)}
                                className="ml-auto p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-foreground"
                              >
                                {copied === message.id ? <CheckIcon className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
                              </button>
                            </div>
                            <MessageBody text={message.text} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {visible < messages.length && (
                <div className="py-6 text-center">
                  <Button variant="outline" size="sm" onClick={() => setVisible(v => v + PAGE_SIZE)}>
                    Weitere laden ({(messages.length - visible).toLocaleString('de-DE')} verbleibend)
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
