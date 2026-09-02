'use client'

/**
 * PeopleApp.tsx (/newspaper/people)
 *
 * One public TradingView user, three views: activity heatmap, day reader,
 * and a 2D ego network (quotes + mentions, two hops). Data comes from the
 * activity cache (`/api/chat-activity`) and the live-room network route;
 * nothing is preloaded, the visitor picks the person.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, MessageSquare, Users } from 'lucide-react'
import { EgoGraph } from '@/components/chat/EgoGraph'
import { GithubHeatmap } from '@/components/chat/GithubHeatmap'
import { LookupForm } from '@/components/chat/LookupForm'
import { MessageList, downloadJson, downloadText } from '@/components/chat/MessageList'
import { ProfilePic } from '@/components/chat/ProfilePic'
import { egoGraph, mergeEdges, type RawEdge } from '@/lib/tv-chat/graph'
import { listedToJson, listedToMarkdown } from '@/lib/tv-chat/messages'
import { edgesFromMessage } from '@/lib/tv-chat/parse'
import {
  PartialActivityError,
  fetchActivity,
  fetchAvatar,
  messagesFromActivities,
  normalizeUsername,
  type ActivityDayBucket
} from '@/lib/tv-chat/client'
import {
  DEFAULT_ROOM,
  ROOM_OPTIONS,
  type ActivityDay,
  type ActivityMessage,
  type GraphEdge,
  type ListedMessage
} from '@/lib/tv-chat/types'
import { ToolHeader } from '../components/ToolHeader'

/** Days filled from TradingView after the cache paints (the rest is "Frisch laden"). */
const REFRESH_DAYS = 30
const DEEP_REFRESH_DAYS = 365

interface NetworkResponse {
  username: string
  edges: GraphEdge[]
  users: string[]
  notes: string[]
}

function parseRoom(value: string | null): string {
  return value && ROOM_OPTIONS.some(option => option.id === value) ? value : DEFAULT_ROOM
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
      <span className="text-primary/70">{icon}</span>
      {value}
      <span className="font-body text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
    </span>
  )
}

