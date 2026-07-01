'use client'

import { format } from 'date-fns'
import { ExternalLinkIcon, MessageCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SimplePagination, PaginationInfo } from '@/components/ui/pagination'
import { useChatArchive } from '../../_hooks/useChatArchive'
import { tradingViewChatUrl } from '../../_lib/api'
import { ChatMessageItem } from './ChatMessageItem'
import { ChatDateNav } from './ChatDateNav'
import { ErrorState } from '../shared/ErrorState'

interface ChatPanelProps {
  room: string
  username: string
  date: string
  onDateChange: (date: string) => void
}

function MessageSkeleton() {
  return (
    <div className="flex gap-3 p-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}

export function ChatPanel({ room, username, date, onDateChange }: ChatPanelProps) {
  const { data, isLoading, error, currentPage, singlePage, load, loadPage } = useChatArchive({
    room,
    date,
    username,
  })

  const selectedDate = new Date(date)
  const handleDateChange = (next: Date) => onDateChange(format(next, 'yyyy-MM-dd'))
  const tvUrl = tradingViewChatUrl(room, date, username)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="mb-1 flex items-center gap-2">
              <MessageCircleIcon className="h-5 w-5" />
              Chat messages
            </CardTitle>
            <CardDescription className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>{date}</span>
              {data && <span>{data.totalMessages} messages</span>}
              {data && data.totalPages > 1 && (
                <span>
                  {data.pagesProcessed}/{data.totalPages} pages
                </span>
              )}
            </CardDescription>
          </div>

          <div className="flex flex-col items-start gap-2">
            <ChatDateNav date={selectedDate} onChange={handleDateChange} />
            <a
              href={tvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              View on TradingView
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <MessageSkeleton key={i} />
            ))}
          </div>
        ) : !data ? (
          <div className="py-8 text-center">
            <Button onClick={load}>
              <MessageCircleIcon className="h-4 w-4" />
              Load messages
            </Button>
          </div>
        ) : data.messages.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <MessageCircleIcon className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p>No messages from {username} on this day.</p>
          </div>
        ) : (
          <>
            {data.paginationInfo && data.paginationInfo.totalPages > 1 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <PaginationInfo
                  currentPage={singlePage ? currentPage : 1}
                  totalPages={data.paginationInfo.totalPages}
                  totalItems={data.totalMessages}
                />
                <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
                  Load all pages
                </Button>
              </div>
            )}

            <div className="space-y-1">
              {data.messages.map((message, index) => (
                <ChatMessageItem key={`${message.id}-${index}`} message={message} />
              ))}
            </div>

            {singlePage && data.paginationInfo && data.paginationInfo.totalPages > 1 && (
              <SimplePagination
                currentPage={currentPage}
                totalPages={data.paginationInfo.totalPages}
                onPageChange={loadPage}
                className="mt-6 justify-center"
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
