import type { EdgeKind, QuoteBlock, RecoveredMessage } from './types'

const QUOTE_RE = /\[quote="([^"]+)"\]([\s\S]*?)\[\/quote\]/gi
const MENTION_RE = /@([A-Za-z0-9_]+)/g
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

export function extractQuotes(text: string): QuoteBlock[] {
  const quotes: QuoteBlock[] = []
  const re = new RegExp(QUOTE_RE)
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    quotes.push({ username: match[1].trim(), content: match[2].trim() })
  }
  return quotes
}

export function extractMentions(text: string, self?: string): string[] {
  const names = new Set<string>()
  const re = new RegExp(MENTION_RE)
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const name = match[1]
    if (self && name.toLowerCase() === self.toLowerCase()) continue
    names.add(name)
  }
  return Array.from(names)
}

export function classifyUrls(text: string) {
  const ideaUrls: string[] = []
  const chartUrls: string[] = []
  const externalUrls: string[] = []
  const seen = new Set<string>()

  const re = new RegExp(URL_RE)
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const url = match[0].replace(/[.,;:]+$/, '')
    if (seen.has(url)) continue
    seen.add(url)

    if (/tradingview\.com\/x\//i.test(url) || /s3\.tradingview\.com\/snapshots\//i.test(url)) {
      ideaUrls.push(url)
    } else if (/tradingview\.com\/chart\//i.test(url)) {
      chartUrls.push(url)
    } else {
      externalUrls.push(url)
    }
  }

  return { ideaUrls, chartUrls, externalUrls }
}

export function enrichMessage(input: {
  id: string
  text: string
  time: string
  permalink?: string
  author?: string
}): RecoveredMessage {
  const quotes = extractQuotes(input.text)
  const mentions = extractMentions(input.text, input.author)
  const urls = classifyUrls(input.text)
  return {
    id: input.id,
    text: input.text,
    time: input.time,
    permalink: input.permalink,
    quotes,
    mentions,
    ...urls
  }
}

export function usernamesFromMessage(message: RecoveredMessage): Array<{
  username: string
  source: 'quote' | 'mention'
}> {
  const out: Array<{ username: string; source: 'quote' | 'mention' }> = []
  for (const quote of message.quotes) {
    if (quote.username) out.push({ username: quote.username, source: 'quote' })
  }
  for (const mention of message.mentions) {
    out.push({ username: mention, source: 'mention' })
  }
  return out
}

export function edgesFromMessage(
  author: string,
  message: RecoveredMessage
): Array<{ from: string; to: string; kind: EdgeKind }> {
  const edges: Array<{ from: string; to: string; kind: EdgeKind }> = []
  for (const quote of message.quotes) {
    if (quote.username && quote.username.toLowerCase() !== author.toLowerCase()) {
      edges.push({ from: author, to: quote.username, kind: 'quote' })
    }
  }
  for (const mention of message.mentions) {
    if (mention.toLowerCase() !== author.toLowerCase()) {
      edges.push({ from: author, to: mention, kind: 'mention' })
    }
  }
  return edges
}