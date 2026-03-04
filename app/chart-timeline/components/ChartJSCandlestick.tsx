'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { CandlestickController, CandlestickElement, OhlcElement } from 'chartjs-chart-financial'
import annotationPlugin from 'chartjs-plugin-annotation'
import zoomPlugin from 'chartjs-plugin-zoom'
import 'chartjs-adapter-date-fns'

// Register Chart.js components once
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  CandlestickController,
  CandlestickElement,
  OhlcElement,
  annotationPlugin,
  zoomPlugin
)

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

interface TimelineEvent {
  id: string
  date: string
  time: string
  title: string
  fullQuote: string
  story?: string
  description: string
  type: 'discussion' | 'prediction' | 'drama' | 'insight' | 'milestone' | 'humor'
  participants: string[]
  priceContext?: string
  sentiment?: string
  wasCorrect?: boolean
  priceAtQuote?: number
  hasTimeframe?: boolean
}

type Timeframe = '15m' | '1H' | '4H' | '1D' | '1W'

interface ChartJSCandlestickProps {
  ohlcData: OHLCData[]
  events: TimelineEvent[]
  timeframe: Timeframe
  disableZoom?: boolean
  minLineLength?: number // 0-100, percentage of price range
  onEventClick?: (event: TimelineEvent) => void // Callback when clicking on a label
}

// Color config for different event types
const typeColors: Record<string, { dot: string; bg: string; label: string }> = {
  pump_call: { dot: '#10b981', bg: '#064e3b', label: '📈 PUMP' },
  bottom_call: { dot: '#14b8a6', bg: '#134e4a', label: '⬇️ BOTTOM' },
  dump_call: { dot: '#ef4444', bg: '#7f1d1d', label: '📉 DUMP' },
  top_call: { dot: '#f43f5e', bg: '#881337', label: '⬆️ TOP' },
  fomo: { dot: '#f59e0b', bg: '#78350f', label: '🚀 FOMO' },
  panic: { dot: '#f97316', bg: '#7c2d12', label: '😱 PANIK' },
  diamond_hands: { dot: '#3b82f6', bg: '#1e3a8a', label: '💎 HODL' },
  reversal: { dot: '#a855f7', bg: '#581c87', label: '🔄 REVERSAL' },
  analysis: { dot: '#06b6d4', bg: '#164e63', label: '📊 ANALYSE' },
  sideways: { dot: '#64748b', bg: '#334155', label: '↔️ SEITWÄRTS' },
}

function findClosestCandle(date: string, time: string, ohlcData: OHLCData[]): OHLCData | null {
  if (ohlcData.length === 0) return null
  
  const eventTime = new Date(`${date}T${time}:00`).getTime()
  
  let closest = ohlcData[0]
  let minDiff = Math.abs(closest.timestamp - eventTime)
  
  for (const candle of ohlcData) {
    const diff = Math.abs(candle.timestamp - eventTime)
    if (diff < minDiff) {
      minDiff = diff
      closest = candle
    }
  }
  
  return closest
}

