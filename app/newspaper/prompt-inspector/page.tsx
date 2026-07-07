'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  Layers,
  RefreshCw,
  Hash,
  FileText,
  Cpu,
  AlertTriangle
} from 'lucide-react'

type PromptBlockGroup = 'system' | 'context' | 'input' | 'task' | 'contract'

interface PromptBlockMeta {
  label: string
  value: string
}

interface PromptBlock {
  id: string
  group: PromptBlockGroup
  groupLabel: string
  title: string
  description: string
  active: boolean
  cadence: string
  refreshedBy: string[]
  body: string
  charCount: number
  tokenEstimate: number
  meta: PromptBlockMeta[]
}

interface PromptPreview {
  meta: {
    anchorDate: string
    view: string
    dayRange: number
    windowDays: number
    dateKeys: string[]
    messageCount: number
    sampledDays: number
    generatedAt: string
    model: string
  }
  blocks: PromptBlock[]
  totals: {
    tokenEstimate: number
    activeTokenEstimate: number
    charCount: number
  }
}

const GROUP_ORDER: PromptBlockGroup[] = [
  'system',
  'context',
  'input',
  'task',
  'contract'
]

const GROUP_LABELS: Record<PromptBlockGroup, string> = {
  system: 'System & Redaktion',
  context: 'Ausgabe-Kontext',
  input: 'Globaler Kontext (Chat + Markt)',
  task: 'Auftrag',
  contract: 'Output-Contract'
}

const VIEW_OPTIONS = [
  { value: 'edition', label: 'Tri-Edition (Mega-Call)' },
  { value: 'ticker', label: 'Widget: Ticker' },
  { value: 'timeline', label: 'Widget: Timeline' },
  { value: 'fearGreed', label: 'Widget: Fear & Greed' },
  { value: 'traderLeaderboard', label: 'Widget: Leaderboard' }
] as const

const REFRESH_LABELS: Record<string, string> = {
  'mega-generation': 'Mega-Generierung',
  'widget:ticker': 'Widget: Ticker',
  'widget:timeline': 'Widget: Timeline',
  'widget:fearGreed': 'Widget: Fear & Greed',
  'widget:traderLeaderboard': 'Widget: Leaderboard'
}

function formatTokens(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

function todayKey(): string {
  return new Date().toLocaleDateString('sv-SE')
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Kopiert' : label}
    </button>
  )
}

function SummaryStat({
  icon,
  label,
  value,
  hint
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-primary/15 bg-card/50 px-4 py-3">
      <div className="text-primary/70">{icon}</div>
      <div className="min-w-0">
        <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
        {hint && <div className="truncate text-[10px] text-muted-foreground/50">{hint}</div>}
      </div>
    </div>
  )
}

