'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  LineController,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import annotationPlugin from 'chartjs-plugin-annotation'
import zoomPlugin from 'chartjs-plugin-zoom'
import 'chartjs-adapter-date-fns'

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  LineController,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  annotationPlugin,
  zoomPlugin
)

export interface SentimentBucket {
  timestamp: string
  bullishScore: number
  bearishScore: number
  netSentiment: number
  messageCount: number
  fearGreed: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed'
  dominantKeywords: string[]
  priceAtBucket?: number
}

export interface SentimentDivergence {
  timestamp: string
  type: 'price_up_sentiment_down' | 'price_down_sentiment_up' | 'capitulation' | 'euphoria'
  description: string
  priceChange?: number
}

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

type PointContext = { raw?: { x?: number; y?: number } }
type TooltipItem = { parsed?: { x?: number }; dataset: { label?: string }; raw?: { x?: number; y?: number } }
type ClickElement = { index: number; datasetIndex: number }

interface SentimentChartProps {
  buckets: SentimentBucket[]
  divergences?: SentimentDivergence[]
  ohlcData?: OHLCData[]
  showPrice?: boolean
  onBucketClick?: (bucket: SentimentBucket) => void
}


function getSentimentColor(net: number): string {
  if (net >= 60) return '#10b981'
  if (net >= 20) return '#22c55e'
  if (net >= -20) return '#a78bfa' // violet for neutral — distinct from amber BTC price line
  if (net >= -60) return '#f97316'
  return '#dc2626'
}