export function ChartJSCandlestick({ ohlcData, events, timeframe, disableZoom = false, minLineLength = 12, onEventClick }: ChartJSCandlestickProps) {
  const chartRef = useRef<ChartJS | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)

  useEffect(() => {
    setIsMounted(true)
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
      }
    }
  }, [])

  // Zoom controls
  const resetZoom = useCallback(() => {
    chartRef.current?.resetZoom()
  }, [])
  
  const zoomIn = useCallback(() => {
    chartRef.current?.zoom(1.1)  // Smaller increment for smoother zoom
  }, [])
  
  const zoomOut = useCallback(() => {
    chartRef.current?.zoom(0.9)  // Smaller increment for smoother zoom
  }, [])

  // Calculate price range
  const priceRange = (() => {
    if (ohlcData.length === 0) return { min: 80000, max: 100000 }
    const prices = ohlcData.flatMap(c => [c.high, c.low])
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const padding = (max - min) * 0.1
    return { min: min - padding, max: max + padding }
  })()

  // Build annotations from events
  const buildAnnotations = useCallback(() => {
    const annotations: Record<string, any> = {}
    if (ohlcData.length === 0) return annotations

    const minPrice = Math.min(...ohlcData.map(c => c.low))
    const maxPrice = Math.max(...ohlcData.map(c => c.high))
    const range = maxPrice - minPrice || 1000
    
    // Time offset based on timeframe
    const xOffset = timeframe === '15m' ? 1800000 : 
                    timeframe === '1H' ? 3600000 : 
                    timeframe === '4H' ? 7200000 : 
                    14400000

    // Track positions to avoid overlap
    const usedPositions: { x: number; y: number; above: boolean }[] = []
    
    events.forEach((event, idx) => {
      if (!event.title || !event.date || !event.time) return
      
      const candle = findClosestCandle(event.date, event.time, ohlcData)
      if (!candle) return

      const colors = typeColors[event.priceContext || 'analysis'] || typeColors.analysis
      
      // Determine if label goes above or below
      const hash = event.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      let isAbove = idx % 2 === 0
      
      // Check room available
      const roomAbove = maxPrice - candle.high
      const roomBelow = candle.low - minPrice
      if (roomAbove < range * 0.15) isAbove = false
      if (roomBelow < range * 0.15) isAbove = true
      
      // Calculate minimum clearance to avoid overlapping candle bars
      // Label box is roughly 50px tall, estimate in price units based on chart range
      const labelHeightEstimate = range * 0.04 // ~4% of visible range for label box
      const candleHeight = candle.high - candle.low
      const minClearance = Math.max(candleHeight * 0.5, labelHeightEstimate) + range * 0.02
      
      // Calculate label position - minLineLength adds extra offset beyond minimum clearance
      const extraOffset = (minLineLength / 100) * range * 0.20 // 0-20% extra based on slider
      const variationOffset = (hash % 8) * range * 0.015 // Small random variation
      const totalOffset = minClearance + extraOffset + variationOffset
      
      const xPattern = [0.8, -0.8, 1.2, -1.2, 0.4, -0.4][idx % 6]
      const labelX = candle.timestamp + (xOffset * xPattern)
      
      let labelY: number
      let dotY: number
      
      if (isAbove) {
        dotY = candle.high
        labelY = candle.high + totalOffset
      } else {
        dotY = candle.low
        labelY = candle.low - totalOffset
      }
      
      // Avoid overlaps with other labels by shifting
      for (let attempt = 0; attempt < 3; attempt++) {
        const hasOverlap = usedPositions.some(pos => 
          Math.abs(pos.x - labelX) < xOffset * 2 && 
          Math.abs(pos.y - labelY) < labelHeightEstimate * 1.5
        )
        if (!hasOverlap) break
        labelY += isAbove ? labelHeightEstimate : -labelHeightEstimate
      }
      
      usedPositions.push({ x: labelX, y: labelY, above: isAbove })
      
      // Truncate quote
      const shortQuote = event.title.length > 35 ? event.title.slice(0, 35) + '...' : event.title

      const isHovered = hoveredEventId === event.id
      const baseZ = idx
      const hoverZ = 1000 // Bring to front when hovered

      // Line from candle to label
      annotations[`line-${event.id}`] = {
        type: 'line',
        xMin: candle.timestamp,
        xMax: labelX,
        yMin: dotY,
        yMax: labelY,
        borderColor: isHovered ? colors.dot : colors.dot,
        borderWidth: isHovered ? 2 : 1,
        borderDash: [4, 4],
        z: isHovered ? hoverZ : baseZ,
      }

      // Dot on candle
      annotations[`point-${event.id}`] = {
        type: 'point',
        xValue: candle.timestamp,
        yValue: dotY,
        radius: isHovered ? 7 : 5,
        backgroundColor: colors.dot,
        borderColor: isHovered ? '#fff' : 'rgba(0,0,0,0.5)',
        borderWidth: isHovered ? 2 : 1,
        z: isHovered ? hoverZ : baseZ,
      }

      // Label box with hover and click interaction
      annotations[`label-${event.id}`] = {
        type: 'label',
        xValue: labelX,
        yValue: labelY,
        backgroundColor: isHovered ? colors.dot : colors.bg,
        borderColor: isHovered ? '#fff' : colors.dot,
        borderWidth: isHovered ? 2 : 1,
        borderRadius: 4,
        padding: { top: 3, bottom: 3, left: 5, right: 5 },
        color: '#fff',
        font: { size: isHovered ? 10 : 9, family: 'system-ui', weight: isHovered ? 'bold' : 'normal' },
        content: [
          `${colors.label}  ${event.time?.slice(0, 5) || ''}`,
          shortQuote,
          `@${event.participants[0] || 'Anon'}`
        ],
        textAlign: 'left' as const,
        z: isHovered ? hoverZ : baseZ,
        enter: () => setHoveredEventId(event.id),
        leave: () => setHoveredEventId(null),
        click: () => onEventClick?.(event),
      }
    })

    return annotations
  }, [events, ohlcData, timeframe, minLineLength, hoveredEventId, onEventClick])

  // Chart data
  const chartData = {
    datasets: [{
      label: 'BTC/USD',
      data: ohlcData.map(candle => ({
        x: candle.timestamp,
        o: candle.open,
        h: candle.high,
        l: candle.low,
        c: candle.close,
      })),
      borderColor: (ctx: any) => {
        const { o, c } = ctx.raw || {}
        return c >= o ? '#22c55e' : '#ef4444'
      },
      backgroundColor: (ctx: any) => {
        const { o, c } = ctx.raw || {}
        return c >= o ? '#22c55e' : '#ef4444'
      },
      borderWidth: 1,
    }]
  }

  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: (timeframe === '15m' ? 'hour' : timeframe === '1H' || timeframe === '4H' ? 'day' : 'week') as 'hour' | 'day' | 'week',
          displayFormats: {
            hour: 'HH:mm',
            day: 'dd MMM',
            week: 'dd MMM',
          },
        },
        grid: { color: '#27272a' },
        ticks: { color: '#6b7280', font: { size: 10 } },
      },
      y: {
        position: 'left' as const,
        min: priceRange.min,
        max: priceRange.max,
        grid: { color: '#1f1f23' },
        ticks: {
          color: '#6b7280',
          font: { size: 10 },
          callback: (value: string | number) => '$' + Number(value).toLocaleString(),
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      annotation: {
        annotations: buildAnnotations(),
      },
      zoom: {
        pan: {
          enabled: !disableZoom,
          mode: 'x' as const,
        },
        zoom: {
          wheel: { 
            enabled: !disableZoom, 
            speed: 0.03,  // Slower for smoother control
          },
          pinch: { enabled: !disableZoom },
          mode: 'x' as const,
        },
        limits: {
          x: { minRange: 3600000 },  // Minimum 1 hour visible (prevents over-zoom)
        },
      },
    },
  }

  if (!isMounted) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-zinc-900/50 rounded-lg">
        <div className="text-zinc-500">Chart lädt...</div>
      </div>
    )
  }

  if (ohlcData.length === 0) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-zinc-900/50 rounded-lg">
        <div className="text-zinc-500">Keine Daten verfügbar</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[400px] bg-zinc-950 rounded-lg p-4 relative">
      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        {!disableZoom && (
          <span className="text-[10px] text-zinc-500 hidden sm:inline">
            Scroll: Zoom • Drag: Pan
          </span>
        )}
        <div className="flex items-center gap-1 bg-zinc-800 rounded border border-zinc-700">
          <button
            onClick={zoomOut}
            className="px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 rounded-l"
          >
            −
          </button>
          <button
            onClick={resetZoom}
            className="px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 border-x border-zinc-700"
          >
            Reset
          </button>
          <button
            onClick={zoomIn}
            className="px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 rounded-r"
          >
            +
          </button>
        </div>
      </div>
      
      <Chart
        ref={chartRef}
        type="candlestick"
        data={chartData}
        options={options}
      />
    </div>
  )
}