function BlockCard({
  block,
  maxTokens,
  expanded,
  onToggle
}: {
  block: PromptBlock
  maxTokens: number
  expanded: boolean
  onToggle: () => void
}) {
  const barWidth = maxTokens > 0 ? Math.max(2, Math.round((block.tokenEstimate / maxTokens) * 100)) : 0

  return (
    <div
      className={`relative rounded-sm border transition-colors ${
        block.active
          ? 'border-primary/20 bg-card/50'
          : 'border-muted/30 bg-card/20 opacity-70'
      }`}
    >
      {/* Timeline rail dot */}
      <span
        className={`absolute -left-[25px] top-5 hidden h-2.5 w-2.5 rounded-full ring-4 ring-background sm:block ${
          block.active ? 'bg-primary' : 'bg-muted-foreground/40'
        }`}
      />

      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <span className="mt-0.5 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-headline text-sm font-semibold text-foreground">{block.title}</span>
            {block.active ? (
              <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                aktiv
              </span>
            ) : (
              <span className="rounded-sm bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                inaktiv
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground/80">{block.description}</p>

          {/* Token bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/30">
              <div
                className={`h-full rounded-full ${block.active ? 'bg-primary/70' : 'bg-muted-foreground/40'}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              ≈{formatTokens(block.tokenEstimate)} tok
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-sm border border-primary/15 bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
              <RefreshCw className="h-2.5 w-2.5 text-primary/60" />
              {block.cadence}
            </span>
            {block.refreshedBy.map(source => (
              <span
                key={source}
                className="rounded-sm border border-primary/15 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary/80"
              >
                {REFRESH_LABELS[source] ?? source}
              </span>
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-primary/10 px-4 py-3">
          {block.meta.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {block.meta.map(item => (
                <span
                  key={`${item.label}-${item.value}`}
                  className="rounded-sm border border-primary/15 bg-background/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                >
                  <span className="text-muted-foreground/60">{item.label}:</span> {item.value}
                </span>
              ))}
            </div>
          )}

          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
              {block.charCount.toLocaleString('de-DE')} Zeichen · ≈{formatTokens(block.tokenEstimate)} Tokens
            </span>
            <CopyButton text={block.body} label="Block kopieren" />
          </div>

          <pre className="max-h-[420px] overflow-auto rounded-sm border border-primary/10 bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground/90 whitespace-pre-wrap break-words">
            {block.body}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function PromptInspectorPage() {
  const [date, setDate] = useState('')
  const [view, setView] = useState<string>('edition')
  const [dayRange, setDayRange] = useState(1)
  const [preview, setPreview] = useState<PromptPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ date, view, dayRange: String(dayRange) })
      const response = await fetch(`/newspaper/api/prompt-preview?${params.toString()}`)
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json?.error || 'Prompt-Vorschau fehlgeschlagen')
      }
      setPreview(json as PromptPreview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [date, view, dayRange])

  useEffect(() => {
    // Read current date only on the client (avoids new Date() during render).
    setDate(todayKey())
    fetchPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maxTokens = useMemo(
    () => (preview ? Math.max(...preview.blocks.map(block => block.tokenEstimate), 1) : 1),
    [preview]
  )

  const fullPrompt = useMemo(
    () => (preview ? preview.blocks.map(block => block.body).join('\n\n') : ''),
    [preview]
  )

  const allExpanded = preview ? expanded.size === preview.blocks.length : false

  const toggleBlock = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (!preview) return
    setExpanded(prev => (prev.size === preview.blocks.length ? new Set() : new Set(preview.blocks.map(b => b.id))))
  }, [preview])

  return (
    <main className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 border-b border-primary/15 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/newspaper"
              className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zur Newspaper
            </Link>
            <h1 className="flex items-center gap-2 font-masthead text-3xl gold-text tracking-wide sm:text-4xl">
              <Layers className="h-7 w-7 text-primary/70" />
              Prompt Inspector
            </h1>
            <p className="mt-1 text-sm text-muted-foreground/80">
              Was genau an die AI gesendet wird — Block fuer Block, mit Token-Schaetzung.
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Datum
              <input
                type="date"
                value={date}
                onChange={event => setDate(event.target.value)}
                className="rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1.5 text-sm font-mono text-foreground focus:border-primary/50 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Ansicht
              <select
                value={view}
                onChange={event => setView(event.target.value)}
                className="rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1.5 text-sm font-mono text-foreground focus:border-primary/50 focus:outline-none"
              >
                {VIEW_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {(view === 'ticker' || view === 'timeline') && (
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                Zeitraum
                <select
                  value={dayRange}
                  onChange={event => setDayRange(Number(event.target.value))}
                  className="rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1.5 text-sm font-mono text-foreground focus:border-primary/50 focus:outline-none"
                >
                  <option value={1}>1 Tag</option>
                  <option value={3}>3 Tage</option>
                  <option value={7}>7 Tage</option>
                </select>
              </label>
            )}
            <button
              onClick={fetchPreview}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-sm border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Laden
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-sm border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !preview && (
          <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">
            Prompt wird zusammengebaut…
          </div>
        )}

        {preview && (
          <>
            {/* Summary */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat
                icon={<Hash className="h-5 w-5" />}
                label="Tokens (aktiv)"
                value={`≈${formatTokens(preview.totals.activeTokenEstimate)}`}
                hint={`von ≈${formatTokens(preview.totals.tokenEstimate)} gesamt`}
              />
              <SummaryStat
                icon={<FileText className="h-5 w-5" />}
                label="Zeichen"
                value={preview.totals.charCount.toLocaleString('de-DE')}
              />
              <SummaryStat
                icon={<Layers className="h-5 w-5" />}
                label="Bloecke aktiv"
                value={`${preview.blocks.filter(b => b.active).length}/${preview.blocks.length}`}
              />
              <SummaryStat
                icon={<Cpu className="h-5 w-5" />}
                label="Modell"
                value={preview.meta.model}
                hint={`${preview.meta.windowDays} Tage Kontext · ${preview.meta.messageCount.toLocaleString('de-DE')} Nachrichten${preview.meta.sampledDays > 0 ? ` · ${preview.meta.sampledDays} Tage ausgeduennt` : ''}`}
              />
            </div>

            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground/60">
                Schaetzung (~4 Zeichen/Token). Echte Nutzung steht nach der Generierung im AI-Usage-Block der Ausgabe.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAll}
                  className="rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  {allExpanded ? 'Alle einklappen' : 'Alle ausklappen'}
                </button>
                <CopyButton text={fullPrompt} label="Ganzen Prompt kopieren" />
              </div>
            </div>

            {/* Grouped timeline */}
            <div className="space-y-8">
              {GROUP_ORDER.map(group => {
                const blocks = preview.blocks.filter(block => block.group === group)
                if (blocks.length === 0) return null
                const groupTokens = blocks.reduce((sum, b) => sum + b.tokenEstimate, 0)
                return (
                  <section key={group}>
                    <div className="mb-3 flex items-center gap-3">
                      <h2 className="font-headline text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
                        {GROUP_LABELS[group]}
                      </h2>
                      <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        ≈{formatTokens(groupTokens)} tok
                      </span>
                    </div>
                    <div className="space-y-2.5 sm:border-l sm:border-primary/10 sm:pl-6">
                      {blocks.map(block => (
                        <BlockCard
                          key={block.id}
                          block={block}
                          maxTokens={maxTokens}
                          expanded={expanded.has(block.id)}
                          onToggle={() => toggleBlock(block.id)}
                        />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
