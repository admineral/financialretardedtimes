'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useActivity } from '../_hooks/useActivity'
import { clearAllCache } from '../_lib/api'
import type { ArchiveTab } from '../_lib/types'
import { ProfileHeader } from './ProfileHeader'
import { ActivityPanel } from './activity/ActivityPanel'
import { IdeasPanel } from './ideas/IdeasPanel'

function getInitialTab(): ArchiveTab {
  if (typeof window === 'undefined') return 'activity'
  return new URLSearchParams(window.location.search).get('tab') === 'ideas' ? 'ideas' : 'activity'
}

export function ArchiveShell({ username }: { username: string }) {
  const { room, isLoading, refresh, clearLocal } = useActivity()
  const [tab, setTab] = useState<ArchiveTab>('activity')
  const [isClearing, setIsClearing] = useState(false)

  useEffect(() => {
    setTab(getInitialTab())
  }, [])

  const handleTabChange = useCallback((value: string) => {
    const next = value === 'ideas' ? 'ideas' : 'activity'
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState({}, '', url)
  }, [])

  const handleClearAll = useCallback(async () => {
    setIsClearing(true)
    clearLocal()
    try {
      const result = await clearAllCache(room, username)
      toast.success(`Deleted ${result.totalDeleted} cached records`, {
        description: 'Fetching fresh data…',
      })
      await refresh()
    } catch (err) {
      toast.error('Failed to clear cache', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsClearing(false)
    }
  }, [room, username, clearLocal, refresh])

  return (
    <div className="space-y-8">
      <ProfileHeader username={username} />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="ideas">Ideas</TabsTrigger>
          </TabsList>

          {tab === 'activity' && (
            <div className="flex items-center gap-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isClearing || isLoading}
                    className="hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Clear all cached data"
                  >
                    <Trash2Icon className={cn('h-5 w-5', isClearing && 'animate-pulse')} />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all cached data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This deletes cached activity, messages, and profile data for{' '}
                      <span className="font-medium">{username}</span>, then re-fetches fresh data
                      from TradingView.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll}>
                      Clear &amp; refresh
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => refresh()}
                disabled={isLoading || isClearing}
                aria-label="Refresh activity"
              >
                <RefreshCwIcon className={cn('h-5 w-5', isLoading && 'animate-spin')} />
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="activity" className="mt-6">
          <ActivityPanel />
        </TabsContent>
        <TabsContent value="ideas" className="mt-6">
          <IdeasPanel username={username} active={tab === 'ideas'} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
