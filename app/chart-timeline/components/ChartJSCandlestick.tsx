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

// Custom crosshair plugin - vertical and horizontal lines at cursor
const crosshairPlugin = {
  id: 'crosshair',
  afterEvent: (chart: any, args: any) => {
    const event = args.event
    if (event.type === 'mousemove') {
      chart._crosshairX = event.x
      chart._crosshairY = event.y
      chart.draw()
    } else if (event.type === 'mouseout') {
      chart._crosshairX = null
      chart._crosshairY = null
      chart.draw()
    }
  },
  afterDraw: (chart: any) => {
    if (chart._crosshairX && chart._crosshairY) {
      const ctx = chart.ctx
      const x = chart._crosshairX
      const y = chart._crosshairY
      const xAxis = chart.scales.x
      const yAxis = chart.scales.y
      
      // Only draw if cursor is within chart area
      if (y >= yAxis.top && y <= yAxis.bottom && x >= xAxis.left && x <= xAxis.right) {
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
        
        // Vertical line
        ctx.beginPath()
        ctx.moveTo(x, yAxis.top)
        ctx.lineTo(x, yAxis.bottom)
        ctx.stroke()
        
        // Horizontal line
        ctx.beginPath()
        ctx.moveTo(xAxis.left, y)
        ctx.lineTo(xAxis.right, y)
        ctx.stroke()
        
        ctx.restore()
      }
    }
  }
}

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
  zoomPlugin,
  crosshairPlugin
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
  minLineLength?: number  // Minimum line length as percentage of price range (default: 0.15 = 15%)
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

