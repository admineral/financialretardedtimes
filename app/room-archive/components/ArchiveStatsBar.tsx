'use client'

import {
  CalendarIcon,
  ClockIcon,
  DatabaseIcon,
  MessageSquareIcon,
  UsersIcon,
  ZapIcon
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface SyncStatus {
  last_sync_at: string
  total_messages: number
  is_full_history: boolean
  newest_message_time: string | null
}

interface ArchiveStatsBarProps {
  totalMessages: number
  totalDays: number
  uniqueUsers?: number
  syncStatus: SyncStatus | null
  selectedDateStats?: { messageCount: number; uniqueUsers: number } | null
  className?: string
}

export function ArchiveStatsBar({
  totalMessages,
  totalDays,
  uniqueUsers,
  syncStatus,
  selectedDateStats,
  className
}: ArchiveStatsBarProps) {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3', className)}>
      <StatCard
        icon={MessageSquareIcon}
        label="Nachrichten gesamt"
        value={totalMessages.toLocaleString('de-DE')}
        accent="primary"
      />
      <StatCard
        icon={CalendarIcon}
        label="Tage im Archiv"
        value={totalDays.toLocaleString('de-DE')}
        accent="muted"
      />
      {uniqueUsers !== undefined && (
        <StatCard
          icon={UsersIcon}
          label="Unique User"
          value={uniqueUsers.toLocaleString('de-DE')}
          accent="muted"
        />
      )}
      {selectedDateStats && (
        <StatCard
          icon={DatabaseIcon}
          label="Ausgewählter Tag"
          value={`${selectedDateStats.messageCount.toLocaleString('de-DE')} msgs`}
          subValue={`${selectedDateStats.uniqueUsers} User`}
          accent="gold"
        />
      )}
      {syncStatus && (
        <StatCard
          icon={ZapIcon}
          label="Letzter Sync"
          value={formatDistanceToNow(new Date(syncStatus.last_sync_at), { addSuffix: true, locale: de })}
          subValue={syncStatus.is_full_history ? 'Vollständig' : 'Teilweise'}
          accent="sync"
          iconSecondary={ClockIcon}
        />
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  iconSecondary: IconSecondary,
  label,
  value,
  subValue,
  accent
}: {
  icon: React.ComponentType<{ className?: string }>
  iconSecondary?: React.ComponentType<{ className?: string }>
  label: string
  value: string
  subValue?: string
  accent: 'primary' | 'muted' | 'gold' | 'sync'
}) {
  const accentClasses = {
    primary: 'border-primary/20 bg-primary/5',
    muted: 'border-foreground/10 bg-card/60',
    gold: 'border-[#D4AF37]/30 bg-[#D4AF37]/5',
    sync: 'border-green-500/20 bg-green-500/5'
  }

  return (
    <div className={cn('rounded-lg border px-4 py-3', accentClasses[accent])}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {IconSecondary && <IconSecondary className="h-3 w-3 text-muted-foreground/60" />}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold font-mono leading-tight">{value}</p>
      {subValue && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{subValue}</p>
      )}
    </div>
  )
}
