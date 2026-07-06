'use client'

/**
 * page.tsx (/newspaper/v2/prompt-inspector)
 *
 * Shows BOTH pipeline stages without spending tokens:
 *   Stage 1 — the daily-digest prompt for a selectable day
 *   Stage 2 — the full monthly composition prompt (global context)
 * plus digest coverage of the last 30 days.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  FileText,
  Hash,
  Layers,
  RefreshCw
} from 'lucide-react'

interface PromptBlockMeta {
  label: string
  value: string
}

interface PromptBlock {
  id: string
  group: string
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

interface StagePayload {
  blocks: PromptBlock[]
  totals: {
    tokenEstimate: number
    activeTokenEstimate: number
    charCount: number
  }
}

interface PreviewResponse {
  meta: {
    issueDate: string
    rangeStart: string
    rangeEnd: string
    days: number
    digestDate: string
    model: string
    generatedAt: string
    counts: {
      digests: number
      digestsMissing: number
      recentMessages: number
      candles: number
      leaderboardMessages: number
    }
  }
  stage1: StagePayload
  stage2: StagePayload
  digestCoverage: Array<{
    date: string
    hasDigest: boolean
    messageCount: number
    uniqueUsers: number
    updatedAt: string | null
  }>
}

type Stage = 'stage1' | 'stage2'

function formatTokens(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
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

function SummaryStat({ icon, label, value, hint }: {
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

function BlockCard({ block, maxTokens, expanded, onToggle }: {
  block: PromptBlock
  maxTokens: number
  expanded: boolean
  onToggle: () => void
}) {
  const barWidth = maxTokens > 0 ? Math.max(2, Math.round((block.tokenEstimate / maxTokens) * 100)) : 0

  return (
    <div className="relative rounded-sm border border-primary/20 bg-card/50">
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="mt-0.5 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-headline text-sm font-semibold text-foreground">{block.title}</span>
            <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
              {block.groupLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground/80">{block.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/30">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${barWidth}%` }} />
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
          <pre className="max-h-[440px] overflow-auto rounded-sm border border-primary/10 bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground/90 whitespace-pre-wrap break-words">
            {block.body}
          </pre>
        </div>
      )}
    </div>
  )
}

function DigestCoverageGrid({ coverage, selected, onSelect }: {
  coverage: PreviewResponse['digestCoverage']
  selected: string
  onSelect: (date: string) => void
}) {
  return (
    <div className="rounded-sm border border-primary/15 bg-card/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-headline text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
          Digest-Abdeckung (Stage 1 Cache)
        </h3>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {coverage.filter(day => day.hasDigest).length}/{coverage.length} Tage
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
        {coverage.map(day => (
          <button
            key={day.date}
            onClick={() => onSelect(day.date)}
            title={`${day.date} · ${day.messageCount.toLocaleString('de-DE')} Nachrichten · ${day.hasDigest ? 'Digest vorhanden' : 'kein Digest'}`}
            className={`rounded-sm border px-1 py-1.5 text-center transition-colors ${
              selected === day.date
                ? 'border-primary bg-primary/20'
                : day.hasDigest
                  ? 'border-emerald-500/30 bg-emerald-500/10 hover:border-primary/50'
                  : 'border-muted/40 bg-muted/10 hover:border-primary/40'
            }`}
          >
            <span className="block font-mono text-[9px] text-muted-foreground">
              {day.date.slice(8)}.{day.date.slice(5, 7)}
            </span>
            <span className={`block text-[8px] ${day.hasDigest ? 'text-emerald-400' : 'text-muted-foreground/40'}`}>
              {day.hasDigest ? '●' : '○'}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/50">
        Tag anklicken, um dessen Stage-1-Digest-Prompt zu laden.
      </p>
    </div>
  )
}

export default function V2PromptInspectorPage() {
  const [stage, setStage] = useState<Stage>('stage2')
  const [digestDate, setDigestDate] = useState<string>('')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchPreview = useCallback(async (date?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (date) params.set('digestDate', date)
      const response = await fetch(`/newspaper/v2/api/prompt-preview?${params.toString()}`)
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json?.error || 'Prompt-Vorschau fehlgeschlagen')
      }
      setPreview(json as PreviewResponse)
      setDigestDate((json as PreviewResponse).meta.digestDate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeStage = preview ? preview[stage] : null

  const maxTokens = useMemo(
    () => (activeStage ? Math.max(...activeStage.blocks.map(block => block.tokenEstimate), 1) : 1),
    [activeStage]
  )

  const fullPrompt = useMemo(
    () => (activeStage ? activeStage.blocks.map(block => block.body).join('\n\n') : ''),
    [activeStage]
  )

  const toggleBlock = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectDigestDay = useCallback((date: string) => {
    setStage('stage1')
    setDigestDate(date)
    void fetchPreview(date)
  }, [fetchPreview])

  return (
    <main className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 border-b border-primary/15 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/newspaper/v2"
              className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zur Monatsausgabe
            </Link>
            <h1 className="flex items-center gap-2 font-masthead text-3xl gold-text tracking-wide sm:text-4xl">
              <Layers className="h-7 w-7 text-primary/70" />
              Prompt Inspector v2
            </h1>
            <p className="mt-1 text-sm text-muted-foreground/80">
              Beide Pipeline-Stufen im Detail — Tagesdigest und Monats-Komposition, Block für Block.
            </p>
          </div>

          <button
            onClick={() => fetchPreview(digestDate || undefined)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-sm border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Laden
          </button>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-sm border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !preview && (
          <div className="py-20 text-center text-sm text-muted-foreground animate-pulse">
            Prompts werden zusammengebaut… (30-Tage-Kontext, kann etwas dauern)
          </div>
        )}

        {preview && (
          <>
            {/* Stage switcher */}
            <div className="mb-5 flex rounded-sm border border-primary/20 bg-card/40 p-1">
              {([
                { id: 'stage1' as Stage, label: `Stage 1 — Tagesdigest (${preview.meta.digestDate})` },
                { id: 'stage2' as Stage, label: 'Stage 2 — Monatsausgabe' }
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setStage(tab.id); setExpanded(new Set()) }}
                  className={`flex-1 rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                    stage === tab.id
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Summary */}
            {activeStage && (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryStat
                  icon={<Hash className="h-5 w-5" />}
                  label="Tokens (geschätzt)"
                  value={`≈${formatTokens(activeStage.totals.tokenEstimate)}`}
                />
                <SummaryStat
                  icon={<FileText className="h-5 w-5" />}
                  label="Zeichen"
                  value={activeStage.totals.charCount.toLocaleString('de-DE')}
                />
                <SummaryStat
                  icon={<Layers className="h-5 w-5" />}
                  label="Blöcke"
                  value={String(activeStage.blocks.length)}
                  hint={stage === 'stage2'
                    ? `${preview.meta.counts.digests}/${preview.meta.days} Digests · ${preview.meta.counts.recentMessages.toLocaleString('de-DE')} Roh-Msgs`
                    : undefined}
                />
                <SummaryStat
                  icon={<Cpu className="h-5 w-5" />}
                  label="Modell"
                  value={preview.meta.model}
                  hint={`Ausgabe ${preview.meta.issueDate}`}
                />
              </div>
            )}

            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground/60">
                Schätzung (~4 Zeichen/Token). Kein Modell-Call — die Vorschau kostet keine Tokens.
              </p>
              <CopyButton text={fullPrompt} label="Ganzen Prompt kopieren" />
            </div>

            {/* Blocks */}
            {activeStage && (
              <div className="mb-8 space-y-2.5">
                {activeStage.blocks.map(block => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    maxTokens={maxTokens}
                    expanded={expanded.has(block.id)}
                    onToggle={() => toggleBlock(block.id)}
                  />
                ))}
              </div>
            )}

            {/* Digest coverage */}
            <DigestCoverageGrid
              coverage={preview.digestCoverage}
              selected={digestDate}
              onSelect={handleSelectDigestDay}
            />
          </>
        )}
      </div>
    </main>
  )
}
