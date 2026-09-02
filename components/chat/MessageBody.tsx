'use client'

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
      <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
        <RichText text={text} onMention={onMention} />
      </p>
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
          </blockquote>
        ) : (
          <p key={i} className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            <RichText text={block.content} onMention={onMention} />
          </p>
        )
      )}
    </div>
  )
}