export function ChartJSCandlestick({ ohlcData, events, timeframe, disableZoom = false, minLineLength = 0.20 }: ChartJSCandlestickProps) {
  const chartRef = useRef<ChartJS>(null)
  const [isMounted, setIsMounted] = useState(false)
  const hasInitialZoom = useRef(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Set default zoom 2 steps out so all text boxes are visible (only once on initial load)
  useEffect(() => {
    if (isMounted && chartRef.current && ohlcData.length > 0 && !hasInitialZoom.current) {
      // Wait for chart to fully render, then zoom out 2 steps (0.8 * 0.8 = 0.64)
      const timer = setTimeout(() => {
        if (chartRef.current) {
          chartRef.current.zoom(0.64)
          hasInitialZoom.current = true
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isMounted, ohlcData.length])

  // Zoom controls
  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom()
    }
  }
  
  const zoomIn = () => {
    if (chartRef.current) {
      chartRef.current.zoom(1.2)  // Zoom in 20%
    }
  }
  
  const zoomOut = () => {
    if (chartRef.current) {
      chartRef.current.zoom(0.8)  // Zoom out 20%
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
        yAxisID: 'y',  // Bind to left axis
      }]
    }
  }, [ohlcData])
  
  // Calculate price range for syncing axes
  const priceRange = useMemo(() => {
    if (ohlcData.length === 0) return { min: 0, max: 100000 }
    const prices = ohlcData.flatMap(c => [c.high, c.low])
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const padding = (max - min) * 0.05
    return { min: min - padding, max: max + padding }
  }, [ohlcData])

  // Create annotations from events
  const annotations = useMemo(() => {
    const result: Record<string, any> = {}
    
    // Calculate price bounds
    const minPrice = ohlcData.length > 0 ? Math.min(...ohlcData.map(c => c.low)) : 80000
    const maxPrice = ohlcData.length > 0 ? Math.max(...ohlcData.map(c => c.high)) : 100000
    const priceRange = maxPrice - minPrice || 1000
    
    // Small horizontal offset (for slight angle)
    const smallXOffset = timeframe === '15m' ? 3600000 * 0.5 :   // 30 min
                        timeframe === '1H' ? 3600000 * 1 :       // 1 hour
                        timeframe === '4H' ? 3600000 * 2 :       // 2 hours
                        3600000 * 6                              // 6 hours
    
    // Track placed labels to avoid overlap and balance distribution
    interface PlacedLabel {
      x: number
      y: number
      isAbove: boolean
    }
    const placedLabels: PlacedLabel[] = []
    
    // Time window for balancing above/below
    const balanceTimeWindow = smallXOffset * 6  // ~3 hours for 15m
    
    // Overlap detection - more strict
    const xOverlapThreshold = smallXOffset * 2.5
    const yOverlapThreshold = priceRange * 0.055
    
    function hasOverlap(x: number, y: number): boolean {
      return placedLabels.some(label => 
        Math.abs(x - label.x) < xOverlapThreshold && 
        Math.abs(y - label.y) < yOverlapThreshold
      )
    }
    
    // Count nearby labels above vs below
    function getNearbyBalance(x: number): { above: number; below: number } {
      const nearby = placedLabels.filter(l => Math.abs(l.x - x) < balanceTimeWindow)
      return {
        above: nearby.filter(l => l.isAbove).length,
        below: nearby.filter(l => !l.isAbove).length
      }
    }
    
    events
      .filter(e => e.title && e.date && e.time)
      .forEach((event, idx) => {
        const candle = findClosestCandle(event.date, event.time, ohlcData)
        if (!candle) return

        const config = typeConfig[event.priceContext as keyof typeof typeConfig] || typeConfig.analysis
        
        // Base vertical offset - longer minimum line with randomness
        const idHash = event.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
        const randomFactor = 0.12 + (idHash % 10) * 0.015  // 12% to 25.5% of range
        const baseOffset = priceRange * randomFactor
        
        // Horizontal offset - vary to spread labels
        const xPatterns = [1, -1, 0.6, -0.6, 1.3, -1.3, 0.3, -0.3]
        const xMult = xPatterns[(idx + idHash) % xPatterns.length]
        const labelX = candle.timestamp + (smallXOffset * xMult)
        
        // Check balance of nearby labels
        const balance = getNearbyBalance(candle.timestamp)
        const totalNearby = balance.above + balance.below
        
        // Room available (but we'll use this less aggressively)
        const roomAbove = maxPrice - candle.high
        const roomBelow = candle.low - minPrice
        const minRoom = baseOffset * 0.3  // Very small minimum
        
        // PRIORITY 1: Balance nearby labels - this is most important
        let isAbove: boolean
        
        if (totalNearby === 0) {
          // First label in area - alternate by index
          isAbove = idx % 2 === 0
        } else if (balance.above > balance.below) {
          // More above - put below if there's ANY room
          isAbove = roomBelow < minRoom  // Only go above if literally no room below
        } else if (balance.below > balance.above) {
          // More below - put above if there's ANY room
          isAbove = roomAbove >= minRoom  // Go above if any room
        } else {
          // Equal balance - alternate by index
          isAbove = idx % 2 === 0
        }
        
        // PRIORITY 2: Only force direction if absolutely no room (very tight)
        if (roomBelow < minRoom && roomAbove >= minRoom) {
          isAbove = true
        } else if (roomAbove < minRoom && roomBelow >= minRoom) {
          isAbove = false
        }
        
        // Calculate label Y position - relative to candle high/low
        let labelY: number
        let stackLevel = 0
        
        do {
          const stackOffset = priceRange * 0.05 * stackLevel
          
          if (isAbove) {
            // Label above: start from candle HIGH
            labelY = candle.high + baseOffset + stackOffset
            // Make sure we don't go too far above
            if (labelY > maxPrice + priceRange * 0.25) {
              isAbove = false
              stackLevel = 0
              continue
            }
          } else {
            // Label below: start from candle LOW
            labelY = candle.low - baseOffset - stackOffset
            // Make sure we don't go too far below - if so, force above
            if (labelY < minPrice - priceRange * 0.1) {
              isAbove = true
              labelY = candle.high + baseOffset + stackOffset
            }
          }
          
          if (!hasOverlap(labelX, labelY)) break
          
          stackLevel++
          // After a few stacks, try flipping
          if (stackLevel === 2) {
            isAbove = !isAbove
            stackLevel = 0
          }
        } while (stackLevel < 4)
        
        // Record position with direction
        placedLabels.push({ x: labelX, y: labelY, isAbove })
        
        // Dot position: HIGH of candle if label above, LOW if label below
        const dotY = isAbove ? candle.high : candle.low

        // Line from dot (on candle) to label - dashed
        result[`line-${event.id}`] = {
          type: 'line',
          xMin: candle.timestamp,
          xMax: labelX,
          yMin: dotY,
          yMax: labelY,
          borderColor: config.dotColor,
          borderWidth: 1.5,
          borderDash: [4, 4],
        }

        // Point annotation at candle high/low
        result[`point-${event.id}`] = {
          type: 'point',
          xValue: candle.timestamp,
          yValue: dotY,
          radius: 5,
          backgroundColor: config.dotColor,
          borderColor: 'rgba(0,0,0,0.5)',
          borderWidth: 1.5,
        }

        // Label annotation (the quote card) with hover effects
        const truncatedQuote = event.title.length > 32 ? event.title.slice(0, 32) + '...' : event.title
        result[`label-${event.id}`] = {
          type: 'label',
          xValue: labelX,
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
          z: 10,  // Base z-index
          enter: (ctx: any) => {
            // Bring to front on hover - only z-index and border
            ctx.element.options.z = 1000
            ctx.element.options.borderWidth = 2
            ctx.chart.draw()
          },
          leave: (ctx: any) => {
            // Reset on leave
            ctx.element.options.z = 10
            ctx.element.options.borderWidth = 1
            ctx.chart.draw()
          },
        }
      })

    return result
  }, [events, ohlcData, timeframe, minLineLength])

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
        min: priceRange.min,
        max: priceRange.max,
        grid: {
          color: '#1f1f23',
          drawBorder: false,
        },
        ticks: {
          color: '#6b7280',
          font: { size: 10, family: 'ui-monospace' },
          callback: (value: string | number) => Number(value).toLocaleString(),
        },
      },
      y2: {
        position: 'right' as const,
        min: priceRange.min,
        max: priceRange.max,
        grid: {
          drawOnChartArea: false,  // Don't draw grid lines from right axis
          drawBorder: false,
        },
        ticks: {
          color: '#6b7280',
          font: { size: 10, family: 'ui-monospace' },
          callback: (value: string | number) => Number(value).toLocaleString(),
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,  // Disabled - using crosshair instead
      },
      annotation: {
        annotations,
      },
      zoom: disableZoom ? {
        // Disable scroll/pinch zoom but keep pan and button zoom working
        pan: { 
          enabled: true,
          mode: 'xy' as const,  // Pan in all directions
          threshold: 5,
          scaleMode: 'xy' as const,  // Allow scaling when dragging on axes
        },
        zoom: { 
          wheel: { enabled: false }, 
          pinch: { enabled: false }, 
          drag: { enabled: false },
          mode: 'xy' as const,
        },
        limits: {
          x: {
            minRange: 1000 * 60 * 60 * 4,  // Minimum 4 hours visible
          },
        },
      } : {
        pan: {
          enabled: true,
          mode: 'xy' as const,  // Pan in all directions
          threshold: 5,
          scaleMode: 'xy' as const,  // Allow scaling when dragging on axes
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
          mode: 'xy' as const,  // Zoom in all directions
        },
        limits: {
          x: {
            minRange: 1000 * 60 * 60 * 4,  // Minimum 4 hours visible
          },
        },
      },
    },
  }), [annotations, timeframe, disableZoom, priceRange])

  if (!isMounted || ohlcData.length === 0) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-zinc-900/50 rounded-lg">
        <div className="text-zinc-500">
          {ohlcData.length === 0 ? 'Keine Daten verfügbar' : 'Chart lädt...'}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[400px] bg-zinc-950 rounded-lg p-4 relative">
      {/* Chart Controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        {!disableZoom && (
          <span className="text-[10px] text-zinc-500 hidden sm:inline">
            Drag: Pan • Scroll: Zoom
          </span>
        )}
        <div className="flex items-center gap-1 bg-zinc-800 rounded border border-zinc-700">
          <button
            onClick={zoomOut}
            className="px-2 py-1 text-sm font-mono text-zinc-300 hover:bg-zinc-700 rounded-l transition-colors"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={resetZoom}
            className="px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700 transition-colors border-x border-zinc-700"
            title="Reset zoom"
          >
            Reset
          </button>
          <button
            onClick={zoomIn}
            className="px-2 py-1 text-sm font-mono text-zinc-300 hover:bg-zinc-700 rounded-r transition-colors"
            title="Zoom in"
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

