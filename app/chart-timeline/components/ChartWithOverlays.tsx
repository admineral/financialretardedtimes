'use client'

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'
import { motion, AnimatePresence } from 'framer-motion'
import { typeConfig } from './QuoteCard'

const ReactApexChart = dynamic(() => import('react-apexcharts'), { 
  ssr: false,
  loading: () => <div className="w-full h-[600px] bg-zinc-900/50 animate-pulse rounded-lg" />
})

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

type Timeframe = '15m' | '1H' | '1D' | '1W' | '1M'

interface ChartWithOverlaysProps {
  ohlcData: OHLCData[]
  events: TimelineEvent[]
  timeframe: Timeframe
}

interface PositionedEvent extends TimelineEvent {
  x: number
  dotY: number
  cardY: number
  isAbove: boolean
  visible: boolean
}

function findClosestCandle(date: string, time: string, ohlcData: OHLCData[]): { candle: OHLCData; index: number } | null {
  if (ohlcData.length === 0) return null
  
  const eventTime = new Date(`${date}T${time}:00`).getTime()
  
  let closestIdx = 0
  let minDiff = Math.abs(ohlcData[0].timestamp - eventTime)
  
  for (let i = 0; i < ohlcData.length; i++) {
    const diff = Math.abs(ohlcData[i].timestamp - eventTime)
    if (diff < minDiff) {
      minDiff = diff
      closestIdx = i
    }
  }
  
  return { candle: ohlcData[closestIdx], index: closestIdx }
}

function InlineQuoteCard({ 
  type, 
  quote, 
  username, 
  time,
}: { 
  type: string
  quote: string
  username: string
  time: string
}) {
  const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.analysis
  const truncatedQuote = quote.length > 40 ? quote.slice(0, 40) + '...' : quote
  
  return (
    <div 
      className="rounded-md overflow-hidden shadow-xl pointer-events-auto"
      style={{ 
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        minWidth: 140,
        maxWidth: 180,
      }}
    >
      <div 
        className="flex items-center justify-between px-2 py-0.5"
        style={{ 
          backgroundColor: `${config.dotColor}30`,
          borderBottom: `1px solid ${config.border}`,
        }}
      >
        <span className="text-[8px] font-bold tracking-wider" style={{ color: config.text }}>
          {config.label}
        </span>
        <span className="text-[8px] font-mono text-white/50">
          {time?.slice(0, 5)}
        </span>
      </div>
      <div className="px-2 py-1">
        <p className="text-[9px] leading-tight text-white/90">{truncatedQuote}</p>
      </div>
      <div className="px-2 py-0.5 text-[8px] text-white/50" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
        @{username}
      </div>
    </div>
  )
}

