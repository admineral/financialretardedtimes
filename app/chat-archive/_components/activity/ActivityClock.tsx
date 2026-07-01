'use client'

import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/utils'
import type { HourCounts } from '../../_lib/types'

interface ActivityClockProps {
  hourCounts?: HourCounts
  totalMessages: number
  size?: number
  className?: string
  avatar?: { src: string; fallbackSrc?: string; alt: string }
}

function arcColor(intensity: number, isPeak: boolean): string {
  if (intensity > 0.7) return isPeak ? 'rgb(239, 68, 68)' : 'rgb(249, 115, 22)'
  if (intensity > 0.4) return 'rgb(234, 179, 8)'
  return 'rgb(34, 197, 94)'
}

export function ActivityClock({
  hourCounts,
  totalMessages,
  size = 200,
  className,
  avatar,
}: ActivityClockProps) {
  const clipId = useId()
  const padding = 30
  const radius = size / 2 - padding
  const center = size / 2
  const avatarRadius = radius - 25

  const [avatarSrc, setAvatarSrc] = useState<string | undefined>(avatar?.src)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setAvatarSrc(avatar?.src)
  }, [avatar?.src])

  // Only render the live time indicator on the client to avoid hydration drift.
  useEffect(() => {
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const counts = hourCounts ?? {}
  const values = Object.values(counts)
  const maxCount = Math.max(...(values.length ? values : [0]), 1)
  const total = totalMessages || values.reduce((sum, c) => sum + c, 0)
  const peakHour = Object.entries(counts).reduce(
    (peak, [hour, count]) => (count > peak.count ? { hour: parseInt(hour, 10), count } : peak),
    { hour: -1, count: 0 }
  )

  const markers: React.ReactNode[] = []
  const arcs: React.ReactNode[] = []

  for (let hour = 0; hour < 24; hour++) {
    const angle = hour * 15 - 90
    const radian = (angle * Math.PI) / 180
    const count = counts[hour] || 0
    const intensity = count / maxCount
    const percentage = total > 0 ? (count / total) * 100 : 0

    const markerRadius = radius - 10
    const x1 = center + Math.cos(radian) * (markerRadius - 5)
    const y1 = center + Math.sin(radian) * (markerRadius - 5)
    const x2 = center + Math.cos(radian) * markerRadius
    const y2 = center + Math.sin(radian) * markerRadius
    const showLabel = hour % 6 === 0
    const labelX = center + Math.cos(radian) * (radius + 12)
    const labelY = center + Math.sin(radian) * (radius + 12)

    markers.push(
      <g key={`m-${hour}`}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="currentColor"
          strokeWidth={showLabel ? 2 : 1}
          className="text-muted-foreground"
        />
        {showLabel && (
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground text-[10px] font-medium"
          >
            {hour.toString().padStart(2, '0')}
          </text>
        )}
      </g>
    )

    if (count > 0) {
      const arcRadius = radius - 15
      const strokeWidth = Math.max(3, intensity * 15)
      const isPeak = hour === peakHour.hour
      const startRadian = ((hour * 15 - 97.5) * Math.PI) / 180
      const endRadian = ((hour * 15 - 82.5) * Math.PI) / 180

      arcs.push(
        <path
          key={`a-${hour}`}
          d={`M ${center + Math.cos(startRadian) * arcRadius} ${center + Math.sin(startRadian) * arcRadius} A ${arcRadius} ${arcRadius} 0 0 1 ${center + Math.cos(endRadian) * arcRadius} ${center + Math.sin(endRadian) * arcRadius}`}
          fill="none"
          stroke={arcColor(intensity, isPeak)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={Math.max(0.4, intensity)}
        >
          <title>{`${hour.toString().padStart(2, '0')}:00 — ${count} messages (${percentage.toFixed(1)}%)${isPeak ? ' · peak' : ''}`}</title>
        </path>
      )
    }
  }

  let handTip: { x: number; y: number } | null = null
  if (now) {
    const timeAngle = (now.getHours() * 15 + now.getMinutes() * 0.25 - 90) * (Math.PI / 180)
    const len = radius * 0.85
    handTip = {
      x: center + Math.cos(timeAngle) * len,
      y: center + Math.sin(timeAngle) * len,
    }
  }

  return (
    <div className={cn('inline-flex', className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        style={{ maxWidth: '100%', height: 'auto' }}
        role="img"
        aria-label="Activity by hour of day"
      >
        <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={1} className="text-border" />
        <circle cx={center} cy={center} r={radius - 30} fill="none" stroke="currentColor" strokeWidth={1} className="text-muted-foreground/30" />
        {markers}
        {arcs}

        {handTip && (
          <>
            <line
              x1={center}
              y1={center}
              x2={handTip.x}
              y2={handTip.y}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="text-foreground/70"
            />
            <circle cx={handTip.x} cy={handTip.y} r={3.5} className="fill-foreground/70" />
          </>
        )}

        {avatar && avatarSrc ? (
          <>
            <defs>
              <clipPath id={clipId}>
                <circle cx={center} cy={center} r={avatarRadius} />
              </clipPath>
            </defs>
            <circle cx={center} cy={center} r={avatarRadius + 2} fill="none" stroke="currentColor" strokeWidth={3} className="text-border" />
            <image
              href={avatarSrc}
              x={center - avatarRadius}
              y={center - avatarRadius}
              width={avatarRadius * 2}
              height={avatarRadius * 2}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
              onError={() => {
                if (avatar.fallbackSrc && avatarSrc !== avatar.fallbackSrc) {
                  setAvatarSrc(avatar.fallbackSrc)
                } else {
                  setAvatarSrc(undefined)
                }
              }}
            />
          </>
        ) : (
          <circle cx={center} cy={center} r={3} fill="currentColor" className="text-muted-foreground" />
        )}
      </svg>
    </div>
  )
}
