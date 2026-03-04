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
import { CandlestickController, CandlestickElement, OhlcElement } from 'chartjs-chart-financial'
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
  CandlestickController,
  CandlestickElement,
  OhlcElement,
  annotationPlugin,
  zoomPlugin,
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

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

interface Props {
  buckets: SentimentBucket[]
  ohlcData: OHLCData[]
}

function getSentimentColor(net: number): string {
  if (net >= 60) return '#10b981'
  if (net >= 20) return '#22c55e'
  if (net >= -20) return '#a78bfa'
  if (net >= -60) return '#f97316'
  return '#dc2626'
}

export function SentimentCandlestickChart({ buckets, ohlcData }: Props) {
  const chartRef = useRef<ChartJS | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    return () => { chartRef.current?.destroy() }
  }, [])

  const resetZoom = useCallback(() => chartRef.current?.resetZoom(), [])
  const zoomIn = useCallback(() => chartRef.current?.zoom(1.12), [])
  const zoomOut = useCallback(() => chartRef.current?.zoom(0.88), [])

  // Price axis range
  const priceRange = (() => {
    if (ohlcData.length === 0) return { min: 80000, max: 100000 }
    const prices = ohlcData.flatMap((c) => [c.high, c.low])
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const pad = (max - min) * 0.08
    return { min: min - pad, max: max + pad }
  })()

  // Sentiment points (net sentiment, bullish, bearish) — raw values for dedicated axis
  const netPoints = buckets.map((b) => ({ x: new Date(b.timestamp).getTime(), y: b.netSentiment }))
  const bullPoints = buckets.map((b) => ({ x: new Date(b.timestamp).getTime(), y: b.bullishScore }))
  const bearPoints = buckets.map((b) => ({ x: new Date(b.timestamp).getTime(), y: -b.bearishScore }))

  // Zero line for sentiment overlay (midpoint of price range)
  const annotations: Record<string, any> = {
    sentimentZero: {
      type: 'line',
      yMin: 0,
      yMax: 0,
      yScaleID: 'sentiment',
      borderColor: 'rgba(129,140,248,0.25)',
      borderWidth: 1,
      borderDash: [5, 5],
      label: {
        display: true,
        content: '0',
        position: 'start',
        color: 'rgba(129,140,248,0.4)',
        font: { size: 9 },
        backgroundColor: 'transparent',
        padding: 2,
      },
    },
  }

  const chartData = {
    datasets: [
      // Candlesticks
      {
        type: 'candlestick' as const,
        label: 'BTC/USD',
        data: ohlcData.map((c) => ({
          x: c.timestamp,
          o: c.open,
          h: c.high,
          l: c.low,
          c: c.close,
        })),
        borderColor: (ctx: any) => (ctx.raw?.c >= ctx.raw?.o ? '#22c55e' : '#ef4444'),
        backgroundColor: (ctx: any) => (ctx.raw?.c >= ctx.raw?.o ? '#22c55e' : '#ef4444'),
        borderWidth: 1,
        yAxisID: 'y',
        order: 1,
      },
      // Bullish area
      {
        type: 'line' as const,
        label: 'Bullisch',
        data: bullPoints,
        borderColor: '#22c55e',
        backgroundColor: 'transparent',
        borderWidth: 0,
        fill: { target: { value: 0 }, above: 'rgba(34,197,94,0.12)', below: 'transparent' },
        pointRadius: 0,
        tension: 0.4,
        yAxisID: 'sentiment',
        order: 4,
      },
      // Bearish area
      {
        type: 'line' as const,
        label: 'Bärisch',
        data: bearPoints,
        borderColor: '#ef4444',
        backgroundColor: 'transparent',
        borderWidth: 0,
        fill: { target: { value: 0 }, above: 'transparent', below: 'rgba(239,68,68,0.12)' },
        pointRadius: 0,
        tension: 0.4,
        yAxisID: 'sentiment',
        order: 4,
      },
      // Net sentiment line
      {
        type: 'line' as const,
        label: 'Net Sentiment',
        data: netPoints,
        borderColor: '#818cf8',
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: (ctx: any) => {
          const raw = netPoints[ctx.dataIndex]?.y ?? 0
          return Math.abs(raw) > 60 ? 5 : 0
        },
        pointBackgroundColor: (ctx: any) => {
          const raw = netPoints[ctx.dataIndex]?.y ?? 0
          return getSentimentColor(raw)
        },
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        tension: 0.4,
        yAxisID: 'sentiment',
        order: 2,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    interaction: { intersect: false, mode: 'index' as const },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          displayFormats: {
            hour: 'dd. HH:mm',
            day: 'dd. MMM',
          },
        },
        grid: { color: '#27272a' },
        ticks: { color: '#71717a', font: { size: 10 }, maxTicksLimit: 10 },
      },
      // Price axis (left)
      y: {
        position: 'left' as const,
        min: priceRange.min,
        max: priceRange.max,
        grid: { color: '#1f1f23' },
        ticks: {
          color: '#71717a',
          font: { size: 10 },
          callback: (v: string | number) => '$' + Number(v).toLocaleString(),
          maxTicksLimit: 8,
        },
      },
      // Sentiment axis (right)
      sentiment: {
        position: 'right' as const,
        min: -100,
        max: 100,
        grid: { drawOnChartArea: false },
        ticks: {
          color: '#818cf8',
          font: { size: 10 },
          callback: (v: string | number) => {
            const n = Number(v)
            if (n === 100) return '🟢 +100'
            if (n === 0) return '0'
            if (n === -100) return '🔴 -100'
            return n > 0 ? `+${n}` : `${n}`
          },
          maxTicksLimit: 9,
        },
        border: { color: '#3f3f6640' },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: any[]) => {
            const ts = items[0]?.parsed?.x
            if (!ts) return ''
            return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          },
          label: (item: any) => {
            if (item.dataset.label === 'BTC/USD') {
              const d = item.raw
              return d ? `BTC  O:$${Math.round(d.o).toLocaleString()}  H:$${Math.round(d.h).toLocaleString()}  L:$${Math.round(d.l).toLocaleString()}  C:$${Math.round(d.c).toLocaleString()}` : ''
            }
            if (item.dataset.label === 'Net Sentiment') {
              const ts = item.raw?.x
              const bucket = buckets.find((b) => Math.abs(new Date(b.timestamp).getTime() - ts) < 8 * 3600000)
              if (!bucket) return ''
              const net = bucket.netSentiment
              return [`Net: ${net > 0 ? '+' : ''}${net.toFixed(0)}`, `📈 ${bucket.bullishScore} | 📉 ${bucket.bearishScore}`, `🏷️ ${bucket.dominantKeywords.join(', ')}`]
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
          wheel: { enabled: true, speed: 0.008 },
          pinch: { enabled: true },
          mode: 'x' as const,
        },
        limits: { x: { minRange: 4 * 3600000 } },
      },
    },
  }

  if (!isMounted) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-900/50 rounded-lg">
        <div className="text-zinc-500 text-sm">Chart lädt...</div>
      </div>
    )
  }

  if (ohlcData.length === 0 || buckets.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-900/50 rounded-lg">
        <div className="text-zinc-500 text-sm">Keine Daten</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-zinc-950 rounded-lg p-4 relative">
      {/* Legend */}
      <div className="absolute top-2 left-4 z-10 flex items-center gap-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-emerald-500/80 rounded-sm" />Bull</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-red-500/80 rounded-sm" />Bear</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-indigo-400" />Net</span>
      </div>
      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 bg-zinc-800 rounded border border-zinc-700">
        <button onClick={zoomOut} className="px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 rounded-l">−</button>
        <button onClick={resetZoom} className="px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 border-x border-zinc-700">Reset</button>
        <button onClick={zoomIn} className="px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 rounded-r">+</button>
      </div>
      <Chart ref={chartRef} type="candlestick" data={chartData as any} options={options as any} />
    </div>
  )
}