export function ChartWithOverlays({ ohlcData, events, timeframe }: ChartWithOverlaysProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [positionedEvents, setPositionedEvents] = useState<PositionedEvent[]>([])
  const [isMounted, setIsMounted] = useState(false)
  const [chartOffset, setChartOffset] = useState({ left: 0, top: 0 })

  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  const series = useMemo(() => [{
    name: 'BTC/USD',
    data: ohlcData.map(candle => ({
      x: new Date(candle.timestamp),
      y: [candle.open, candle.high, candle.low, candle.close]
    }))
  }], [ohlcData])

  const priceRange = useMemo(() => {
    if (ohlcData.length === 0) return { min: 0, max: 100000 }
    const highs = ohlcData.map(c => c.high)
    const lows = ohlcData.map(c => c.low)
    const max = Math.max(...highs)
    const min = Math.min(...lows)
    const range = max - min
    return { min: min - range * 0.1, max: max + range * 0.1 }
  }, [ohlcData])

  // Map events to candle indices
  const eventCandleMap = useMemo(() => {
    return events
      .filter(e => e.title && e.date && e.time)
      .slice(0, 8)
      .map(event => {
        const result = findClosestCandle(event.date, event.time, ohlcData)
        return result ? { event, candleIndex: result.index, candle: result.candle } : null
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
  }, [events, ohlcData])

  // Calculate positions by reading actual candle positions from SVG
  const calculatePositions = useCallback(() => {
    if (!containerRef.current || eventCandleMap.length === 0) return

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const chartArea = container.querySelector('.apexcharts-inner') as SVGGElement
    
    if (!chartArea) return

    const chartRect = chartArea.getBoundingClientRect()
    setChartOffset({
      left: chartRect.left - containerRect.left,
      top: chartRect.top - containerRect.top
    })

    // Get all candlestick paths
    const candlePaths = chartArea.querySelectorAll('.apexcharts-candlestick-area')
    
    if (candlePaths.length === 0) return

    const LINE_LENGTH = 100
    const CARD_HEIGHT = 55
    const positioned: PositionedEvent[] = []
    const occupiedRegions: { x: number; y: number }[] = []

    eventCandleMap.forEach(({ event, candleIndex }, idx) => {
      const candlePath = candlePaths[candleIndex] as SVGPathElement
      if (!candlePath) return

      // Get the bounding box of this candle
      try {
        const bbox = candlePath.getBBox()
        const candleCenter = bbox.x + bbox.width / 2
        const candleTop = bbox.y
        const candleBottom = bbox.y + bbox.height
        
        // Determine if card goes above or below
        let isAbove = idx % 2 === 0
        let level = 0
        
        // Find non-overlapping position
        for (let l = 0; l < 4; l++) {
          const testY = isAbove 
            ? candleTop - LINE_LENGTH - (CARD_HEIGHT * l)
            : candleBottom + LINE_LENGTH + (CARD_HEIGHT * l)
          
          const hasOverlap = occupiedRegions.some(region => 
            Math.abs(region.x - candleCenter) < 160 && Math.abs(region.y - testY) < CARD_HEIGHT
          )
          
          if (!hasOverlap) {
            level = l
            break
          }
          if (l === 0) isAbove = !isAbove
        }

        const cardY = isAbove 
          ? candleTop - LINE_LENGTH - (CARD_HEIGHT * level)
          : candleBottom + LINE_LENGTH + (CARD_HEIGHT * level)

        const dotY = isAbove ? candleTop : candleBottom

        occupiedRegions.push({ x: candleCenter, y: cardY })

        positioned.push({
          ...event,
          x: candleCenter + (chartRect.left - containerRect.left),
          dotY: dotY + (chartRect.top - containerRect.top),
          cardY: cardY + (chartRect.top - containerRect.top),
          isAbove,
          visible: candleCenter >= 0 && candleCenter <= chartRect.width
        })
      } catch (e) {
        // getBBox can fail if element not rendered
      }
    })

    setPositionedEvents(positioned)
  }, [eventCandleMap])

  // Set up observers for chart changes
  useEffect(() => {
    if (!isMounted || !containerRef.current) return

    let rafId: number
    const debouncedCalculate = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(calculatePositions)
    }

    // Initial calculation with delays
    const timers = [
      setTimeout(debouncedCalculate, 500),
      setTimeout(debouncedCalculate, 1000),
      setTimeout(debouncedCalculate, 2000),
    ]

    // Resize observer
    const resizeObserver = new ResizeObserver(debouncedCalculate)
    resizeObserver.observe(containerRef.current)

    // Mutation observer for SVG changes (zoom, pan)
    const mutationObserver = new MutationObserver(debouncedCalculate)
    
    const setupMutationObserver = () => {
      const chartArea = containerRef.current?.querySelector('.apexcharts-inner')
      if (chartArea) {
        mutationObserver.observe(chartArea, { 
          attributes: true, 
          childList: true, 
          subtree: true,
          attributeFilter: ['transform', 'd', 'x', 'y', 'width', 'height']
        })
      }
    }
    
    // Wait for chart to render then setup mutation observer
    setTimeout(setupMutationObserver, 1000)

    return () => {
      cancelAnimationFrame(rafId)
      timers.forEach(clearTimeout)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [isMounted, calculatePositions, ohlcData])

  const options: ApexOptions = useMemo(() => ({
    chart: {
      type: 'candlestick',
      height: 600,
      background: 'transparent',
      id: 'btc-timeline-chart',
      toolbar: {
        show: true,
        tools: {
          download: false,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true
        },
        autoSelected: 'pan'
      },
      zoom: {
        enabled: true,
        type: 'xy',
        autoScaleYaxis: true
      },
      animations: { enabled: false },
    },
    theme: { mode: 'dark' },
    xaxis: {
      type: 'datetime',
      labels: {
        style: {
          colors: '#6b7280',
          fontSize: '10px',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace'
        },
        datetimeFormatter: {
          year: 'yyyy',
          month: "MMM 'yy",
          day: 'dd MMM',
          hour: 'HH:mm'
        }
      },
      axisBorder: { show: true, color: '#27272a' },
      axisTicks: { show: true, color: '#27272a' },
    },
    yaxis: {
      min: priceRange.min,
      max: priceRange.max,
      labels: {
        style: {
          colors: '#6b7280',
          fontSize: '10px',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace'
        },
        formatter: (value: number) => '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 })
      },
    },
    grid: {
      borderColor: '#18181b',
      strokeDashArray: 2,
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: '#22c55e',
          downward: '#ef4444'
        },
        wick: { useFillColor: true }
      }
    },
    tooltip: {
      enabled: true,
      theme: 'dark',
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const o = w.globals.seriesCandleO[seriesIndex]?.[dataPointIndex]
        const h = w.globals.seriesCandleH[seriesIndex]?.[dataPointIndex]
        const l = w.globals.seriesCandleL[seriesIndex]?.[dataPointIndex]
        const c = w.globals.seriesCandleC[seriesIndex]?.[dataPointIndex]
        if (o === undefined) return ''
        const change = ((c - o) / o * 100).toFixed(2)
        const changeColor = c >= o ? '#22c55e' : '#ef4444'
        return `
          <div style="padding: 8px 12px; background: rgba(24,24,27,0.95); border: 1px solid #3f3f46; border-radius: 6px; font-size: 11px;">
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-family: ui-monospace;">
              <span style="color: #71717a;">O</span><span style="color: #e4e4e7;">$${o?.toLocaleString()}</span>
              <span style="color: #71717a;">H</span><span style="color: #22c55e;">$${h?.toLocaleString()}</span>
              <span style="color: #71717a;">L</span><span style="color: #ef4444;">$${l?.toLocaleString()}</span>
              <span style="color: #71717a;">C</span><span style="color: #e4e4e7;">$${c?.toLocaleString()}</span>
            </div>
            <div style="margin-top: 6px; text-align: center; color: ${changeColor}; font-weight: 600;">${c >= o ? '+' : ''}${change}%</div>
          </div>
        `
      }
    },
  }), [priceRange])

  if (ohlcData.length === 0) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center text-zinc-500">
        Keine Daten verfügbar
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden" style={{ minHeight: 600 }}>
      {isMounted && (
        <ReactApexChart
          options={options}
          series={series}
          type="candlestick"
          height={600}
        />
      )}
      
      {/* Quote overlays */}
      <div className="absolute inset-0 pointer-events-none">
        <AnimatePresence>
          {positionedEvents.filter(e => e.visible).map((event, idx) => {
            const config = typeConfig[event.priceContext as keyof typeof typeConfig] || typeConfig.analysis
            const lineLength = Math.abs(event.cardY - event.dotY)
            
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute"
                style={{
                  left: event.x,
                  top: 0,
                  transform: 'translateX(-50%)',
                  zIndex: 20 + idx,
                }}
              >
                {/* Connection line */}
                <svg
                  className="absolute pointer-events-none"
                  style={{
                    left: '50%',
                    transform: 'translateX(-50%)',
                    top: Math.min(event.cardY, event.dotY),
                    width: 2,
                    height: lineLength,
                  }}
                >
                  <line
                    x1="1" y1="0" x2="1" y2={lineLength}
                    stroke={config.dotColor}
                    strokeWidth="1"
                    strokeDasharray="4,4"
                    opacity="0.7"
                  />
                </svg>
                
                {/* Dot at candle */}
                <div 
                  className="absolute rounded-full"
                  style={{
                    left: '50%',
                    top: event.dotY,
                    transform: 'translate(-50%, -50%)',
                    width: 7,
                    height: 7,
                    backgroundColor: config.dotColor,
                    boxShadow: `0 0 6px ${config.dotColor}`,
                    border: '1.5px solid rgba(0,0,0,0.5)'
                  }}
                />
                
                {/* Card */}
                <div
                  className="absolute"
                  style={{
                    left: '50%',
                    transform: 'translateX(-50%)',
                    top: event.isAbove ? event.cardY - 50 : event.cardY,
                  }}
                >
                  <InlineQuoteCard
                    type={event.priceContext || 'analysis'}
                    quote={event.title}
                    username={event.participants[0] || 'Anon'}
                    time={event.time}
                  />
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
