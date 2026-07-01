'use client'

import { ClockIcon, FlameIcon, MessageSquareIcon, TrendingUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityData, ActivityPatterns } from '../../_lib/types'
import { averagePerDay, countActiveDays } from '../../_lib/patterns'
import { formatCount, formatHour } from '../../_lib/format'

interface ActivityStatsRowProps {
  activities: ActivityData[]
  patterns: ActivityPatterns | null
  className?: string
}

interface StatProps {
  icon: React.ReactNode
  label: string
  value: string
}

function Stat({ icon, label, value }: StatProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card/50 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-lg font-semibold leading-tight">{value}</div>
      </div>
    </div>
  )
}

export function ActivityStatsRow({ activities, patterns, className }: ActivityStatsRowProps) {
  const total = patterns?.totalMessages ?? 0
  const avg = averagePerDay(activities, total)
  const activeDays = countActiveDays(activities)
  const peak = patterns?.peakHour && patterns.peakHour.count > 0 ? patterns.peakHour.hour : null

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)}>
      <Stat
        icon={<MessageSquareIcon className="size-4" />}
        label="Total messages"
        value={formatCount(total)}
      />
      <Stat
        icon={<TrendingUpIcon className="size-4" />}
        label="Avg / day"
        value={formatCount(avg)}
      />
      <Stat
        icon={<FlameIcon className="size-4" />}
        label="Active days"
        value={`${activeDays} / ${activities.length}`}
      />
      <Stat
        icon={<ClockIcon className="size-4" />}
        label="Peak hour"
        value={peak != null ? formatHour(peak) : '—'}
      />
    </div>
  )
}
