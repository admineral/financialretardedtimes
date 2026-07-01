'use client'

import { cn } from '@/lib/utils'
import type { HourCounts } from '../../_lib/types'

interface HourlyBarsProps {
  hourCounts?: HourCounts
  totalMessages: number
  className?: string
  isLoading?: boolean
}

function barColor(intensity: number, isPeak: boolean): string {
  if (intensity > 0.7) return isPeak ? 'bg-red-500' : 'bg-orange-500'
  if (intensity > 0.4) return 'bg-yellow-500'
  return 'bg-green-500'
}

export function HourlyBars({ hourCounts, totalMessages, className, isLoading }: HourlyBarsProps) {
  const counts = hourCounts ?? {}
  const values = Object.values(counts)
  const hasData = values.some((c) => c > 0)
  const maxCount = Math.max(...(values.length ? values : [0]), 1)
  const total = totalMessages || values.reduce((sum, c) => sum + c, 0)
  const peakHour = Object.entries(counts).reduce(
    (peak, [hour, count]) => (count > peak.count ? { hour: parseInt(hour, 10), count } : peak),
    { hour: -1, count: 0 }
  )
  const currentHour = new Date().getHours()

  return (
    <div className={cn('space-y-2', className)}>
      <div className="rounded-lg bg-muted/20 p-2">
        <div className="relative flex h-24 items-end gap-px">
          {isLoading && !hasData && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              Loading hourly activity…
            </div>
          )}
          {!isLoading && !hasData && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              No hourly data yet
            </div>
          )}
          {Array.from({ length: 24 }, (_, hour) => {
            const count = counts[hour] || 0
            const intensity = count / maxCount
            const percentage = total > 0 ? (count / total) * 100 : 0
            const isPeak = hour === peakHour.hour
            const isCurrent = hour === currentHour
            return (
              <div
                key={hour}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
                title={`${hour.toString().padStart(2, '0')}:00 — ${count} messages (${percentage.toFixed(1)}%)`}
              >
                <div
                  className={cn(
                    'w-full rounded-t-sm transition-all',
                    hasData ? barColor(intensity, isPeak) : 'bg-muted',
                    isCurrent && hasData && 'ring-1 ring-primary/60'
                  )}
                  style={{ height: hasData ? `${Math.max(2, intensity * 100)}%` : 2 }}
                />
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex text-[10px] text-muted-foreground">
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="min-w-0 flex-1 text-center">
              {hour % 6 === 0 ? hour.toString().padStart(2, '0') : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
