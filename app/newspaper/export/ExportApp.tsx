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
 *
 * Layout: an editorial hero while empty; once a lookup runs, a sticky
 * dossier column (person, numbers, export actions) next to the
 * calendar and the transcript.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { addDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  ArrowUpIcon,
  BracesIcon,
  CheckIcon,
  CopyIcon,
  DatabaseIcon,
  FileTextIcon,
  RadioIcon,
  SearchIcon,
  XIcon
} from 'lucide-react'
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

function formatBytes(text: string) {
  const bytes = new Blob([text]).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
    'flex h-6 w-6 items-center justify-center rounded-[3px] border text-[10px] tabular-nums leading-none transition-[background-color,border-color,transform] hover:scale-110',
    selected && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
    fetching && 'animate-pulse border-amber-400 bg-amber-400/25 text-amber-100',
    !done && !fetching && 'border-dashed border-border/40 bg-transparent text-muted-foreground/30',
    done && count === 0 && 'border-border/30 bg-muted/30 text-muted-foreground/60',
    done && count > 0 && count < 4 && 'border-primary/25 bg-primary/15 text-primary/90',
    done && count >= 4 && count < 10 && 'border-primary/40 bg-primary/40 text-primary-foreground',
    done && count >= 10 && 'border-primary/70 bg-primary text-primary-foreground font-semibold'
  )
}

