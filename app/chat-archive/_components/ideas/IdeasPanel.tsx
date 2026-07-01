'use client'

import { LightbulbIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useIdeas } from '../../_hooks/useIdeas'
import { IdeaCard } from './IdeaCard'
import { EmptyState } from '../shared/EmptyState'
import { ErrorState } from '../shared/ErrorState'

interface IdeasPanelProps {
  username: string
  active: boolean
}

function IdeaSkeleton() {
  return (
    <Card className="overflow-hidden pt-0">
      <CardContent className="p-0">
        <Skeleton className="h-44 w-full rounded-none" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </CardContent>
    </Card>
  )
}

export function IdeasPanel({ username, active }: IdeasPanelProps) {
  const { ideas, page, isLoading, error, hasNextPage, goToPage, retry, refresh, isRefreshing } =
    useIdeas(username, active)

  const showSkeletons = isLoading && ideas.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h3 className="text-xl font-semibold">Trading Ideas</h3>
          <p className="text-sm text-muted-foreground">
            {ideas.length > 0
              ? `Page ${page} · ${ideas.length} ideas`
              : `Published ideas for ${username}`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={isRefreshing || isLoading}
        >
          <RefreshCwIcon className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error ? (
        <ErrorState
          title="Ideas unavailable"
          message={error}
          onRetry={retry}
        />
      ) : showSkeletons ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <IdeaSkeleton key={i} />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <EmptyState
          icon={<LightbulbIcon className="text-yellow-500" />}
          title="No ideas found"
          description={`We couldn't find any published ideas for ${username}.`}
        >
          <Button variant="outline" onClick={retry}>
            Reload
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ideas.map((idea) => (
              <IdeaCard key={`${idea.page}-${idea.index}`} idea={idea} />
            ))}
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={page === 1 || isLoading}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={!hasNextPage || isLoading}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
