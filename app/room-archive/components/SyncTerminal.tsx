'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  CheckCircleIcon,
  RefreshCwIcon,
  XCircleIcon,
  ZapIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { TerminalCard, MetricTile } from './TerminalCard'
import { SyncHistoryList } from './SyncHistoryList'
import { cn } from '@/lib/utils'

interface SyncStatus {
  last_sync_at: string
  total_messages: number
  is_full_history: boolean
  newest_message_time: string | null
}

interface SyncTerminalProps {
  syncStatus: SyncStatus | null
  totalMessages: number
  roomId?: string
  onRefreshStats: () => void
}

export function SyncTerminal({
  syncStatus,
  totalMessages,
  roomId = 'bitcoin_de_DE',
  onRefreshStats
}: SyncTerminalProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; synced: number } | null>(null)

  const triggerSync = async () => {
    setIsSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/cron/sync-chat?trigger=manual', { method: 'POST' })
      const data = await res.json()
      setSyncResult({ success: data.success, synced: data.totalSynced || 0 })
      onRefreshStats()
    } catch {
      setSyncResult({ success: false, synced: 0 })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      {syncResult && (
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-lg border text-sm',
            syncResult.success
              ? 'border-green-500/30 bg-green-500/10 text-green-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          )}
        >
          {syncResult.success ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
          {syncResult.success
            ? `Sync OK · +${syncResult.synced} neue Nachrichten`
            : 'Sync fehlgeschlagen'}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          label="Letzter Sync"
          value={
            syncStatus?.last_sync_at
              ? formatDistanceToNow(new Date(syncStatus.last_sync_at), { addSuffix: true, locale: de })
              : '—'
          }
        />
        <MetricTile label="DB Messages" value={(syncStatus?.total_messages ?? totalMessages).toLocaleString('de-DE')} />
        <MetricTile label="History" value={syncStatus?.is_full_history ? 'Full' : 'Partial'} />
        <MetricTile
          label="Newest Msg"
          value={
            syncStatus?.newest_message_time
              ? new Date(syncStatus.newest_message_time).toLocaleString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : '—'
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <TerminalCard title="Cron Control" subtitle="Vercel · */5 * * * *" className="lg:col-span-4">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">bitcoin_de_DE</Badge>
              <Badge variant="secondary">5 min interval</Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Der Cron holt neue TradingView-Nachrichten, dedupliziert und speichert in{' '}
              <code className="text-primary">tv_chat_messages</code>. Timeline-Counts kommen aus{' '}
              <code className="text-primary">date_stats_cache</code>.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={triggerSync} disabled={isSyncing}>
                <ZapIcon className={cn('h-4 w-4 mr-1', isSyncing && 'animate-pulse')} />
                {isSyncing ? 'Syncing…' : 'Manual Sync'}
              </Button>
              <Button size="sm" variant="outline" onClick={onRefreshStats}>
                <RefreshCwIcon className="h-4 w-4 mr-1" /> Refresh Stats
              </Button>
            </div>
            {isSyncing && <Progress value={66} className="h-1 animate-pulse" />}
          </div>
        </TerminalCard>

        <div className="lg:col-span-8">
          <SyncHistoryList roomId={roomId} />
        </div>
      </div>
    </div>
  )
}
