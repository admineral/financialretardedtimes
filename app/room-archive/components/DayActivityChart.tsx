'use client'

import { cn } from '@/lib/utils'

export interface ActivityBucket {
  hour: number
  label: string
  count: number
  uniqueUsers: number
  intensity: number
}

interface DayActivityChartProps {
  buckets: ActivityBucket[]
  peakIndex: number
  peakLabel: string
  totalMessages: number
  mode?: 'hourly' | 'daily'
  isLoading?: boolean
  className?: string
}

export function DayActivityChart({
  buckets,
  peakIndex,
  peakLabel,
  totalMessages,
  mode = 'hourly',
  isLoading,
  className
}: DayActivityChartProps) {
  if (isLoading) {
    const skeletonHeights = [30, 45, 20, 60, 35, 50, 25, 70, 40, 55, 30, 65, 45, 20, 50, 35, 60, 25, 40, 55, 30, 45, 20, 50]
    return (
      <div className={cn('h-20 flex items-end gap-0.5 animate-pulse overflow-hidden', className)}>
        {skeletonHeights.map((h, i) => (
          <div key={i} className="flex-1 min-w-[6px] bg-muted/50 rounded-t-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    )
  }

  if (buckets.length === 0) {
    return (
      <div className={cn('h-20 flex items-center justify-center text-xs text-muted-foreground', className)}>
        Keine Aktivität in diesem Zeitraum
      </div>
    )
  }

  const maxCount = Math.max(...buckets.map(b => b.count), 1)
  const isDaily = mode === 'daily'
  const barMinWidth = isDaily ? 10 : undefined

  const formatDailyLabel = (label: string) => {
    const date = new Date(`${label}T12:00:00`)
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  }

  const startLabel = isDaily
    ? formatDailyLabel(buckets[0]?.label || '')
    : '00:00'
  const endLabel = isDaily
    ? formatDailyLabel(buckets[buckets.length - 1]?.label || '')
    : '23:00'

  const peakDisplay = isDaily
    ? `${formatDailyLabel(peakLabel)} (${peakLabel})`
    : peakLabel

  return (
    <div className={className}>
      <div className={cn('overflow-x-auto pb-1', isDaily && buckets.length > 14 && 'max-w-full')}>
        <div
          className="flex items-end gap-0.5 h-20"
          style={isDaily ? { minWidth: `${Math.max(buckets.length * 12, 280)}px` } : undefined}
        >
          {buckets.map(bucket => {
            const displayLabel = isDaily ? formatDailyLabel(bucket.label) : bucket.label
            return (
              <div
                key={`${bucket.hour}-${bucket.label}`}
                className={cn('group relative flex flex-col justify-end h-full', isDaily ? 'min-w-[10px] flex-1' : 'flex-1')}
                style={barMinWidth ? { minWidth: barMinWidth } : undefined}
                title={`${displayLabel}: ${bucket.count} Nachrichten, ${bucket.uniqueUsers} User`}
              >
                <div
                  className={cn(
                    'w-full rounded-t-sm transition-all duration-200',
                    bucket.hour === peakIndex ? 'bg-primary' : 'bg-primary/40',
                    'group-hover:bg-primary group-hover:opacity-100'
                  )}
                  style={{
                    height: `${Math.max((bucket.count / maxCount) * 100, bucket.count > 0 ? 8 : 2)}%`,
                    opacity: bucket.count > 0 ? 0.6 + bucket.intensity * 0.4 : 0.15
                  }}
                />
                {isDaily && buckets.length <= 31 && (
                  <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground/50 font-mono rotate-[-45deg] origin-top whitespace-nowrap pointer-events-none">
                    {displayLabel}
                  </span>
                )}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <span className="text-[9px] font-mono bg-card border border-primary/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                    {displayLabel}: {bucket.count}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex justify-between mt-8 text-[9px] text-muted-foreground/60 font-mono gap-2">
        <span className="flex-shrink-0">{startLabel}</span>
        <span className="text-center truncate">
          {totalMessages.toLocaleString('de-DE')} msgs · Peak {peakDisplay}
        </span>
        <span className="flex-shrink-0">{endLabel}</span>
      </div>
    </div>
  )
}
