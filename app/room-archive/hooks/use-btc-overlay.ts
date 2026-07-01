'use client'

import { useEffect, useState } from 'react'
import type { DateStats } from '@/app/newspaper/lib/types'
import { getNewspaperDateKey } from '@/app/newspaper/lib/timezone'

export interface BtcOverlayPoint {
  date: string
  label: string
  messages: number
  btcClose: number | null
  users: number
}

export function useBtcOverlay(dates: DateStats[], enabled = true) {
  const [points, setPoints] = useState<BtcOverlayPoint[]>([])
  const [btcSpot, setBtcSpot] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!enabled || dates.length === 0) return

    let cancelled = false
    setIsLoading(true)

    const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date)).slice(-90)

    Promise.all([
      fetch('/chart-timeline/api/ohlc?timeframe=1D').then(r => (r.ok ? r.json() : null)),
      fetch('/newspaper/api/btc-price').then(r => (r.ok ? r.json() : null))
    ])
      .then(([ohlcData, spotData]) => {
        if (cancelled) return

        const priceByDate = new Map<string, number>()
        for (const candle of ohlcData?.ohlc || []) {
          const dateKey = getNewspaperDateKey(new Date(candle.timestamp))
          priceByDate.set(dateKey, candle.close)
        }

        setBtcSpot(spotData?.price ?? null)
        setPoints(
          sorted.map(d => ({
            date: d.date,
            label: new Date(`${d.date}T12:00:00`).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: 'short'
            }),
            messages: d.messageCount,
            btcClose: priceByDate.get(d.date) ?? null,
            users: d.uniqueUsers
          }))
        )
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [dates, enabled])

  return { points, btcSpot, isLoading }
}