export function PeopleApp() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [username, setUsername] = useState(() => normalizeUsername(searchParams.get('username') ?? ''))
  const [room, setRoom] = useState(() => parseRoom(searchParams.get('room')))

  const [activeUser, setActiveUser] = useState('')
  const [activeRoom, setActiveRoom] = useState(DEFAULT_ROOM)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [activities, setActivities] = useState<ActivityDayBucket[]>([])
  const [messages, setMessages] = useState<ListedMessage[]>([])
  const [network, setNetwork] = useState<NetworkResponse | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const autoStarted = useRef(false)

  useEffect(() => () => abortRef.current?.abort(), [])

  const syncUrl = useCallback((user: string, chatRoom: string) => {
    const params = new URLSearchParams()
    if (user) params.set('username', user)
    if (chatRoom !== DEFAULT_ROOM) params.set('room', chatRoom)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [pathname, router])

  const applyActivities = useCallback((user: string, buckets: ActivityDayBucket[]) => {
    setActivities(buckets)
    setMessages(messagesFromActivities(user, buckets))
  }, [])

  /** Fill missing days from TradingView while polling the cache so days stream in. */
  const refresh = useCallback(async (user: string, chatRoom: string, days: number, run: number, signal: AbortSignal) => {
    setRefreshing(true)
    let poll: ReturnType<typeof setInterval> | null = null
    try {
      poll = setInterval(() => {
        if (run !== runRef.current) return
        fetchActivity({ room: chatRoom, username: user, cacheOnly: true, allCached: true, signal })
          .then(data => {
            if (run === runRef.current) applyActivities(user, data.activities)
          })
          .catch(() => undefined)
      }, 1500)

      await fetchActivity({ room: chatRoom, username: user, days, forceRefresh: true, signal })
      if (run !== runRef.current) return
      const all = await fetchActivity({ room: chatRoom, username: user, cacheOnly: true, allCached: true, signal })
      if (run !== runRef.current) return
      applyActivities(user, all.activities)
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError' || run !== runRef.current) return
      if (err instanceof PartialActivityError) {
        setError('TradingView hat den Abruf unterbrochen; die geladenen Tage sind gespeichert. „Frisch laden“ füllt die Lücken.')
      } else {
        setError(err instanceof Error ? err.message : 'Nachladen fehlgeschlagen')
      }
    } finally {
      if (poll) clearInterval(poll)
      if (run === runRef.current) setRefreshing(false)
    }
  }, [applyActivities])

  const lookup = useCallback(async (userInput: string, chatRoom: string) => {
    const user = normalizeUsername(userInput)
    if (!user) return

    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    const run = ++runRef.current

    setLoading(true)
    setError(null)
    setActivities([])
    setMessages([])
    setNetwork(null)
    setSelectedDate(null)
    setAvatar(null)
    setActiveUser(user)
    setActiveRoom(chatRoom)
    syncUrl(user, chatRoom)

    void fetchAvatar(user, abort.signal).then(url => {
      if (run === runRef.current) setAvatar(url)
    })

    void fetch(`/newspaper/people/api/network?username=${encodeURIComponent(user)}&room=${encodeURIComponent(chatRoom)}`, { signal: abort.signal })
      .then(response => (response.ok ? response.json() : null))
      .then((data: NetworkResponse | null) => {
        if (run === runRef.current && data) setNetwork(data)
      })
      .catch(() => undefined)

    try {
      const cached = await fetchActivity({ room: chatRoom, username: user, cacheOnly: true, allCached: true, signal: abort.signal })
      if (run !== runRef.current) return
      applyActivities(user, cached.activities)
      setLoading(false)
      await refresh(user, chatRoom, REFRESH_DAYS, run, abort.signal)
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError' || run !== runRef.current) return
      setError(err instanceof Error ? err.message : 'Abruf fehlgeschlagen')
      setLoading(false)
    }
  }, [applyActivities, refresh, syncUrl])

  useEffect(() => {
    if (autoStarted.current) return
    autoStarted.current = true
    if (username) void lookup(username, room)
  }, [username, room, lookup])

  const days = useMemo<ActivityDay[]>(
    () => activities.map(bucket => ({ date: bucket.date, count: bucket.count || bucket.messages?.length || 0 })),
    [activities]
  )
  const activeDays = useMemo(() => days.filter(day => day.count > 0).length, [days])
  const span = useMemo(() => {
    const dated = days.map(day => day.date).sort()
    return dated.length ? { from: dated[0], to: dated[dated.length - 1] } : null
  }, [days])

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

  const graph = useMemo(() => {
    if (!activeUser) return null
    const own: RawEdge[] = []
    for (const message of messages) {
      for (const edge of edgesFromMessage(activeUser, message)) own.push({ ...edge, weight: 1 })
    }
    const live: RawEdge[] = (network?.edges ?? []).map(edge => ({
      from: edge.from,
      to: edge.to,
      kind: edge.kind === 'both' ? 'quote' : edge.kind,
      weight: edge.weight
    }))
    const merged = mergeEdges([...own, ...live])
    // Edges the live route saw twice with different kinds are already "both";
    // re-apply that so mixed relationships keep their colour.
    for (const edge of network?.edges ?? []) {
      if (edge.kind !== 'both') continue
      const target = merged.find(m => m.from.toLowerCase() === edge.from.toLowerCase() && m.to.toLowerCase() === edge.to.toLowerCase())
      if (target) target.kind = 'both'
    }
    const archive = new Set<string>([activeUser.toLowerCase(), ...(network?.users ?? []).map(user => user.toLowerCase())])
    return egoGraph(network?.username ?? activeUser, merged, archive)
  }, [activeUser, messages, network])

  const started = Boolean(activeUser)
  const roomLabel = ROOM_OPTIONS.find(option => option.id === activeRoom)?.label ?? activeRoom

  const selectPerson = (name: string) => {
    const next = normalizeUsername(name)
    if (!next || next.toLowerCase() === activeUser.toLowerCase()) return
    setUsername(next)
    void lookup(next, activeRoom)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />
      <ToolHeader section="Netzwerk" subtitle="Wer spricht mit wem: Aktivität, Tage und Beziehungen eines Nutzers" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <LookupForm
          username={username}
          room={room}
          onUsernameChange={value => setUsername(normalizeUsername(value))}
          onRoomChange={setRoom}
          onSubmit={() => void lookup(username, room)}
          loading={loading}
          submitLabel="Nachschlagen"
        />

        {!started && (
          <div className="rounded-sm border border-dashed border-primary/20 bg-card/20 px-6 py-16 text-center space-y-2">
            <p className="font-headline text-sm uppercase tracking-wider text-foreground/80">Wen möchten Sie kennenlernen?</p>
            <p className="text-xs text-muted-foreground font-body max-w-md mx-auto">
              Öffentlicher TradingView-Benutzername genügt. Sie sehen Aktivität nach Tagen, die Nachrichten eines Tages
              und wen die Person zitiert oder erwähnt und von wem sie zitiert wird.
            </p>
          </div>
        )}

        {started && (
          <>
            <section className="glass-card-gold glass-grain rounded-sm border border-primary/20 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-4">
                <ProfilePic username={activeUser} src={avatar} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-masthead text-2xl sm:text-3xl gold-text leading-tight truncate">{activeUser}</h2>
                  <p className="text-xs text-muted-foreground font-body">{roomLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatChip icon={<MessageSquare className="h-3.5 w-3.5" />} label="Msgs" value={messages.length.toLocaleString('de-DE')} />
                  <StatChip icon={<CalendarDays className="h-3.5 w-3.5" />} label="aktive Tage" value={activeDays.toLocaleString('de-DE')} />
                  <StatChip icon={<Users className="h-3.5 w-3.5" />} label="Kontakte" value={String(Math.max((graph?.nodes.length ?? 1) - 1, 0))} />
                  {span && (
                    <span className="text-[11px] font-mono text-muted-foreground/70">
                      {span.from} → {span.to}
                    </span>
                  )}
                </div>
              </div>
              {error && (
                <div className="mt-4 rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 font-body">
                  {error}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="space-y-6 xl:col-span-7">
                <section className="glass-card glass-grain rounded-sm border border-primary/15 p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-headline text-sm font-semibold uppercase tracking-wider">Aktivität</h3>
                    <span className="text-[11px] text-muted-foreground font-body">
                      {loading ? 'Lade Cache…' : refreshing ? 'Hole frische Tage…' : 'Tag anklicken öffnet die Nachrichten'}
                    </span>
                  </div>
                  {days.length === 0 && !loading ? (
                    <p className="py-8 text-center text-xs text-muted-foreground font-body">
                      Noch keine gespeicherten Tage. Die letzten {REFRESH_DAYS} Tage werden gerade geladen.
                    </p>
                  ) : (
                    <GithubHeatmap days={days} selectedDate={selectedDate} onDateSelect={setSelectedDate} loadDay={loadDay} />
                  )}
                </section>

                {graph && (
                  <EgoGraph
                    center={network?.username ?? activeUser}
                    nodes={graph.nodes}
                    edges={graph.edges}
                    onSelect={selectPerson}
                    title="Netzwerk · Zitate und Erwähnungen"
                    emptyHint={
                      network
                        ? 'Keine Zitate oder Erwähnungen gefunden. Im Live-Raum (Bitcoin DE) füllt sich das Netzwerk aus dem Chat-Archiv.'
                        : 'Netzwerk wird geladen…'
                    }
                  />
                )}
              </div>

              <div className="xl:col-span-5">
                <MessageList
                  username={activeUser}
                  messages={messages}
                  loading={loading}
                  refreshing={refreshing}
                  selectedDate={selectedDate}
                  onRefresh={() => {
                    const run = runRef.current
                    const signal = abortRef.current?.signal ?? new AbortController().signal
                    void refresh(activeUser, activeRoom, DEEP_REFRESH_DAYS, run, signal)
                  }}
                  onExportJson={() =>
                    downloadJson(`${activeUser.toLowerCase()}-chat.json`, listedToJson({ username: activeUser, room: activeRoom, messages }))
                  }
                  onExportMd={() =>
                    downloadText(`${activeUser.toLowerCase()}-chat.md`, listedToMarkdown(activeUser, messages), 'text/markdown; charset=utf-8')
                  }
                  onMention={selectPerson}
                  emptyHint={`Noch keine Nachrichten gespeichert. „Frisch laden“ holt bis zu ${DEEP_REFRESH_DAYS} Tage aus dem TradingView-Archiv.`}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
