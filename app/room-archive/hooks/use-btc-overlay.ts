'use client'

import { useEffect, useRef, useState } from 'react'
import type { DateStats } from '@/app/newspaper/lib/types'
import { getNewspaperDateKey } from '@/app/newspaper/lib/timezone'
import { datesStatsSignature } from '../lib/range-utils'

export interface BtcOverlayPoint {
  date: string
  label: string
  messages: number
  btcClose: number | null
  users: number
}

type BtcPriceCache = {
  priceByDate: Map<string, number>
  spot: number | null
  fetchedAt: number
}

const BTC_CACHE_MS = 5 * 60 * 1000
let btcPriceCache: BtcPriceCache | null = null
let btcPriceInflight: Promise<{ priceByDate: Map<string, number>; spot: number | null }> | null =
  null

async function loadBtcPrices(): Promise<{ priceByDate: Map<string, number>; spot: number | null }> {
  const now = Date.now()
  if (btcPriceCache && now - btcPriceCache.fetchedAt < BTC_CACHE_MS) {
    return { priceByDate: btcPriceCache.priceByDate, spot: btcPriceCache.spot }
  }

  if (btcPriceInflight) return btcPriceInflight

  btcPriceInflight = Promise.all([
    fetch('/chart-timeline/api/ohlc?timeframe=1D').then(r => (r.ok ? r.json() : null)),
    fetch('/newspaper/api/btc-price').then(r => (r.ok ? r.json() : null))
  ])
    .then(([ohlcData, spotData]) => {
      const priceByDate = new Map<string, number>()
      for (const candle of ohlcData?.ohlc || []) {
        const dateKey = getNewspaperDateKey(new Date(candle.timestamp))
        priceByDate.set(dateKey, candle.close)
      }

      const spot = spotData?.price ?? null
      btcPriceCache = { priceByDate, spot, fetchedAt: Date.now() }
      return { priceByDate, spot }
    })
    .finally(() => {
      btcPriceInflight = null
    })

  return btcPriceInflight
}

function buildOverlayPoints(
  dates: DateStats[],
  priceByDate: Map<string, number>
): BtcOverlayPoint[] {
  return [...dates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90)
    .map(d => ({
      date: d.date,
      label: new Date(`${d.date}T12:00:00`).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'short'
      }),
      messages: d.messageCount,
      btcClose: priceByDate.get(d.date) ?? null,
      users: d.uniqueUsers
    }))
}

export function useBtcOverlay(dates: DateStats[], enabled = true) {
  const signature = datesStatsSignature(dates, { lastNEntries: 90 })
  const datesRef = useRef(dates)
  datesRef.current = dates

  const [points, setPoints] = useState<BtcOverlayPoint[]>([])
  const [btcSpot, setBtcSpot] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const loadedSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !signature) {
      if (!signature) {
        setPoints([])
        setBtcSpot(null)
      }
      setIsLoading(false)
      return
    }

    if (loadedSignatureRef.current === signature) return

    let cancelled = false
    const isFirstLoad = loadedSignatureRef.current == null
    if (isFirstLoad) setIsLoading(true)

    void loadBtcPrices()
      .then(({ priceByDate, spot }) => {
        if (cancelled) return

        loadedSignatureRef.current = signature
        setBtcSpot(spot)
        setPoints(buildOverlayPoints(datesRef.current, priceByDate))
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [signature, enabled])

  return { points, btcSpot, isLoading }
}