export function SentimentLineChart({
  buckets,
  divergences = [],
  ohlcData = [],
  showPrice = true,
  onBucketClick,
}: SentimentChartProps) {
  const chartRef = useRef<ChartJS | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- destroy the current Chart.js instance at unmount.
      chartRef.current?.destroy()
    }
  }, [])

  const resetZoom = useCallback(() => chartRef.current?.resetZoom(), [])
  const zoomIn = useCallback(() => chartRef.current?.zoom(1.15), [])
  const zoomOut = useCallback(() => chartRef.current?.zoom(0.85), [])

  // Build sentiment dataset
  const sentimentPoints = buckets.map((b) => ({
    x: new Date(b.timestamp).getTime(),
    y: b.netSentiment,
  }))

  // Build bullish/bearish area datasets
  const bullishPoints = buckets.map((b) => ({
    x: new Date(b.timestamp).getTime(),
    y: b.bullishScore,
  }))

  const bearishPoints = buckets.map((b) => ({
    x: new Date(b.timestamp).getTime(),
    y: -b.bearishScore,
  }))

  // Price dataset (scaled to fit sentiment axis)
  let priceDataset = null
  if (showPrice && ohlcData.length > 0) {
    const prices = ohlcData.map((c) => c.close)
    const minP = Math.min(...prices)
    const maxP = Math.max(...prices)
    const priceRange = maxP - minP || 1

    const pricePoints = ohlcData.map((c) => ({
      x: c.timestamp,
      y: ((c.close - minP) / priceRange) * 180 - 90, // scale to -90..+90
    }))

    priceDataset = {
      label: 'BTC Preis (normiert)',
      data: pricePoints,
      borderColor: '#f59e0b',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      yAxisID: 'y',
      order: 3,
    }
  }

  // Build divergence annotations
  const annotations: Record<string, unknown> = {}
  divergences.forEach((div, i) => {
    const ts = new Date(div.timestamp).getTime()
    const colors: Record<string, string> = {
      price_up_sentiment_down: '#f97316',
      price_down_sentiment_up: '#a855f7',
      capitulation: '#dc2626',
      euphoria: '#10b981',
    }
    const icons: Record<string, string> = {
      price_up_sentiment_down: '⚠️',
      price_down_sentiment_up: '🔄',
      capitulation: '🩸',
      euphoria: '🎉',
    }
    const color = colors[div.type] || '#6b7280'
    const icon = icons[div.type] || '•'

    annotations[`div-line-${i}`] = {
      type: 'line',
      xMin: ts,
      xMax: ts,
      yMin: -100,
      yMax: 100,
      borderColor: color,
      borderWidth: 1,
      borderDash: [4, 6],
    }
    annotations[`div-label-${i}`] = {
      type: 'label',
      xValue: ts,
      yValue: 95,
      backgroundColor: color + '33',
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
      padding: { top: 2, bottom: 2, left: 4, right: 4 },
      color: '#fff',
      font: { size: 9 },
      content: [`${icon} ${div.type.replace(/_/g, ' ')}`],
    }
  })

  // Zero line annotation
  annotations['zero'] = {
    type: 'line',
    yMin: 0,
    yMax: 0,
    borderColor: '#52525b',
    borderWidth: 1,
    borderDash: [6, 6],
  }

  const chartData = {
    datasets: [
      // Bullish area (positive)
      {
        label: 'Bullisch',
        data: bullishPoints,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        borderWidth: 0,
        fill: { target: 'origin', above: 'rgba(34,197,94,0.12)', below: 'transparent' },
        pointRadius: 0,
        tension: 0.4,
        yAxisID: 'y',
        order: 4,
      },
      // Bearish area (negative)
      {
        label: 'Bärisch',
        data: bearishPoints,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.08)',
        borderWidth: 0,
        fill: { target: 'origin', above: 'transparent', below: 'rgba(239,68,68,0.12)' },
        pointRadius: 0,
        tension: 0.4,
        yAxisID: 'y',
        order: 4,
      },
      // Net sentiment line (main) — fixed violet/cyan so it never blends with amber BTC price
      {
        label: 'Net Sentiment',
        data: sentimentPoints,
        borderColor: '#818cf8', // indigo-400 — always distinct from amber price line
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: (ctx: PointContext) => {
          const val = ctx?.raw?.y ?? 0
          return Math.abs(val) > 60 ? 6 : 2
        },
        pointBackgroundColor: (ctx: PointContext) => {
          const val = ctx?.raw?.y ?? 0
          return getSentimentColor(val)
        },
        pointBorderColor: '#fff',
        pointBorderWidth: (ctx: PointContext) => {
          const val = ctx?.raw?.y ?? 0
          return Math.abs(val) > 60 ? 1.5 : 0
        },
        tension: 0.4,
        yAxisID: 'y',
        order: 1,
      },
      // Price (optional)
      ...(priceDataset ? [priceDataset] : []),
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
          displayFormats: {
            hour: 'dd. HH:mm',
            day: 'dd. MMM',
          },
        },
        grid: { color: '#1f1f23' },
        ticks: { color: '#71717a', font: { size: 10 } },
      },
      y: {
        min: -100,
        max: 100,
        grid: { color: '#27272a' },
        ticks: {
          color: '#71717a',
          font: { size: 10 },
          callback: (value: string | number) => {
            const v = Number(value)
            if (v === 100) return '🟢 Bull'
            if (v === 0) return 'Neutral'
            if (v === -100) return '🔴 Bear'
            return v > 0 ? `+${v}` : `${v}`
          },
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem[]) => {
            const ts = items[0]?.parsed?.x
            if (!ts) return ''
            return new Date(ts).toLocaleString('de-DE', {
              day: '2-digit', month: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })
          },
          label: (item: TooltipItem) => {
            if (item.dataset.label === 'Net Sentiment') {
              const v = item.raw?.y ?? 0
              // Find matching bucket
              const ts = item.raw?.x
              if (ts === undefined) return ''
              const bucket = buckets.find(
                (b) => Math.abs(new Date(b.timestamp).getTime() - ts) < 8 * 3600000
              )
              const lines = [`Net: ${v > 0 ? '+' : ''}${v.toFixed(0)}`]
              if (bucket) {
                lines.push(`📈 Bull: ${bucket.bullishScore} | 📉 Bear: ${bucket.bearishScore}`)
                lines.push(`🏷️ ${bucket.dominantKeywords.join(', ')}`)
                lines.push(`💬 ${bucket.messageCount} Msgs`)
              }
              return lines
            }
            if (item.dataset.label === 'BTC Preis (normiert)') {
              const ts = item.raw?.x
              if (ts === undefined) return ''
              const candle = ohlcData.find(
                (c) => Math.abs(c.timestamp - ts) < 3600000
              )
              return candle ? `BTC: $${Math.round(candle.close).toLocaleString()}` : ''
            }
            return ''
          },
        },
        backgroundColor: '#18181b',
        borderColor: '#3f3f46',
        borderWidth: 1,
        titleColor: '#e4e4e7',
        bodyColor: '#a1a1aa',
        padding: 10,
      },
      annotation: { annotations },
      zoom: {
        pan: { enabled: true, mode: 'x' as const },
        zoom: {
          wheel: { enabled: true, speed: 0.05 },
          pinch: { enabled: true },
          mode: 'x' as const,
        },
        limits: { x: { minRange: 4 * 3600000 } },
      },
    },
    onClick: (_event: unknown, elements: ClickElement[]) => {
      if (!onBucketClick || elements.length === 0) return
      const idx = elements[0].index
      const dataset = elements[0].datasetIndex
      // Only trigger on net sentiment dataset (index 2)
      if (dataset !== 2) return
      onBucketClick(buckets[idx])
    },
  }

  if (!isMounted) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-500">
        Chart lädt...
      </div>
    )
  }

  if (buckets.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-500">
        Keine Sentiment-Daten
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-zinc-950 rounded-lg p-4 relative">
      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <span className="text-[10px] text-zinc-500 hidden sm:inline mr-2">
          Scroll: Zoom • Drag: Pan
        </span>
        <div className="flex items-center gap-0.5 bg-zinc-800 rounded border border-zinc-700">
          <button onClick={zoomOut} className="px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 rounded-l">−</button>
          <button onClick={resetZoom} className="px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 border-x border-zinc-700">Reset</button>
          <button onClick={zoomIn} className="px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 rounded-r">+</button>
        </div>
      </div>

      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 h-full flex flex-col justify-between py-8 pl-1 pointer-events-none text-[9px] font-mono">
        <span className="text-emerald-500">BULL</span>
        <span className="text-zinc-500">0</span>
        <span className="text-red-500">BEAR</span>
      </div>

      <Chart
        ref={chartRef}
        type="line"
        data={chartData as never}
        options={options as never}
      />
    </div>
  )
}
