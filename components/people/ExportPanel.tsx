'use client'

/**
 * Export of one person's stored history as LLM-ready JSON
 * (lib/people/llm-export.ts). Download goes straight to the server route
 * (attachment, application/json, nosniff), so nothing is built in the
 * browser; copy fetches the same body into the clipboard.
 */

import { useMemo, useState } from 'react'
import { Check, Copy, Download, Loader2 } from 'lucide-react'
import { addDaysToDateKey } from '@/app/newspaper/lib/timezone'
import type { YearSummary } from '@/lib/people/types'

const TEN_YEARS = 3650

type Preset = { id: string; label: string; from: string; to: string }

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
}

export function ExportPanel({
  username,
  room,
  years,
  days
}: {
  username: string
  room: string
  years: YearSummary[]
  days: Array<{ date: string; count: number }>
}) {
  const end = today()
  const presets = useMemo<Preset[]>(
    () => [
      { id: 'all', label: '10 Jahre · alles', from: addDaysToDateKey(end, 1 - TEN_YEARS), to: end },
      { id: '365', label: '12 Monate', from: addDaysToDateKey(end, -364), to: end },
      { id: '30', label: '30 Tage', from: addDaysToDateKey(end, -29), to: end },
      ...years
        .filter(y => y.messages > 0)
        .map(y => ({ id: String(y.year), label: String(y.year), from: `${y.year}-01-01`, to: `${y.year}-12-31` < end ? `${y.year}-12-31` : end }))
    ],
    [end, years]
  )
  const [selected, setSelected] = useState('all')
  const [btc, setBtc] = useState(true)
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const preset = presets.find(p => p.id === selected) ?? presets[0]

  const count = useMemo(
    () => days.reduce((sum, day) => (day.date >= preset.from && day.date <= preset.to ? sum + day.count : sum), 0),
    [days, preset]
  )
  // ~130 bytes of JSON per message on average (measured on real exports).
  const approxKb = Math.max(2, Math.round((count * 130) / 1024))

  const query = new URLSearchParams({ username, room, from: preset.from, to: preset.to, btc: btc ? '1' : '0' })
  const downloadHref = `/newspaper/people/api/export?${query}&download=1`

  async function copy() {
    setState('copying')
    try {
      const response = await fetch(`/newspaper/people/api/export?${query}`)
      if (!response.ok) throw new Error()
      await navigator.clipboard.writeText(await response.text())
      setState('copied')
      window.setTimeout(() => setState('idle'), 2500)
    } catch {
      setState('error')
    }
  }

  return (
    <section className="glass-card glass-grain rounded-sm border border-primary/15 p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-headline text-sm font-semibold uppercase tracking-wider">Export für KI-Analyse</h3>
        <p className="mt-1 text-[11px] text-muted-foreground font-body">
          Eine JSON-Datei: Erklärung der Felder, Statistik, Netzwerk, BTC-Tagesschluss und jede Nachricht mit
          Zeitstempel, Antwort-Kontext und Links. Direkt in ChatGPT, Claude &amp; Co. einfügbar.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Zeitraum">
        {presets.map(p => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === selected}
            onClick={() => {
              setSelected(p.id)
              setState('idle')
            }}
            className={`rounded-sm border px-2 py-1 text-[11px] font-mono transition-colors ${
              p.id === selected
                ? 'border-primary/60 bg-primary/15 text-primary'
                : 'border-border/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span className="font-mono tabular-nums">
          {preset.from} → {preset.to}
        </span>
        <span className="font-mono tabular-nums">
          {count.toLocaleString('de-DE')} Nachr. · ≈{approxKb >= 1024 ? `${(approxKb / 1024).toFixed(1)} MB` : `${approxKb} KB`}
        </span>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <input type="checkbox" checked={btc} onChange={event => setBtc(event.target.checked)} className="accent-[hsl(var(--primary))]" />
        BTC/USDT-Tagesschluss für aktive Tage einschließen
      </label>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={count === 0 || state === 'copying'}
          className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-primary/40 px-3 py-2 text-xs font-headline uppercase tracking-wide text-primary hover:bg-primary/10 disabled:opacity-40"
        >
          {state === 'copying' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {state === 'copied' ? 'Kopiert' : 'Kopieren'}
        </button>
        <a
          href={count === 0 ? undefined : downloadHref}
          aria-disabled={count === 0}
          className={`inline-flex items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-headline uppercase tracking-wide text-primary-foreground hover:bg-primary/90 ${
            count === 0 ? 'pointer-events-none opacity-40' : ''
          }`}
        >
          <Download className="h-3.5 w-3.5" /> JSON
        </a>
      </div>
      {state === 'error' && (
        <p role="status" className="text-[11px] text-red-400">
          Kopieren nicht möglich (Zwischenablage blockiert?). Bitte die JSON-Datei herunterladen.
        </p>
      )}

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">Aufbau einer Nachricht</summary>
        <pre className="mt-2 overflow-x-auto rounded-sm bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">{`{"ts":"2025-06-10T14:03:11Z",
 "day":"2025-06-10",
 "text":"Eigene Worte, ohne Zitat",
 "replyTo":[{"user":"kultr","text":"…"}],
 "mentions":["SwingMann"],
 "links":["https://de.tradingview.com/chart/…"]}`}</pre>
      </details>
    </section>
  )
}
