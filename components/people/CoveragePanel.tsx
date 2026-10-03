'use client'

/**
 * How much of a person's history we hold, per year, and a smart gap fill.
 *
 * Bars: gold = days with messages, grey = checked without messages,
 * empty = never fetched. "Lücken füllen" fetches never-checked days in
 * chunks through /api/chat-activity, least-covered years first and newest
 * days first within a year. TradingView currently answers 404 for its
 * chat history; the route then writes nothing and reports
 * `historyUnavailable`, and the fill stops immediately with a notice.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { DownloadCloud, Loader2, Square } from 'lucide-react'
import type { CoverageResponse, CoverageYear } from '@/lib/people/types'

const CHUNK = 10

/** Least-covered years first, newest year first on ties; newest days first inside a year. */
export function fillOrder(coverage: Pick<CoverageResponse, 'years' | 'missing'>): string[] {
  const ratio = new Map(coverage.years.map(y => [y.year, y.days ? y.checked / y.days : 1]))
  const byYear = new Map<number, string[]>()
  for (const day of coverage.missing) {
    const year = Number(day.slice(0, 4))
    byYear.set(year, [...(byYear.get(year) ?? []), day])
  }
  return Array.from(byYear.keys())
    .sort((a, b) => (ratio.get(a) ?? 1) - (ratio.get(b) ?? 1) || b - a)
    .flatMap(year => byYear.get(year)!.sort().reverse())
}

function YearBar({ year }: { year: CoverageYear }) {
  const pct = (n: number) => `${(n / Math.max(year.days, 1)) * 100}%`
  const share = Math.round((year.checked / Math.max(year.days, 1)) * 100)
  return (
    <div className="grid grid-cols-[3rem_1fr_7.5rem] items-center gap-2 text-[11px]">
      <span className="font-mono tabular-nums text-foreground">{year.year}</span>
      <div
        className="flex h-2.5 overflow-hidden rounded-sm border border-border/50 bg-[repeating-linear-gradient(135deg,transparent_0_4px,hsl(var(--muted)/0.5)_4px_5px)]"
        title={`${year.checked} von ${year.days} Tagen geprüft, ${year.withMessages} mit Nachrichten`}
      >
        <div className="h-full bg-primary" style={{ width: pct(year.withMessages) }} />
        <div className="h-full bg-muted-foreground/40" style={{ width: pct(year.checked - year.withMessages) }} />
      </div>
      <span className="text-right font-mono tabular-nums text-muted-foreground">
        {share}% · {year.days - year.checked} fehlen
      </span>
    </div>
  )
}

export function CoveragePanel({
  username,
  room
}: {
  username: string
  room: string
}) {
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const stopRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(
      `/newspaper/people/api/coverage?username=${encodeURIComponent(username)}&room=${encodeURIComponent(room)}`
    )
    if (response.ok) setCoverage(await response.json())
  }, [username, room])

  useEffect(() => {
    setCoverage(null)
    setNotice(null)
    void load()
    return () => stopRef.current?.abort()
  }, [load])

  async function fill() {
    if (!coverage) return
    const order = fillOrder(coverage)
    const abort = new AbortController()
    stopRef.current = abort
    setRunning(true)
    setNotice(null)
    setDone(0)
    setTotal(order.length)
    let found = 0
    try {
      for (let i = 0; i < order.length; i += CHUNK) {
        const dates = order.slice(i, i + CHUNK)
        const response = await fetch('/api/chat-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, username, dates }),
          signal: abort.signal
        })
        const data = await response.json().catch(() => null)
        if (data?.historyUnavailable) {
          setNotice(
            'TradingView liefert die Chat-Historie derzeit nicht aus (404). Es wurde nichts überschrieben; der Knopf funktioniert wieder, sobald die Historie zurück ist.'
          )
          break
        }
        if (!response.ok) {
          setNotice(data?.error ?? `Abruf unterbrochen (${response.status}). Bereits geladene Tage bleiben gespeichert.`)
          break
        }
        found += (data?.activities ?? []).filter((a: { count: number; fromCache?: boolean }) => a.count > 0 && !a.fromCache).length
        setDone(Math.min(i + CHUNK, order.length))
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') setNotice('Abruf fehlgeschlagen. Bereits geladene Tage bleiben gespeichert.')
    } finally {
      setRunning(false)
      stopRef.current = null
      await load()
      if (found > 0) {
        // The room index is cached for ten minutes; say so instead of pretending it is instant.
        setNotice(current => current ?? `${found} neue Tage mit Nachrichten gespeichert. Netzwerk und Export zeigen sie nach der nächsten Index-Aktualisierung (≤ 10 Min.).`)
      }
    }
  }

  if (!coverage) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Abdeckung wird geprüft…
      </div>
    )
  }

  const days = coverage.years.reduce((sum, y) => sum + y.days, 0)
  const checked = coverage.years.reduce((sum, y) => sum + y.checked, 0)
  const withMessages = coverage.years.reduce((sum, y) => sum + y.withMessages, 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Datenbestand</div>
          <div className="text-sm">
            <span className="font-mono tabular-nums text-foreground">{checked.toLocaleString('de-DE')}</span>
            <span className="text-muted-foreground"> von {days.toLocaleString('de-DE')} Tagen geprüft · </span>
            <span className="font-mono tabular-nums text-primary">{withMessages.toLocaleString('de-DE')}</span>
            <span className="text-muted-foreground"> mit Nachrichten · seit {coverage.from.split('-').reverse().join('.')}</span>
          </div>
        </div>
        {running ? (
          <button
            type="button"
            onClick={() => stopRef.current?.abort()}
            className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 px-3 py-1.5 text-[11px] font-headline uppercase tracking-wide text-primary hover:bg-primary/10"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {done.toLocaleString('de-DE')} / {total.toLocaleString('de-DE')} · <Square className="h-3 w-3" /> Stopp
          </button>
        ) : (
          <button
            type="button"
            onClick={fill}
            disabled={coverage.missing.length === 0}
            title="Fehlende Tage bei TradingView nachladen: am schlechtesten abgedeckte Jahre zuerst"
            className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-headline uppercase tracking-wide text-primary hover:bg-primary/20 disabled:opacity-40"
          >
            <DownloadCloud className="h-3.5 w-3.5" />
            Lücken füllen · {coverage.missing.length.toLocaleString('de-DE')} Tage
          </button>
        )}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-x-8">
        {coverage.years.map(year => (
          <YearBar key={year.year} year={year} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-primary" /> Tage mit Nachrichten</span>
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-muted-foreground/40" /> geprüft, still</span>
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm border border-border/60" /> nie abgerufen</span>
      </div>
      {notice && (
        <p role="status" className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  )
}
