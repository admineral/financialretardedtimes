'use client'

import Link from 'next/link'
import { CrownIcon, Loader2Icon, UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TopUser {
  username: string
  messageCount: number
  user_pic?: string
  is_moderator?: boolean
}

interface TopUsersPanelProps {
  users: TopUser[]
  isLoading?: boolean
  roomId?: string
  dateLabel?: string
  className?: string
  limit?: number
  compact?: boolean
}

const DEFAULT_ROOM = 'bitcoin_de_DE'

export function TopUsersPanel({
  users,
  isLoading,
  roomId = DEFAULT_ROOM,
  dateLabel,
  className,
  limit,
  compact
}: TopUsersPanelProps) {
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-6 text-muted-foreground', className)}>
        <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
        {!compact && 'Lade User...'}
      </div>
    )
  }

  const displayUsers = limit ? users.slice(0, limit) : users

  if (displayUsers.length === 0) {
    return (
      <div className={cn('text-center py-6 text-muted-foreground text-sm', className)}>
        Keine User-Daten
      </div>
    )
  }

  const maxCount = displayUsers[0]?.messageCount || 1

  return (
    <div className={className}>
      {dateLabel && (
        <p className="text-xs text-muted-foreground mb-4">
          Top Chatters · {dateLabel}
        </p>
      )}

      <div className={cn('space-y-2', compact && 'space-y-1')}>
        {displayUsers.map((user, index) => (
          <Link
            key={user.username}
            href={`/chat-archive?username=${encodeURIComponent(user.username)}&room=${roomId}`}
            className={cn(
              'flex items-center gap-3 rounded-lg border border-foreground/10 bg-card/60 hover:bg-card hover:border-primary/30 transition-all group',
              compact ? 'p-2' : 'p-3'
            )}
          >
            <span className={cn(
              'w-6 text-center text-sm font-mono font-bold flex-shrink-0',
              index === 0 && 'text-[#D4AF37]',
              index === 1 && 'text-muted-foreground',
              index === 2 && 'text-amber-700/70',
              index > 2 && 'text-muted-foreground/50'
            )}>
              {index + 1}
            </span>

            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {user.user_pic ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.user_pic} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  'font-medium text-sm truncate group-hover:text-primary transition-colors',
                  user.is_moderator && 'text-amber-500'
                )}>
                  {user.username}
                </span>
                {user.is_moderator && <CrownIcon className="h-3 w-3 text-amber-500 flex-shrink-0" />}
              </div>
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all"
                  style={{ width: `${(user.messageCount / maxCount) * 100}%` }}
                />
              </div>
            </div>

            <span className="text-sm font-mono font-semibold text-muted-foreground flex-shrink-0">
              {user.messageCount.toLocaleString('de-DE')}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
