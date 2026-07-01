import Image from 'next/image'
import { QuoteIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { imageProxySrc } from '../../_lib/api'

// TradingView emoji shortcodes → unicode. Defined at module scope so it is
// created once, not on every render.
const EMOJI_MAP: Record<string, string> = {
  ':thumbsup:': '👍', ':+1:': '👍', ':thumbsdown:': '👎', ':-1:': '👎',
  ':ok_hand:': '👌', ':ok:': '👌', ':v:': '✌️', ':hand:': '✋', ':raised_hand:': '✋',
  ':clap:': '👏', ':pray:': '🙏', ':smiley:': '😃', ':smile:': '😊', ':laughing:': '😆',
  ':satisfied:': '😆', ':joy:': '😂', ':sweat_smile:': '😅', ':grin:': '😁', ':wink:': '😉',
  ':neutral_face:': '😐', ':expressionless:': '😑', ':confused:': '😕', ':slight_smile:': '🙂',
  ':upside_down:': '🙃', ':worried:': '😟', ':disappointed:': '😞', ':cry:': '😢', ':sob:': '😭',
  ':scream:': '😱', ':angry:': '😡', ':rage:': '😠', ':triumph:': '😤', ':sunglasses:': '😎',
  ':cool:': '😎', ':nerd:': '🤓', ':thinking:': '🤔', ':zipper_mouth:': '🤐',
  ':face_with_head_bandage:': '🤕', ':mask:': '😷', ':sleeping:': '😴', ':zzz:': '💤',
  ':imp:': '👿', ':smiling_imp:': '😈', ':alien:': '👽', ':robot:': '🤖', ':poop:': '💩',
  ':pile_of_poo:': '💩', ':moneybag:': '💰', ':money_with_wings:': '💸',
  ':chart_with_upwards_trend:': '📈', ':chart:': '📈', ':stonks:': '📈',
  ':chart_with_downwards_trend:': '📉', ':notStonks:': '📉', ':bear:': '🐻', ':footprints:': '👣',
  ':bull:': '🐂', ':dollar:': '💵', ':euro:': '💶', ':currency_exchange:': '💱', ':pound:': '💷',
  ':yen:': '💴', ':bitcoin:': '₿', ':leftwards_arrow_with_hook:': '↩️', ':moneybag2:': '💰',
  ':cookie:': '🍪', ':full_moon:': '🌕', ':coffee:': '☕', ':birthday:': '🎂', ':cake:': '🍰',
  ':popcorn:': '🍿', ':cocktail:': '🍸', ':fire:': '🔥', ':poop2:': '💩', ':heart:': '❤️',
  ':broken_heart:': '💔', ':sunny:': '☀️', ':sun:': '☀️', ':new_moon:': '🌑',
  ':first_quarter_moon:': '🌓', ':sunflower:': '🌻', ':star:': '⭐', ':star2:': '🌟',
  ':partly_sunny:': '⛅', ':cloud:': '☁️', ':zap:': '⚡', ':lightning:': '⚡', ':hammer:': '🔨',
  ':bulb:': '💡', ':slot_machine:': '🎰', ':dart:': '🎯', ':rocket:': '🚀', ':rocket2:': '🚀',
  ':checkered_flag:': '🏁', ':alarm_clock:': '⏰', ':rip:': '🪦', ':ghost:': '👻', ':up:': '🆙',
  ':cool2:': '🆒', ':free:': '🆓', ':sos:': '🆘', ':100:': '💯', ':no_entry:': '⛔',
  ':eyes:': '👀', ':facepalm:': '🤦', ':shrug:': '🤷', ':diamond:': '💎', ':gem:': '💎',
  ':hands:': '🙌', ':flushed:': '😳', ':panic:': '😱', ':wait:': '☝️', ':hourglass:': '⏳',
  ':check:': '✅', ':white_check_mark:': '✅', ':x:': '❌', ':cross:': '❌', ':warning:': '⚠️',
  ':question:': '❓', ':grey_question:': '❓', ':exclamation:': '❗', ':grey_exclamation:': '❗',
  ':muscle:': '💪', ':brain:': '🧠', ':bomb:': '💣', ':boom:': '💥', ':collision:': '💥',
  ':snowflake:': '❄️', ':rainbow:': '🌈', ':moon:': '🌙', ':crescent_moon:': '🌙', ':skull:': '💀',
  ':wave:': '👋', ':point_up:': '☝️', ':point_down:': '👇', ':point_left:': '👈',
  ':point_right:': '👉', ':raised_hands:': '🙌', ':trophy:': '🏆', ':gift:': '🎁', ':tada:': '🎉',
  ':party:': '🎉', ':confetti_ball:': '🎊', ':balloon:': '🎈', ':beers:': '🍻', ':wine_glass:': '🍷',
}

const EMOJI_REGEX = new RegExp(
  Object.keys(EMOJI_MAP)
    .map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g'
)

function renderEmojis(text: string): string {
  return text.replace(EMOJI_REGEX, (match) => EMOJI_MAP[match] ?? match)
}

// Non-global classifiers (safe to reuse: no lastIndex state).
const URL_PREFIX = /^https?:\/\//
const MENTION = /^@\w+$/

function isTradingViewImage(url: string): boolean {
  return (
    url.includes('s3.tradingview.com/snapshots/') &&
    (url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg'))
  )
}

function isTradingViewSnapshot(url: string): boolean {
  return /tradingview\.com\/x\/[^/]+/.test(url)
}

function isTradingViewIdea(url: string): boolean {
  return /tradingview\.com\/chart\/[^/]+\/[^/]+/.test(url)
}

function snapshotImageUrl(url: string): string | null {
  const match = url.match(/\/x\/([^/]+)\/?/)
  if (!match) return null
  const id = match[1]
  return `https://s3.tradingview.com/snapshots/${id.charAt(0).toLowerCase()}/${id}.png`
}

function ideaImageUrl(url: string): string | null {
  const match = url.match(/\/chart\/([^/]+)\/([^/]+)\/?/)
  if (!match) return null
  const chartId = match[2]
  return `https://s3.tradingview.com/${chartId.charAt(0).toLowerCase()}/${chartId}_mid.webp`
}

function ChartImage({
  src,
  href,
  alt,
  badge,
}: {
  src: string
  href: string
  alt: string
  badge?: { text: string; className: string }
}) {
  return (
    <div className="my-2 max-w-md">
      <div className="relative">
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Image
            src={src}
            alt={alt}
            width={400}
            height={300}
            unoptimized
            className="h-auto max-w-full cursor-pointer rounded-lg border shadow-sm transition-shadow hover:shadow-md"
          />
        </a>
        {badge && (
          <div className="absolute left-2 top-2">
            <Badge className={badge.className}>{badge.text}</Badge>
          </div>
        )}
      </div>
    </div>
  )
}

function Link({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-blue-500 underline hover:text-blue-600"
    >
      {href}
    </a>
  )
}

function renderTextWithLinks(text: string): ReactNode[] {
  const parts = text.split(/(https?:\/\/[^\s]+|@\w+)/g)
  const elements: ReactNode[] = []

  parts.forEach((part, index) => {
    if (!part) return

    if (URL_PREFIX.test(part)) {
      if (isTradingViewImage(part)) {
        elements.push(
          <ChartImage key={index} src={imageProxySrc(part)!} href={part} alt="TradingView chart" />
        )
      } else if (isTradingViewSnapshot(part)) {
        const img = snapshotImageUrl(part)
        elements.push(
          img ? (
            <ChartImage
              key={index}
              src={imageProxySrc(img)!}
              href={part}
              alt="TradingView chart snapshot"
              badge={{ text: 'Chart', className: 'bg-green-600 text-xs' }}
            />
          ) : (
            <Link key={index} href={part} />
          )
        )
      } else if (isTradingViewIdea(part)) {
        const img = ideaImageUrl(part)
        elements.push(
          img ? (
            <ChartImage
              key={index}
              src={imageProxySrc(img)!}
              href={part}
              alt="TradingView idea"
              badge={{ text: 'Idea', className: 'bg-blue-600 text-xs' }}
            />
          ) : (
            <Link key={index} href={part} />
          )
        )
      } else {
        elements.push(<Link key={index} href={part} />)
      }
    } else if (MENTION.test(part)) {
      elements.push(
        <span key={index} className="font-medium text-blue-500">
          {part}
        </span>
      )
    } else {
      elements.push(<span key={index}>{renderEmojis(part)}</span>)
    }
  })

  return elements
}

function renderWithQuotes(text: string): ReactNode {
  const quoteRegex = /\[quote="([^"]+)"\]([\s\S]*?)\[\/quote\]/g
  const parts: Array<{ type: 'text' | 'quote'; content: string; username?: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = quoteRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim()
      if (before) parts.push({ type: 'text', content: before })
    }
    parts.push({ type: 'quote', username: match[1], content: match[2].trim() })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim()
    if (remaining) parts.push({ type: 'text', content: remaining })
  }

  if (parts.length === 0) {
    return <div>{renderTextWithLinks(text)}</div>
  }

  return (
    <div className="space-y-2">
      {parts.map((part, index) =>
        part.type === 'quote' ? (
          <div
            key={index}
            className="rounded-r-md border-l-4 border-blue-400/50 bg-blue-50/50 py-2 pl-3 dark:bg-blue-950/20"
          >
            <div className="mb-1 flex items-center gap-1">
              <QuoteIcon className="h-3 w-3 text-blue-500" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {part.username}:
              </span>
            </div>
            <div className="text-sm italic text-muted-foreground">
              {renderTextWithLinks(renderEmojis(part.content))}
            </div>
          </div>
        ) : (
          <div key={index}>{renderTextWithLinks(part.content)}</div>
        )
      )}
    </div>
  )
}

/** Clean raw HTML entities from a message then render rich content. */
export function renderMessage(text: string): ReactNode {
  const cleaned = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
  return renderWithQuotes(cleaned)
}