function DayRangeControl({
  value,
  onChange,
  disabled
}: {
  value: number
  onChange: (days: number) => void
  disabled: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Zeitraum" className="inline-flex items-center gap-2">
      <span className="font-headline text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">Zeitraum</span>
      <div className="inline-flex overflow-hidden rounded-sm border border-primary/20 bg-background/40 p-0.5">
        {DAY_OPTIONS.map(option => {
          const active = value === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option)}
              className={cn(
                'h-7 rounded-[3px] px-2.5 font-headline text-[11px] uppercase tracking-wide tabular-nums transition-colors',
                active
                  ? 'bg-primary/20 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.4)]'
                  : 'text-muted-foreground hover:text-foreground',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              {option}
              <span className="ml-0.5 text-[9px] font-normal normal-case tracking-normal opacity-70">T</span>
            </button>
          )
        })}
      </div>
    </div>
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
    return list.reverse()
  }, [dates])
  const inWindow = useMemo(() => new Set(dates), [dates])

  return (
    <div className="flex flex-wrap gap-x-7 gap-y-5">
      {months.map(month => {
        const start = startOfMonth(parseISO(`${month}-01T12:00:00`))
        const pad = (start.getDay() + 6) % 7
        const daysInMonth = endOfMonth(start).getDate()
        const cells: Array<string | null> = [
          ...Array.from({ length: pad }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'))
        ]
        const monthTotal = cells.reduce((sum, date) => sum + (date ? status.get(date)?.count || 0 : 0), 0)
        return (
          <div key={month} className="w-[190px]">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-headline text-[11px] uppercase tracking-[0.16em] text-foreground/80">
                {format(start, 'MMM yyyy', { locale: de })}
              </span>
              {monthTotal > 0 && (
                <span className="font-mono text-[10px] tabular-nums text-primary/80">{monthTotal.toLocaleString('de-DE')}</span>
              )}
            </div>
            <div className="mb-1 grid grid-cols-7 gap-[3px] text-[9px] text-muted-foreground/50">
              {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((label, i) => (
                <div key={`${month}-wd-${i}`} className="text-center">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-[3px]">
              {cells.map((date, i) => {
                if (!date || !inWindow.has(date)) {
                  return <div key={`${month}-cell-${i}`} className="h-6 w-6" />
                }
                const day = status.get(date)
                const done = Boolean(day?.done)
                const count = day?.count || 0
                return (
                  <button
                    key={`${month}-cell-${i}`}
                    type="button"
                    title={`${format(parseISO(`${date}T12:00:00`), 'EEEE, d. MMMM', { locale: de })} · ${done ? `${count} Nachrichten` : 'ausstehend'}`}
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

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-border/60" /> ausstehend</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-muted/50" /> keine</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-primary/15 border border-primary/25" /> wenige</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-primary/40" /> einige</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-primary" /> viele</span>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="font-headline text-xl leading-none tabular-nums text-foreground sm:text-2xl">{value}</div>
      <div className="mt-1 font-headline text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">{label}</div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-muted-foreground/60 font-mono">{hint}</div>}
    </div>
  )
}

function ExportAction({
  icon,
  label,
  meta,
  onClick,
  disabled,
  done,
  primary
}: {
  icon: React.ReactNode
  label: string
  meta: string
  onClick: () => void
  disabled: boolean
  done?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        primary
          ? 'border-primary/40 bg-primary/10 hover:bg-primary/20'
          : 'border-primary/15 bg-background/30 hover:border-primary/40 hover:bg-primary/5',
        done && 'border-emerald-500/50 bg-emerald-500/10'
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border',
          done
            ? 'border-emerald-500/40 text-emerald-400'
            : primary
              ? 'border-primary/40 text-primary'
              : 'border-primary/20 text-muted-foreground group-hover:text-primary'
        )}
      >
        {done ? <CheckIcon className="h-4 w-4" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-headline text-xs uppercase tracking-wide text-foreground">{done ? 'Kopiert' : label}</span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">{meta}</span>
      </span>
    </button>
  )
}

function TranscriptSkeleton() {
  return (
    <div className="space-y-6 py-2" aria-hidden>
      {[0, 1].map(group => (
        <div key={group} className="space-y-4">
          <div className="h-3 w-40 rounded-sm bg-primary/10" />
          {[0, 1, 2].map(row => (
            <div key={row} className="flex gap-4">
              <div className="mt-1 h-2.5 w-9 shrink-0 rounded-sm bg-muted/40" />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded-sm bg-muted/40" style={{ width: `${70 - row * 15}%` }} />
                {row !== 1 && <div className="h-3 w-1/3 rounded-sm bg-muted/30" />}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function HowItWorks() {
  const steps = [
    { icon: <DatabaseIcon className="h-4 w-4" />, title: 'Sofort aus dem Archiv', text: 'Bereits gespeicherte Tage erscheinen ohne Wartezeit.' },
    { icon: <RadioIcon className="h-4 w-4" />, title: 'Live nachgeladen', text: 'Fehlende Tage kommen Stück für Stück aus dem TradingView-Verlauf.' },
    { icon: <FileTextIcon className="h-4 w-4" />, title: 'Kopieren oder speichern', text: 'Als Markdown in die Zwischenablage oder als Datei, auch für KI-Tools.' }
  ]
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map((step, i) => (
        <li key={step.title} className="glass-card glass-grain rounded-sm border border-primary/10 p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="font-masthead gold-text text-2xl leading-none">{i + 1}</span>
            <span className="text-primary/70">{step.icon}</span>
          </div>
          <div className="font-headline text-xs uppercase tracking-wide text-foreground">{step.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground font-body">{step.text}</p>
        </li>
      ))}
    </ol>
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
  const [filter, setFilter] = useState('')

  const runRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoStarted = useRef(false)
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  const doneCount = useMemo(() => Array.from(status.values()).filter(day => day.done).length, [status])
  const activeDayCount = useMemo(() => Array.from(status.values()).filter(day => day.done && day.count > 0).length, [status])
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
    setFilter('')
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
    setFilter('')
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
      copyTimer.current = setTimeout(() => setCopied(null), 1800)
    } catch {
      setError('Kopieren in die Zwischenablage nicht möglich')
    }
  }

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return messages
    return messages.filter(message => message.text.toLowerCase().includes(needle))
  }, [messages, filter])

  const dayGroups = useMemo(() => {
    const groups: Array<{ date: string; messages: ListedMessage[] }> = []
    for (const message of filtered.slice(0, visible)) {
      const last = groups[groups.length - 1]
      if (last && last.date === message.date) last.messages.push(message)
      else groups.push({ date: message.date, messages: [message] })
    }
    return groups
  }, [filtered, visible])

  const markdown = useMemo(() => (started ? listedToMarkdown(activeUser, messages) : ''), [started, activeUser, messages])
  const json = useMemo(
    () => (started ? JSON.stringify(listedToJson({ username: activeUser, room: activeRoom, messages }), null, 2) : ''),
    [started, activeUser, activeRoom, messages]
  )
  const markdownSize = useMemo(() => (markdown ? formatBytes(markdown) : '–'), [markdown])
  const jsonSize = useMemo(() => (json ? formatBytes(json) : '–'), [json])

  const span = useMemo(() => {
    if (dates.length === 0) return null
    const oldest = dates[dates.length - 1]
    const newest = dates[0]
    return `${format(parseISO(`${oldest}T12:00:00`), 'd. MMM', { locale: de })} – ${format(parseISO(`${newest}T12:00:00`), 'd. MMM yyyy', { locale: de })}`
  }, [dates])

  const perActiveDay = activeDayCount > 0 ? (messages.length / activeDayCount).toFixed(1).replace('.', ',') : '–'

  return (
    <main className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />
      <ToolHeader section="Export" subtitle="Chat-Verlauf eines Nutzers kopieren oder herunterladen" />

      {!started ? (
        <div className="relative z-10 mx-auto w-full max-w-[860px] px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24">
          <div className="mb-8 text-center">
            <div className="mb-3 inline-flex items-center gap-2 font-headline text-[10px] uppercase tracking-[0.28em] text-primary/80">
              <span className="h-px w-8 bg-primary/40" />
              Archiv · Export
              <span className="h-px w-8 bg-primary/40" />
            </div>
            <h2 className="font-headline text-3xl leading-tight text-foreground sm:text-[2.75rem]">
              Chat-Verlauf, sauber exportiert.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground font-body sm:text-[15px]">
              Öffentlicher TradingView-Benutzername genügt. Gespeicherte Tage erscheinen sofort, der Rest wird live aus dem
              Archiv nachgeladen. Am Ende: Markdown oder JSON, ein Klick.
            </p>
          </div>

          <LookupForm
            variant="hero"
            username={username}
            room={room}
            onUsernameChange={value => setUsername(normalizeUsername(value))}
            onRoomChange={setRoom}
            onSubmit={() => void startFetch(username, room, days)}
            loading={loading}
            submitLabel="Laden"
          >
            <DayRangeControl value={days} onChange={setDays} disabled={loading} />
          </LookupForm>

          <div className="mt-10">
            <HowItWorks />
          </div>
        </div>
      ) : (
        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          <LookupForm
            username={username}
            room={room}
            onUsernameChange={value => setUsername(normalizeUsername(value))}
            onRoomChange={setRoom}
            onSubmit={() => void startFetch(username, room, days)}
            loading={loading}
            submitLabel="Laden"
          >
            <DayRangeControl value={days} onChange={setDays} disabled={loading} />
          </LookupForm>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
            {/* Dossier column */}
            <aside className="space-y-4 lg:sticky lg:top-[4.25rem] lg:self-start">
              <section className="glass-card-gold glass-grain rounded-sm border border-primary/20 p-5">
                <div className="flex items-start gap-4">
                  <ProfilePic username={activeUser} src={avatar} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-masthead gold-text truncate text-2xl leading-tight">{activeUser}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-[3px] border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-headline text-[10px] uppercase tracking-wide text-primary">
                        {roomLabel}
                      </span>
                      {span && <span className="font-mono text-[10px] text-muted-foreground/70">{span}</span>}
                    </div>
                  </div>
                </div>

                <div className="my-5 newspaper-rule-gold" />

                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Nachrichten" value={messages.length.toLocaleString('de-DE')} />
                  <Stat label="Aktive Tage" value={activeDayCount.toLocaleString('de-DE')} hint={`von ${activeDays}`} />
                  <Stat label="Ø je Tag" value={perActiveDay} />
                </div>

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-mono tabular-nums">
                    <span className={cn('inline-flex items-center gap-1.5', loading ? 'text-amber-300' : 'text-emerald-400')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-400')} />
                      {loading ? `Lade ${fetchingDate ?? 'nächsten Tag'}` : error ? 'Unvollständig' : 'Vollständig'}
                    </span>
                    <span className="text-muted-foreground">{doneCount}/{activeDays} Tage</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-500',
                        loading ? 'bg-gradient-to-r from-amber-500 to-amber-300' : 'bg-gradient-to-r from-primary/70 to-primary'
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {error && (
                  <div className="mt-4 rounded-sm border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-red-300 font-body">
                    {error}
                  </div>
                )}
              </section>

              <section className="glass-card glass-grain rounded-sm border border-primary/15 p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="font-headline text-[11px] uppercase tracking-[0.18em] text-foreground">Export</h3>
                  <span className="font-mono text-[10px] text-muted-foreground">{messages.length.toLocaleString('de-DE')} Nachrichten</span>
                </div>
                <div className="space-y-2">
                  <ExportAction
                    primary
                    icon={<CopyIcon className="h-4 w-4" />}
                    label="Markdown kopieren"
                    meta={`Zwischenablage · ${markdownSize}`}
                    onClick={() => copyText('chat', markdown)}
                    disabled={messages.length === 0}
                    done={copied === 'chat'}
                  />
                  <ExportAction
                    icon={<FileTextIcon className="h-4 w-4" />}
                    label="Markdown herunterladen"
                    meta={`${activeUser.toLowerCase()}-chat.md · ${markdownSize}`}
                    onClick={() => downloadFile(`${activeUser.toLowerCase()}-chat.md`, markdown, 'text/markdown; charset=utf-8')}
                    disabled={messages.length === 0}
                  />
                  <ExportAction
                    icon={<BracesIcon className="h-4 w-4" />}
                    label="JSON herunterladen"
                    meta={`${activeUser.toLowerCase()}-chat.json · ${jsonSize}`}
                    onClick={() => downloadFile(`${activeUser.toLowerCase()}-chat.json`, json, 'application/json; charset=utf-8')}
                    disabled={messages.length === 0}
                  />
                </div>
                {loading && messages.length > 0 && (
                  <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/70 font-body">
                    Export enthält den aktuellen Stand; weitere Tage kommen noch dazu.
                  </p>
                )}
              </section>
            </aside>

            {/* Reading column */}
            <div className="min-w-0 space-y-5">
              {dates.length > 0 && (
                <section className="glass-card glass-grain rounded-sm border border-primary/15 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-headline text-[11px] uppercase tracking-[0.18em] text-foreground">
                      Kalender
                      <span className="ml-2 font-mono text-[10px] normal-case tracking-normal text-muted-foreground">
                        Tag anklicken springt zur Stelle
                      </span>
                    </h3>
                    <Legend />
                  </div>
                  <MiniCalendars
                    dates={dates}
                    status={status}
                    fetchingDate={fetchingDate}
                    selectedDate={selectedDate}
                    onSelect={selectDate}
                  />
                </section>
              )}

              <section className="glass-card glass-grain flex flex-col overflow-hidden rounded-sm border border-primary/15">
                <div className="flex flex-wrap items-center gap-3 border-b border-primary/10 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-headline text-[11px] uppercase tracking-[0.18em] text-foreground">Transkript</h3>
                    <div className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {loading && messages.length === 0
                        ? 'Warte auf den ersten Tag…'
                        : filter
                          ? `${filtered.length.toLocaleString('de-DE')} von ${messages.length.toLocaleString('de-DE')} Treffer`
                          : `${messages.length.toLocaleString('de-DE')} Nachrichten · neueste zuerst`}
                      {loading && messages.length > 0 && <span className="ml-2 text-amber-300">live</span>}
                    </div>
                  </div>
                  <label className="relative w-full sm:w-64">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      value={filter}
                      onChange={event => {
                        setFilter(event.target.value)
                        setVisible(PAGE_SIZE)
                      }}
                      placeholder="Im Transkript suchen"
                      aria-label="Im Transkript suchen"
                      disabled={messages.length === 0}
                      className={cn(
                        'h-8 w-full rounded-sm border border-primary/15 bg-background/50 pl-8 pr-7 font-body text-xs text-foreground',
                        'placeholder:text-muted-foreground/50 outline-none transition-[border-color,box-shadow]',
                        'focus:border-primary/50 focus:ring-[3px] focus:ring-primary/10 disabled:opacity-40'
                      )}
                    />
                    {filter && (
                      <button
                        type="button"
                        aria-label="Suche löschen"
                        onClick={() => setFilter('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </label>
                </div>

                <div ref={transcriptRef} className="max-h-[calc(100vh-14rem)] min-h-[360px] flex-1 overflow-auto px-4 py-4 sm:px-5">
                  {loading && messages.length === 0 && <TranscriptSkeleton />}

                  {!loading && messages.length === 0 && !error && (
                    <div className="py-16 text-center">
                      <p className="font-headline text-sm uppercase tracking-wider text-foreground/70">Nichts gefunden</p>
                      <p className="mt-2 text-xs text-muted-foreground font-body">
                        Keine Nachrichten von {activeUser} in den letzten {activeDays} Tagen in {roomLabel}.
                      </p>
                    </div>
                  )}

                  {messages.length > 0 && filtered.length === 0 && (
                    <div className="py-16 text-center">
                      <p className="font-headline text-sm uppercase tracking-wider text-foreground/70">Kein Treffer</p>
                      <p className="mt-2 text-xs text-muted-foreground font-body">Kein Beitrag enthält „{filter.trim()}“.</p>
                    </div>
                  )}

                  <div className="space-y-8">
                    {dayGroups.map(day => (
                      <section key={day.date} id={`msg-day-${day.date}`} className="scroll-mt-2">
                        <h4
                          className={cn(
                            'sticky top-0 z-10 -mx-4 mb-3 flex items-baseline gap-3 border-b bg-card/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5',
                            selectedDate === day.date ? 'border-primary/50' : 'border-primary/10'
                          )}
                        >
                          <span
                            className={cn(
                              'font-headline text-xs uppercase tracking-[0.14em]',
                              selectedDate === day.date ? 'text-primary' : 'text-foreground/85'
                            )}
                          >
                            {format(parseISO(`${day.date}T12:00:00`), 'EEEE, d. MMMM yyyy', { locale: de })}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{day.messages.length}</span>
                        </h4>
                        <ol className="space-y-3.5">
                          {day.messages.map(message => (
                            <li key={message.id} className="group grid grid-cols-[2.75rem_minmax(0,1fr)_1.5rem] gap-x-3">
                              <time className="pt-[3px] font-mono text-[11px] tabular-nums text-muted-foreground/70">
                                {stamp(message.time)}
                              </time>
                              <div className="min-w-0 border-l border-primary/10 pl-3 group-hover:border-primary/30 transition-colors">
                                <MessageBody text={message.text} />
                              </div>
                              <button
                                type="button"
                                title="Nachricht kopieren"
                                aria-label="Nachricht kopieren"
                                onClick={() => copyText(message.id, message.text)}
                                className={cn(
                                  'mt-0.5 flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:text-foreground focus:opacity-100',
                                  copied === message.id ? 'opacity-100 text-emerald-400' : 'opacity-0 group-hover:opacity-100'
                                )}
                              >
                                {copied === message.id ? <CheckIcon className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
                              </button>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ))}
                  </div>

                  {visible < filtered.length && (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-sm font-headline text-[11px] uppercase tracking-wide"
                        onClick={() => setVisible(v => v + PAGE_SIZE)}
                      >
                        Weitere {Math.min(PAGE_SIZE, filtered.length - visible).toLocaleString('de-DE')} laden
                      </Button>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {(filtered.length - visible).toLocaleString('de-DE')} verbleibend
                      </span>
                    </div>
                  )}

                  {visible >= filtered.length && filtered.length > PAGE_SIZE && (
                    <div className="flex justify-center py-6">
                      <button
                        type="button"
                        onClick={() => transcriptRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="inline-flex items-center gap-1.5 font-headline text-[10px] uppercase tracking-wide text-muted-foreground hover:text-primary"
                      >
                        <ArrowUpIcon className="h-3 w-3" /> Nach oben
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
