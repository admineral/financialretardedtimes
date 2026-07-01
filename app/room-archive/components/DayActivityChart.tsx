'use client'

import { cn } from '@/lib/utils'

interface ActivityBucket {
  hour: number
  label: string
  count: number
  uniqueUsers: number
  intensity: number
}

interface DayActivityChartProps {
  buckets: ActivityBucket[]
  peakHour: number
  totalMessages: number
  isLoading?: boolean
  className?: string
}

export function DayActivityChart({
  buckets,
  peakHour,
  totalMessages,
  isLoading,
  className
}: DayActivityChartProps) {
  if (isLoading) {
    const skeletonHeights = [30, 45, 20, 60, 35, 50, 25, 70, 40, 55, 30, 65, 45, 20, 50, 35, 60, 25, 40, 55, 30, 45, 20, 50]
    return (
      <div className={cn('h-16 flex items-end gap-0.5 animate-pulse', className)}>
        {skeletonHeights.map((h, i) => (
          <div key={i} className="flex-1 bg-muted/50 rounded-t-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    )
  }

  const maxCount = Math.max(...buckets.map(b => b.count), 1)

  return (
    <div className={className}>
      <div className="flex items-end gap-0.5 h-16">
        {buckets.map(bucket => (
          <div
            key={bucket.hour}
            className="flex-1 group relative flex flex-col justify-end h-full"
            title={`${bucket.label}: ${bucket.count} Nachrichten, ${bucket.uniqueUsers} User`}
          >
            <div
              className={cn(
                'w-full rounded-t-sm transition-all duration-200',
                bucket.hour === peakHour ? 'bg-primary' : 'bg-primary/40',
                'group-hover:bg-primary group-hover:opacity-100'
              )}
              style={{
                height: `${Math.max((bucket.count / maxCount) * 100, bucket.count > 0 ? 8 : 2)}%`,
                opacity: bucket.count > 0 ? 0.6 + bucket.intensity * 0.4 : 0.15
              }}
            />
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <span className="text-[9px] font-mono bg-card border border-primary/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                {bucket.label}: {bucket.count}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-6 text-[9px] text-muted-foreground/60 font-mono">
        <span>00:00</span>
        <span>{totalMessages.toLocaleString('de-DE')} msgs · Peak {String(peakHour).padStart(2, '0')}:00</span>
        <span>23:00</span>
      </div>
    </div>
  )
}
