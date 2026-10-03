'use client'

import { useState } from 'react'
import { ExternalLink, Maximize2, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { chartImageFor } from '@/lib/tv-chat/parse'

const EMOJI: Record<string, string> = {
  ':joy:': '😂',
  ':smile:': '😊',
  ':smiley:': '😃',
  ':grin:': '😁',
  ':wink:': '😉',
  ':sweat_smile:': '😅',
  ':laughing:': '😆',
  ':thumbsup:': '👍',
  ':+1:': '👍',
  ':thumbsdown:': '👎',
  ':heart:': '❤️',
  ':fire:': '🔥',
  ':rocket:': '🚀',
  ':poop:': '💩',
  ':thinking:': '🤔',
  ':cry:': '😢',
  ':sob:': '😭',
  ':sunglasses:': '😎',
  ':clap:': '👏',
  ':ok_hand:': '👌',
  ':wave:': '👋',
  ':eyes:': '👀'
}

function withEmoji(text: string) {
  return text.replace(/:[a-z0-9_+]+:/gi, token => EMOJI[token.toLowerCase()] || token)
}

function tokenize(text: string) {
  const re = /(@[A-Za-z0-9_]+|https?:\/\/[^\s<>"')\]]+)/g
  const parts: Array<{ type: 'text' | 'mention' | 'url'; value: string }> = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', value: text.slice(last, match.index) })
    }
    const raw = match[0].replace(/[.,;:]+$/, '')
    if (raw.startsWith('@')) parts.push({ type: 'mention', value: raw.slice(1) })
    else parts.push({ type: 'url', value: raw })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

function RichText({
  text,
  onMention
}: {
  text: string
  onMention?: (username: string) => void
}) {
  const parts = tokenize(withEmoji(text))
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'mention') {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onMention?.(part.value)}
              className="inline-flex items-baseline text-sky-400 hover:text-sky-300 font-medium"
            >
              @{part.value}
            </button>
          )
        }
        if (part.type === 'url') {
          return (
            <a
              key={i}
              href={part.value}
              target="_blank"
              rel="noreferrer"
              className="text-sky-400/90 hover:underline break-all"
            >
              {part.value.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          )
        }
        return <span key={i}>{part.value}</span>
      })}
    </>
  )
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

/** Chart snapshots and idea images linked in a text, rendered like the chat archive. */
function ChartPreviews({ text, compact = false }: { text: string; compact?: boolean }) {
  const seen = new Set<string>()
  const previews = (text.match(URL_RE) ?? [])
    .map(url => ({ url: url.replace(/[.,;:!?]+$/, ''), preview: chartImageFor(url) }))
    .filter((entry): entry is { url: string; preview: NonNullable<ReturnType<typeof chartImageFor>> } => {
      if (!entry.preview || seen.has(entry.preview.image)) return false
      seen.add(entry.preview.image)
      return true
    })
  if (!previews.length) return null
  return (
    <div className={`mt-2 grid gap-2 ${previews.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} ${compact ? 'max-w-xs' : 'max-w-lg'}`}>
      {previews.map(({ url, preview }) => (
        <ChartThumb key={preview.image} href={url} image={preview.image} kind={preview.kind} />
      ))}
    </div>
  )
}

function ChartThumb({ href, image, kind }: { href: string; image: string; kind: 'snapshot' | 'idea' }) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading')
  const [open, setOpen] = useState(false)
  if (state === 'failed') return null
  const src = `/api/image-proxy?url=${encodeURIComponent(image)}`
  const label = kind === 'idea' ? 'TradingView-Idee' : 'Chart-Snapshot'
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border border-border/60 bg-muted/30 text-left"
        title="Vergrößern"
      >
        {state === 'loading' && <div className="aspect-[16/9] animate-pulse bg-muted/40" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          loading="lazy"
          decoding="async"
          onLoad={() => setState('ok')}
          onError={() => setState('failed')}
          className={`w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] ${state === 'loading' ? 'absolute inset-0 opacity-0' : ''}`}
        />
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-sm bg-background/80 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-2.5 w-2.5" /> {kind === 'idea' ? 'Idee' : 'Chart'}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="max-h-[92vh] gap-3 border-primary/20 p-3 sm:max-w-[min(1400px,94vw)]">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <DialogDescription className="sr-only">Vorschau des verlinkten {label}s</DialogDescription>
          <div className="flex min-h-0 items-center justify-center overflow-auto rounded-md bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label} className="max-h-[78vh] w-auto max-w-full object-contain" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-muted-foreground">{href.replace(/^https?:\/\/(www\.)?/, '')}</span>
            <div className="flex gap-2">
              <DialogClose asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" /> Schließen
                </button>
              </DialogClose>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Auf TradingView ansehen <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function MessageBody({
  text,
  onMention
}: {
  text: string
  onMention?: (username: string) => void
}) {
  const quoteRe = /\[quote="([^"]+)"\]([\s\S]*?)\[\/quote\]/gi
  const blocks: Array<{ type: 'quote' | 'text'; username?: string; content: string }> = []
  let last = 0
  let match: RegExpExecArray | null
  const re = new RegExp(quoteRe)
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      const chunk = text.slice(last, match.index).trim()
      if (chunk) blocks.push({ type: 'text', content: chunk })
    }
    blocks.push({ type: 'quote', username: match[1], content: match[2].trim() })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    const chunk = text.slice(last).trim()
    if (chunk) blocks.push({ type: 'text', content: chunk })
  }
  if (blocks.length === 0) {
    return (
      <div>
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          <RichText text={text} onMention={onMention} />
        </p>
        <ChartPreviews text={text} />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, i) =>
        block.type === 'quote' ? (
          <blockquote
            key={i}
            className="border-l-2 border-sky-400/50 pl-3 py-1.5 bg-sky-500/5 rounded-r-md"
          >
            <button
              type="button"
              onClick={() => block.username && onMention?.(block.username)}
              className="text-[11px] font-medium text-sky-400 mb-0.5"
            >
              {block.username}
            </button>
            <div className="text-sm text-muted-foreground italic whitespace-pre-wrap">
              <RichText text={block.content} onMention={onMention} />
            </div>
            <ChartPreviews text={block.content} compact />
          </blockquote>
        ) : (
          <div key={i}>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              <RichText text={block.content} onMention={onMention} />
            </p>
            <ChartPreviews text={block.content} />
          </div>
        )
      )}
    </div>
  )
}
