'use client'

import { ExternalLinkIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { ChatMessage } from '../../_lib/types'
import { formatMessageTime } from '../../_lib/format'
import { renderMessage } from './richText'

const TV_ORIGIN = 'https://de.tradingview.com'

function avatarUrl(message: ChatMessage): string {
  if (message.avatar?.trim()) return message.avatar
  return `https://s3.tradingview.com/userpics/${message.username.toLowerCase()}_50.png`
}

export function ChatMessageItem({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3 rounded-lg p-3 transition-colors hover:bg-muted/30">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={avatarUrl(message)} alt={message.username} />
        <AvatarFallback className="text-xs">
          {message.username.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {message.userProfileUrl ? (
            <a
              href={`${TV_ORIGIN}${message.userProfileUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:text-primary hover:underline"
            >
              {message.username}
            </a>
          ) : (
            <span className="text-sm font-medium">{message.username}</span>
          )}
          <span className="text-xs text-muted-foreground">{formatMessageTime(message.time)}</span>
          {message.permalink && (
            <a
              href={`${TV_ORIGIN}${message.permalink}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Open message on TradingView"
            >
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="break-words text-sm text-foreground">{renderMessage(message.text)}</div>
      </div>
    </div>
  )
}
