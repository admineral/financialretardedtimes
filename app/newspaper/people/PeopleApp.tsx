'use client'

/**
 * PeopleApp.tsx (/newspaper/people) — Netzwerk & Export
 *
 * One chatter, everything we have stored about them: profile and totals,
 * the conversation network across all years, the day heatmap, every
 * message, and an LLM-ready JSON export. TradingView no longer serves the
 * public chat history, so all data comes from our database:
 *
 *  1. profile route → totals, day counts and available years (fast, cached index)
 *  2. network route → ego network for the chosen period, in parallel
 *  3. messages route → one year at a time, newest first, so the latest
 *     conversation shows at once while older years stream in.
 *
 * Names are matched case-insensitively and replaced by the stored spelling.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, ArrowUpRight, CalendarDays, Loader2, MessageSquare, Search, Users } from 'lucide-react'
import { ContactList } from '@/components/people/ContactList'
import { CoveragePanel } from '@/components/people/CoveragePanel'
import { ExportPanel } from '@/components/people/ExportPanel'
import { NetworkCanvas } from '@/components/people/NetworkCanvas'
import { PersonPanel } from '@/components/people/PersonPanel'
import { GithubHeatmap } from '@/components/chat/GithubHeatmap'
import { MessageList } from '@/components/chat/MessageList'
import { ProfilePic } from '@/components/chat/ProfilePic'
import { normalizeUsername } from '@/lib/tv-chat/client'
import { enrichMessage } from '@/lib/tv-chat/parse'
import { DEFAULT_ROOM, ROOM_OPTIONS, type ActivityMessage, type ListedMessage } from '@/lib/tv-chat/types'
import type { CompactMessage, DirectoryEntry, NetworkResponse, ProfileResponse } from '@/lib/people/types'
import { ToolHeader } from '../components/ToolHeader'

const API = '/newspaper/people/api'

type Period = 'all' | number
type Kind = 'all' | 'quote' | 'mention'

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? `Anfrage fehlgeschlagen (${response.status})`)
  return data as T
}

function parseRoom(value: string | null): string {
  return value && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : DEFAULT_ROOM
}

function toListed(username: string, messages: CompactMessage[]): ListedMessage[] {
  return messages
    .map(m => ({
      ...enrichMessage({ id: m.id, text: m.text, time: m.ts ?? '', author: username }),
      username,
      date: m.date ?? '',
      source: 'history' as const
    }))
    .reverse()
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-sm border border-primary/15 bg-card/50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
        <span className="text-primary/70">{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 font-mono text-lg tabular-nums leading-tight">{value}</div>
    </div>
  )
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`rounded-sm border px-2 py-1 text-[11px] font-mono transition-colors ${
        active ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/60 text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function fmtDate(date: string | null) {
  if (!date) return '—'
  const [y, m, d] = date.split('-')
  return `${d}.${m}.${y}`
}

export function PeopleApp() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [input, setInput] = useState(() => normalizeUsername(searchParams.get('username') ?? ''))
  const [room, setRoom] = useState(() => parseRoom(searchParams.get('room')))
  const [directory, setDirectory] = useState<DirectoryEntry[]>([])

  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [byYear, setByYear] = useState<Record<number, CompactMessage[]>>({})
  const [pendingYears, setPendingYears] = useState<number[]>([])

  const [period, setPeriod] = useState<Period>('all')
  const [kind, setKind] = useState<Kind>('all')
  const [limit, setLimit] = useState(40)
  const [secondRing, setSecondRing] = useState(true)
  const [network, setNetwork] = useState<NetworkResponse | null>(null)
  const [networkLoading, setNetworkLoading] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const [heatYear, setHeatYear] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const runRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  // Directory: who is stored at all (also warms the server index).
  useEffect(() => {
    const abort = new AbortController()
    getJson<{ people: DirectoryEntry[] }>(`${API}/directory?room=${encodeURIComponent(room)}`, abort.signal)
      .then(data => setDirectory(data.people))
      .catch(() => undefined)
    return () => abort.abort()
  }, [room])

  const lookup = useCallback(
    async (raw: string, chatRoom: string) => {
      const name = normalizeUsername(raw)
      if (!name) return
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      const run = ++runRef.current

      setLoadingProfile(true)
      setError(null)
      setProfile(null)
      setNetwork(null)
      setByYear({})
      setPendingYears([])
      setSelectedDate(null)
      setHighlight(null)
      setSelected(null)

      try {
        const data = await getJson<ProfileResponse>(
          `${API}/profile?username=${encodeURIComponent(name)}&room=${encodeURIComponent(chatRoom)}`,
          abort.signal
        )
        if (run !== runRef.current) return
        setProfile(data)
        setInput(data.username)
        setHeatYear(null)
        const params = new URLSearchParams({ username: data.username })
        if (chatRoom !== DEFAULT_ROOM) params.set('room', chatRoom)
        router.replace(`${pathname}?${params}`, { scroll: false })
        setLoadingProfile(false)

        // Years newest first; each one paints as soon as it arrives.
        const years = data.years.filter(y => y.messages > 0).map(y => y.year)
        setPendingYears(years)
        for (const year of years) {
          const page = await getJson<{ messages: CompactMessage[] }>(
            `${API}/messages?username=${encodeURIComponent(data.username)}&room=${encodeURIComponent(chatRoom)}&year=${year}`,
            abort.signal
          )
          if (run !== runRef.current) return
          setByYear(current => ({ ...current, [year]: page.messages }))
          setPendingYears(current => current.filter(y => y !== year))
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError' || run !== runRef.current) return
        setError(err instanceof Error ? err.message : 'Abruf fehlgeschlagen')
        setLoadingProfile(false)
        setPendingYears([])
      }
    },
    [pathname, router]
  )

  // Open the person from the URL once per mount (strict mode remounts abort the first run).
  useEffect(() => {
    const initial = normalizeUsername(searchParams.get('username') ?? '')
    if (initial) void lookup(initial, parseRoom(searchParams.get('room')))
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Network follows the person and the graph controls.
  const activeUser = profile?.username ?? null
  useEffect(() => {
    if (!activeUser) return
    const abort = new AbortController()
    const params = new URLSearchParams({
      username: activeUser,
      room,
      kind,
      limit: String(limit),
      ring2: secondRing ? '20' : '0'
    })
    if (period !== 'all') {
      params.set('from', `${period}-01-01`)
      params.set('to', `${period}-12-31`)
    }
    setNetworkLoading(true)
    getJson<NetworkResponse>(`${API}/network?${params}`, abort.signal)
      .then(setNetwork)
      .catch(err => {
        if ((err as { name?: string }).name !== 'AbortError') setNetwork(null)
      })
      .finally(() => {
        if (!abort.signal.aborted) setNetworkLoading(false)
      })
    return () => abort.abort()
  }, [activeUser, room, period, kind, limit, secondRing])

  const messages = useMemo(() => {
    if (!activeUser) return []
    return Object.keys(byYear)
      .map(Number)
      .sort((a, b) => b - a)
      .flatMap(year => toListed(activeUser, byYear[year]))
  }, [byYear, activeUser])

  // Years that actually have messages; empty years are not drawn.
  const activeYears = useMemo(
    () => (profile ? profile.years.filter(y => y.messages > 0).map(y => y.year) : undefined),
    [profile]
  )

  // A year chip narrows the list to that year; "Alle" (default) shows everything stored.
  const yearMessages = useMemo(
    () => (heatYear ? messages.filter(m => m.date.startsWith(String(heatYear))) : messages),
    [messages, heatYear]
  )

  const messagesByDate = useMemo(() => {
    const map = new Map<string, ActivityMessage[]>()
    for (const message of messages) {
      const bucket = map.get(message.date) ?? []
      bucket.push({ id: message.id, text: message.text, time: message.time })
      map.set(message.date, bucket)
    }
    return map
  }, [messages])
  const loadDay = useCallback(async (date: string) => messagesByDate.get(date) ?? [], [messagesByDate])

  const heatDays = useMemo(
    () => (profile ? (heatYear ? profile.days.filter(day => day.date.startsWith(String(heatYear))) : profile.days) : []),
    [profile, heatYear]
  )

  const selectedNode = network?.nodes.find(n => n.username === selected && n.hop !== 0)

  const recenter = (name: string) => {
    setInput(name)
    void lookup(name, room)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const directoryMatches = useMemo(() => {
    const query = input.toLowerCase()
    if (!query || profile) return directory.slice(0, 24)
    return directory.filter(person => person.username.toLowerCase().includes(query)).slice(0, 24)
  }, [directory, input, profile])

  // In-page suggestions; a native <datalist> renders as an OS popup outside the window.
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const suggestions = useMemo(() => {
    const query = input.toLowerCase()
    if (!query) return []
    return directory
      .filter(person => person.username.toLowerCase().includes(query) && person.username.toLowerCase() !== query)
      .sort((a, b) => Number(b.username.toLowerCase().startsWith(query)) - Number(a.username.toLowerCase().startsWith(query)))
      .slice(0, 8)
  }, [directory, input])
  const showSuggestions = suggestOpen && suggestions.length > 0
  const pickSuggestion = (name: string) => {
    setSuggestOpen(false)
    recenter(name)
  }

  const yearsLoaded = profile ? profile.years.filter(y => y.messages > 0).length - pendingYears.length : 0
  const yearsTotal = profile ? profile.years.filter(y => y.messages > 0).length : 0

  return (
    <main className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />
      <ToolHeader section="Netzwerk & Export" subtitle="Wer spricht mit wem: alles Gespeicherte zu einer Person, als Netzwerk und als KI-Export" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={event => {
            event.preventDefault()
            void lookup(input, room)
          }}
        >
          <label className="relative flex-1">
            <span className="sr-only">Benutzername</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={input}
              onChange={event => {
                setInput(normalizeUsername(event.target.value))
                setSuggestOpen(true)
                setActiveSuggestion(0)
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setSuggestOpen(false)}
              onKeyDown={event => {
                if (!showSuggestions) return
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const step = event.key === 'ArrowDown' ? 1 : -1
                  setActiveSuggestion(i => (i + step + suggestions.length) % suggestions.length)
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  pickSuggestion(suggestions[activeSuggestion].username)
                } else if (event.key === 'Escape') {
                  setSuggestOpen(false)
                }
              }}
              role="combobox"
              aria-expanded={showSuggestions}
              aria-controls="people-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={showSuggestions ? `people-suggestion-${activeSuggestion}` : undefined}
              placeholder="TradingView-Name, z. B. BigBangTheory"
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full rounded-sm border border-primary/25 bg-card/60 pl-9 pr-3 font-mono text-sm outline-none focus:border-primary/60"
            />
            {showSuggestions && (
              <ul
                id="people-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-sm border border-primary/25 bg-card shadow-lg"
              >
                {suggestions.map((person, index) => (
                  <li
                    key={person.username}
                    id={`people-suggestion-${index}`}
                    role="option"
                    aria-selected={index === activeSuggestion}
                    // mousedown fires before the input's blur closes the list
                    onMouseDown={event => {
                      event.preventDefault()
                      pickSuggestion(person.username)
                    }}
                    onMouseEnter={() => setActiveSuggestion(index)}
                    className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${index === activeSuggestion ? 'bg-primary/15' : ''}`}
                  >
                    <ProfilePic username={person.username} src={person.avatar} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-mono">{person.username}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {person.messages.toLocaleString('de-DE')} Nachrichten
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </label>
          <select
            value={room}
            onChange={event => setRoom(event.target.value)}
            aria-label="Chatraum"
            className="h-11 rounded-sm border border-primary/25 bg-card/60 px-3 text-sm outline-none focus:border-primary/60"
          >
            {[...ROOM_OPTIONS, ...(ROOM_OPTIONS.some(o => o.id === room) ? [] : [{ id: room, label: room }])].map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!input || loadingProfile}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-primary px-5 text-xs font-headline font-semibold uppercase tracking-wide text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loadingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Öffnen
          </button>
        </form>

        {error && (
          <div role="alert" className="rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 font-body">
            {error}
          </div>
        )}

        {!profile && !loadingProfile && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-headline text-sm font-semibold uppercase tracking-wider">
                {input ? 'Passende Stimmen' : 'Die aktivsten Stimmen im Archiv'}
              </h2>
              <span className="text-[11px] text-muted-foreground">
                {directory.length ? `${directory.length} Personen gespeichert` : 'Archiv wird gelesen…'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {directoryMatches.map(person => (
                <button
                  key={person.username}
                  type="button"
                  onClick={() => recenter(person.username)}
                  className="flex items-center gap-2.5 rounded-sm border border-primary/15 bg-card/40 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card/70"
                >
                  <ProfilePic username={person.username} src={person.avatar} size="md" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{person.username}</div>
                    <div className="text-[10px] font-mono tabular-nums text-muted-foreground">
                      {person.messages.toLocaleString('de-DE')} · bis {fmtDate(person.lastDate)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {loadingProfile && (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Archiv wird gelesen…
          </div>
        )}

        {profile && (
          <>
            <section className="glass-card-gold glass-grain rounded-sm border border-primary/20 p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                <ProfilePic username={profile.username} src={profile.profile.avatar} size="lg" />
                <div className="min-w-0 flex-1">
                  <h1 className="font-masthead text-3xl gold-text leading-tight truncate">{profile.username}</h1>
                  <p className="text-xs text-muted-foreground font-body">
                    {ROOM_OPTIONS.find(o => o.id === profile.room)?.label ?? profile.room}
                    {profile.profile.joinDate && ` · TradingView seit ${fmtDate(profile.profile.joinDate)}`}
                    {profile.profile.followers != null && ` · ${profile.profile.followers.toLocaleString('de-DE')} Follower`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
                    <Link
                      href={`/chat-archive?room=${encodeURIComponent(profile.room)}&username=${encodeURIComponent(profile.username)}`}
                      className="inline-flex items-center gap-1 text-primary/80 hover:text-primary"
                    >
                      Profilseite <ArrowUpRight className="h-3 w-3" />
                    </Link>
                    <a
                      href={`https://www.tradingview.com/u/${encodeURIComponent(profile.username)}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      TradingView <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto">
                  <Stat icon={<MessageSquare className="h-3 w-3" />} label="Nachrichten" value={profile.profile.messages.toLocaleString('de-DE')} />
                  <Stat icon={<CalendarDays className="h-3 w-3" />} label="Aktive Tage" value={profile.profile.activeDays.toLocaleString('de-DE')} />
                  <Stat icon={<Users className="h-3 w-3" />} label="Kontakte" value={network ? network.totalContacts.toLocaleString('de-DE') : '…'} />
                  <Stat icon={<CalendarDays className="h-3 w-3" />} label="Gespeichert seit" value={profile.profile.firstDate?.slice(0, 4) ?? '—'} />
                </div>
              </div>
              <div className="mt-4 border-t border-primary/10 pt-3">
                <CoveragePanel username={profile.username} room={profile.room} />
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-headline text-sm font-semibold uppercase tracking-wider">Netzwerk</h2>
                  <p className="text-[11px] text-muted-foreground font-body">
                    Zitate und @Erwähnungen aus allen gespeicherten Nachrichten des Raums, in beide Richtungen.
                    {network && network.hiddenContacts > 0 && ` ${network.hiddenContacts} schwächere Kontakte ausgeblendet.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip active={period === 'all'} onClick={() => setPeriod('all')}>Alle Jahre</Chip>
                  {profile.years.map(y => (
                    <Chip key={y.year} active={period === y.year} onClick={() => setPeriod(y.year)}>
                      {y.year}
                    </Chip>
                  ))}
                  <span className="mx-1 h-4 w-px bg-border" />
                  <Chip active={kind === 'all'} onClick={() => setKind('all')}>Alles</Chip>
                  <Chip active={kind === 'quote'} onClick={() => setKind('quote')}>Zitate</Chip>
                  <Chip active={kind === 'mention'} onClick={() => setKind('mention')}>@</Chip>
                  <span className="mx-1 h-4 w-px bg-border" />
                  {[20, 40, 80, 200].map(value => (
                    <Chip key={value} active={limit === value} onClick={() => setLimit(value)} title="Anzahl direkter Kontakte">
                      {value === 200 ? 'alle' : value}
                    </Chip>
                  ))}
                  <Chip active={secondRing} onClick={() => setSecondRing(v => !v)} title="Personen, die mit mehreren Kontakten sprechen">
                    2. Kreis
                  </Chip>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                <div className="relative lg:col-span-8">
                  {network && network.nodes.length > 1 ? (
                    <NetworkCanvas
                      center={network.username}
                      nodes={network.nodes}
                      links={network.links}
                      selected={selected}
                      highlight={highlight}
                      onSelect={setSelected}
                      onRecenter={recenter}
                    />
                  ) : (
                    <div className="flex h-[680px] items-center justify-center rounded-sm border border-primary/15 bg-background/60 text-sm text-muted-foreground">
                      {networkLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Netzwerk wird berechnet…
                        </span>
                      ) : (
                        'Keine Zitate oder Erwähnungen in diesem Zeitraum.'
                      )}
                    </div>
                  )}
                  {networkLoading && network && (
                    <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-sm bg-card/90 px-2 py-1 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> aktualisiere…
                    </div>
                  )}
                </div>
                <div className="h-[460px] lg:col-span-4 lg:h-[680px]">
                  {selectedNode && network ? (
                    <PersonPanel
                      person={selectedNode}
                      center={network.username}
                      room={network.room}
                      nodes={network.nodes}
                      links={network.links}
                      onClose={() => setSelected(null)}
                      onSelect={setSelected}
                      onRecenter={recenter}
                    />
                  ) : (
                    <ContactList
                      center={profile.username}
                      nodes={network?.nodes ?? []}
                      highlight={highlight}
                      onHighlight={setHighlight}
                      onSelect={setSelected}
                    />
                  )}
                </div>
              </div>
            </section>

            <section className="flex flex-wrap items-center gap-2 rounded-sm border border-primary/20 bg-card/40 px-4 py-3">
              <h2 className="mr-2 font-headline text-sm font-semibold uppercase tracking-wider">Nachrichten nach Jahr</h2>
              <button
                type="button"
                aria-pressed={heatYear === null}
                onClick={() => {
                  setHeatYear(null)
                  setSelectedDate(null)
                }}
                className={`inline-flex items-baseline gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-xs transition-colors ${
                  heatYear === null
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-border/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="font-semibold">Alle</span>
                <span className="text-[10px] opacity-75">{profile.profile.messages.toLocaleString('de-DE')}</span>
              </button>
              {profile.years
                .filter(y => y.messages > 0)
                .map(y => (
                  <button
                    key={y.year}
                    type="button"
                    aria-pressed={heatYear === y.year}
                    onClick={() => {
                      // Clicking the active year again goes back to all years.
                      setHeatYear(current => (current === y.year ? null : y.year))
                      setSelectedDate(null)
                    }}
                    className={`inline-flex items-baseline gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-xs transition-colors ${
                      heatYear === y.year
                        ? 'border-primary/60 bg-primary/15 text-primary'
                        : 'border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {pendingYears.includes(y.year) && <Loader2 className="h-3 w-3 animate-spin self-center" />}
                    <span className="font-semibold">{y.year}</span>
                    <span className="text-[10px] opacity-75">{y.messages.toLocaleString('de-DE')}</span>
                  </button>
                ))}
            </section>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="space-y-6 xl:col-span-5">
                <ExportPanel username={profile.username} room={profile.room} years={profile.years} days={profile.days} />

                <section className="glass-card glass-grain rounded-sm border border-primary/15 p-4 sm:p-5">
                  <div className="mb-3 flex items-baseline justify-between gap-2">
                    <h3 className="font-headline text-sm font-semibold uppercase tracking-wider">Aktivität {heatYear ?? 'alle Jahre'}</h3>
                    <span className="text-[11px] text-muted-foreground">Tag anklicken springt zu den Nachrichten</span>
                  </div>
                  <GithubHeatmap
                    days={heatDays}
                    onlyYears={heatYear ? [heatYear] : activeYears}
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                    loadDay={loadDay}
                  />
                </section>
              </div>

              <div className="xl:col-span-7">
                <MessageList
                  username={profile.username}
                  avatar={profile.profile.avatar}
                  title={heatYear ? `Nachrichten ${heatYear}` : 'Alle Nachrichten'}
                  messages={yearMessages}
                  loading={heatYear !== null ? pendingYears.includes(heatYear) : pendingYears.length > 0 && messages.length === 0}
                  progress={pendingYears.length ? `lade Jahre ${yearsLoaded}/${yearsTotal}` : null}
                  selectedDate={selectedDate}
                  onMention={recenter}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
