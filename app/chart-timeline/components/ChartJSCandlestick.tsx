'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
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
import { typeConfig } from './QuoteCard'

// Register Chart.js components
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
  description: string
  type: 'discussion' | 'prediction' | 'drama' | 'insight' | 'milestone' | 'humor'
  participants: string[]
  priceContext?: string
  sentiment?: string
  wasCorrect?: boolean
  priceAtQuote?: number
}

type Timeframe = '15m' | '1H' | '4H' | '1D' | '1W'

interface ChartJSCandlestickProps {
  ohlcData: OHLCData[]
  events: TimelineEvent[]
  timeframe: Timeframe
  disableZoom?: boolean
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

export function ChartJSCandlestick({ ohlcData, events, timeframe, disableZoom = false }: ChartJSCandlestickProps) {
  const chartRef = useRef<ChartJS>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Reset zoom function
  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
  }

  // Transform data for Chart.js financial charts
  const chartData = useMemo(() => {
    return {
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
  }, [ohlcData])

  // Create annotations from events
  const annotations = useMemo(() => {
    const result: Record<string, any> = {}
    
    // Calculate price range for offsets
    const priceRange = ohlcData.length > 0 
      ? Math.max(...ohlcData.map(c => c.high)) - Math.min(...ohlcData.map(c => c.low))
      : 1000
    
    // Track occupied positions to avoid overlaps
    const occupiedSlots: { x: number; yLevel: number }[] = []
    
    events
      .filter(e => e.title && e.date && e.time)
      .slice(0, 8) // Limit to avoid overcrowding
      .forEach((event, idx) => {
        const candle = findClosestCandle(event.date, event.time, ohlcData)
        if (!candle) return

        const config = typeConfig[event.priceContext as keyof typeof typeConfig] || typeConfig.analysis
        const pricePoint = event.priceAtQuote || candle.close
        
        // Determine position - alternate above/below and find non-overlapping level
        let isAbove = idx % 2 === 0
        let level = 0
        
        // Check for overlaps
        for (let l = 0; l < 4; l++) {
          const hasOverlap = occupiedSlots.some(slot => 
            Math.abs(slot.x - candle.timestamp) < (3600000 * 4) && // Within 4 hours
            slot.yLevel === (isAbove ? l : -l)
          )
          if (!hasOverlap) {
            level = l
            break
          }
          if (l === 0) isAbove = !isAbove
        }
        
        occupiedSlots.push({ x: candle.timestamp, yLevel: isAbove ? level : -level })
        
        // Much larger offset to keep cards far from candles
        const baseOffset = priceRange * 0.20
        const levelOffset = priceRange * 0.08 * level
        const totalOffset = baseOffset + levelOffset
        const labelY = isAbove ? pricePoint + totalOffset : pricePoint - totalOffset

        // Vertical line annotation - longer dashed line
        result[`line-${event.id}`] = {
          type: 'line',
          xMin: candle.timestamp,
          xMax: candle.timestamp,
          yMin: isAbove ? pricePoint : labelY - (priceRange * 0.02),
          yMax: isAbove ? labelY + (priceRange * 0.02) : pricePoint,
          borderColor: config.dotColor,
          borderWidth: 1.5,
          borderDash: [5, 5],
        }

        // Point annotation at the price - glowing dot
        result[`point-${event.id}`] = {
          type: 'point',
          xValue: candle.timestamp,
          yValue: pricePoint,
          radius: 6,
          backgroundColor: config.dotColor,
          borderColor: 'rgba(0,0,0,0.6)',
          borderWidth: 2,
        }

        // Label annotation (the quote card) - better styling
        const truncatedQuote = event.title.length > 32 ? event.title.slice(0, 32) + '...' : event.title
        result[`label-${event.id}`] = {
          type: 'label',
          xValue: candle.timestamp,
          yValue: labelY,
          backgroundColor: config.bg,
          borderColor: config.dotColor,
          borderWidth: 1,
          borderRadius: 6,
          padding: { top: 4, bottom: 4, left: 6, right: 6 },
          color: '#fff',
          font: {
            size: 9,
            family: 'ui-sans-serif, system-ui, sans-serif',
            weight: '500',
          },
          content: [
            `${config.label}  ${event.time?.slice(0, 5) || ''}`,
            truncatedQuote,
            `@${event.participants[0] || 'Anon'}`
          ],
          textAlign: 'left',
        }
      })

    return result
  }, [events, ohlcData])

  // Chart options
  const options = useMemo(() => ({
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
        grid: {
          color: '#27272a',
          drawBorder: false,
        },
        ticks: {
          color: '#6b7280',
          font: { size: 10, family: 'ui-monospace' },
        },
      },
      y: {
        position: 'left' as const,
        grid: {
          color: '#1f1f23',
          drawBorder: false,
        },
        ticks: {
          color: '#6b7280',
          font: { size: 10, family: 'ui-monospace' },
          callback: (value: string | number) => '$' + Number(value).toLocaleString(),
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: !disableZoom,  // Disable tooltip when zoom is disabled (embedded view)
        backgroundColor: 'rgba(24, 24, 27, 0.98)',
        borderColor: '#3f3f46',
        borderWidth: 1,
        titleColor: '#a1a1aa',
        bodyColor: '#e4e4e7',
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        titleFont: {
          size: 11,
          family: 'ui-monospace',
        },
        bodyFont: {
          size: 12,
          family: 'ui-monospace',
        },
        callbacks: {
          title: (context: any) => {
            if (!context[0]?.raw) return ''
            const timestamp = context[0].raw.x
            return new Date(timestamp).toLocaleString('de-DE', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
            })
          },
          label: (context: any) => {
            const raw = context.raw
            if (!raw || typeof raw.o === 'undefined') return ''
            const { o, h, l, c } = raw
            const change = ((c - o) / o * 100).toFixed(2)
            const changeSign = c >= o ? '+' : ''
            const changeColor = c >= o ? '🟢' : '🔴'
            return [
              `Open:  $${o?.toLocaleString()}`,
              `High:  $${h?.toLocaleString()}`,
              `Low:   $${l?.toLocaleString()}`,
              `Close: $${c?.toLocaleString()}`,
              `${changeColor} ${changeSign}${change}%`
            ]
          },
        },
      },
      annotation: {
        annotations,
      },
      zoom: disableZoom ? {
        pan: { enabled: false },
        zoom: { wheel: { enabled: false }, pinch: { enabled: false }, drag: { enabled: false } },
      } : {
        pan: {
          enabled: true,
          mode: 'x' as const,  // Only pan horizontally (more natural for charts)
          threshold: 5,        // Minimum pixels before pan starts
        },
        zoom: {
          wheel: {
            enabled: true,
            speed: 0.1,        // Slower zoom for more control
          },
          pinch: {
            enabled: true,
          },
          drag: {
            enabled: true,
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderColor: 'rgba(59, 130, 246, 0.8)',
            borderWidth: 1,
            modifierKey: 'shift' as const,  // Hold Shift to drag-zoom
          },
          mode: 'x' as const,  // Only zoom horizontally
        },
        limits: {
          x: {
            minRange: 1000 * 60 * 60 * 4,  // Minimum 4 hours visible
          },
        },
      },
    },
  }), [annotations, timeframe, disableZoom])

  if (!isMounted || ohlcData.length === 0) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-zinc-900/50 rounded-lg">
        <div className="text-zinc-500">
          {ohlcData.length === 0 ? 'Keine Daten verfügbar' : 'Chart lädt...'}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-[600px] bg-zinc-950 rounded-lg p-4 relative">
      {/* Chart Controls - only show when zoom is enabled */}
      {!disableZoom && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 hidden sm:inline">
            Drag: Pan • Scroll: Zoom • Shift+Drag: Select
          </span>
          <button
            onClick={resetZoom}
            className="px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
          >
            Reset Zoom
          </button>
        </div>
      )}
      
      <Chart
        ref={chartRef}
        type="candlestick"
        data={chartData}
        options={options}
      />
    </div>
  )
}

