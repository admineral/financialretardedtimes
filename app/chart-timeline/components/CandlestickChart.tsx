'use client'

import { useMemo } from 'react'
import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'

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

interface CandlestickChartProps {
  ohlcData: OHLCData[]
  events: TimelineEvent[]
  timeframe: Timeframe
}

// Get style for price context
function getContextStyle(context?: string) {
  switch (context) {
    case 'pump_call':
    case 'bottom_call':
      return { bg: '#065f46', border: '#10b981', text: '#6ee7b7', label: 'PUMP CALL' }
    case 'dump_call':
    case 'top_call':
      return { bg: '#7f1d1d', border: '#ef4444', text: '#fca5a5', label: 'DUMP CALL' }
    case 'fomo':
      return { bg: '#78350f', border: '#f59e0b', text: '#fcd34d', label: 'FOMO' }
    case 'panic':
      return { bg: '#7c2d12', border: '#f97316', text: '#fdba74', label: 'PANIK' }
    case 'diamond_hands':
      return { bg: '#1e3a8a', border: '#3b82f6', text: '#93c5fd', label: 'DIAMOND HANDS' }
    case 'reversal':
      return { bg: '#581c87', border: '#a855f7', text: '#d8b4fe', label: 'REVERSAL' }
    case 'analysis':
      return { bg: '#164e63', border: '#06b6d4', text: '#67e8f9', label: 'ANALYSE' }
    case 'sideways':
      return { bg: '#374151', border: '#6b7280', text: '#d1d5db', label: 'SEITWÄRTS' }
    default:
      return { bg: '#374151', border: '#6b7280', text: '#d1d5db', label: 'ZITAT' }
  }
}

// Find closest candle to event
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

export function CandlestickChart({ ohlcData, events }: CandlestickChartProps) {
  // Transform OHLC data for ApexCharts
  const series = useMemo(() => [{
    name: 'BTC/USD',
    data: ohlcData.map(candle => ({
      x: new Date(candle.timestamp),
      y: [candle.open, candle.high, candle.low, candle.close]
    }))
  }], [ohlcData])

  // Calculate price range for positioning
  const priceRange = useMemo(() => {
    if (ohlcData.length === 0) return { min: 0, max: 100000, range: 100000 }
    const highs = ohlcData.map(c => c.high)
    const lows = ohlcData.map(c => c.low)
    const max = Math.max(...highs)
    const min = Math.min(...lows)
    const range = max - min
    return { min, max, range }
  }, [ohlcData])

  // Create annotations with styled cards inside chart
  const annotations = useMemo(() => {
    const pointAnnotations: ApexOptions['annotations'] = { 
      points: [],
      xaxis: []
    }
    
    if (ohlcData.length === 0 || events.length === 0) return pointAnnotations

    // Process events
    const validEvents = events
      .filter(e => e.title && e.date && e.time)
      .slice(0, 12) // Limit to avoid overcrowding

    validEvents.forEach((event, idx) => {
      const candle = findClosestCandle(event.date, event.time, ohlcData)
      if (!candle) return
      
      const style = getContextStyle(event.priceContext)
      const shortTime = event.time?.slice(0, 5) || ''
      
      // Truncate quote
      const shortQuote = event.title.length > 35 ? event.title.slice(0, 35) + '...' : event.title
      
      // Position cards at different heights - alternate high/low with offsets
      const isTop = idx % 2 === 0
      const offsetMultiplier = Math.floor(idx / 2) % 3 // Creates 3 different offset levels
      const baseOffset = priceRange.range * 0.15 // Base offset from price
      const additionalOffset = priceRange.range * 0.08 * offsetMultiplier
      
      // Calculate Y position - cards positioned above or below with staggered heights
      let yPosition: number
      if (isTop) {
        yPosition = candle.high + baseOffset + additionalOffset
      } else {
        yPosition = candle.low - baseOffset - additionalOffset
      }
      
      // Clamp to chart range with padding
      const maxY = priceRange.max + priceRange.range * 0.35
      const minY = priceRange.min - priceRange.range * 0.35
      yPosition = Math.max(minY, Math.min(maxY, yPosition))

      // Add vertical line annotation (Fahnenstange/flagpole) - dotted line
      pointAnnotations.xaxis!.push({
        x: candle.timestamp,
        strokeDashArray: 3,
        borderColor: style.border,
        borderWidth: 1,
        label: {
          text: '',
        }
      })

      // Add the card annotation
      pointAnnotations.points!.push({
        x: candle.timestamp,
        y: yPosition,
        marker: {
          size: 0, // Hide default marker
        },
        label: {
          borderColor: style.border,
          borderWidth: 2,
          borderRadius: 4,
          text: `${style.label}  ${shortTime}\n${shortQuote}\n@${event.participants[0] || '?'}`,
          offsetY: 0,
          style: {
            background: style.bg,
            color: '#fff',
            fontSize: '10px',
            fontWeight: 500,
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            padding: {
              left: 8,
              right: 8,
              top: 6,
              bottom: 6
            }
          }
        }
      })

      // Add small dot at the actual price point
      const pricePoint = event.priceAtQuote || (isTop ? candle.high : candle.low)
      pointAnnotations.points!.push({
        x: candle.timestamp,
        y: pricePoint,
        marker: {
          size: 5,
          fillColor: style.border,
          strokeColor: '#1f2937',
          strokeWidth: 2,
        },
        label: {
          text: '',
          borderWidth: 0,
        }
      })
    })

    return pointAnnotations
  }, [ohlcData, events, priceRange])

  // Chart options
  const options: ApexOptions = useMemo(() => ({
    chart: {
      type: 'candlestick',
      height: 600,
      background: 'transparent',
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
        type: 'x',
        autoScaleYaxis: false // Keep Y axis stable for annotations
      },
      animations: {
        enabled: false
      }
    },
    theme: { mode: 'dark' },
    xaxis: {
      type: 'datetime',
      labels: {
        style: {
          colors: '#9ca3af',
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
      axisBorder: { show: true, color: '#374151' },
      axisTicks: { show: true, color: '#374151' },
    },
    yaxis: {
      min: priceRange.min - priceRange.range * 0.4, // Extra space for bottom cards
      max: priceRange.max + priceRange.range * 0.4, // Extra space for top cards
      labels: {
        style: {
          colors: '#9ca3af',
          fontSize: '10px',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace'
        },
        formatter: (value: number) => '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 })
      },
    },
    grid: {
      borderColor: '#1f2937',
      strokeDashArray: 3,
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: '#10b981',
          downward: '#ef4444'
        },
        wick: { useFillColor: true }
      }
    },
    annotations: annotations,
    tooltip: {
      enabled: true,
      theme: 'dark',
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const o = w.globals.seriesCandleO[seriesIndex][dataPointIndex]
        const h = w.globals.seriesCandleH[seriesIndex][dataPointIndex]
        const l = w.globals.seriesCandleL[seriesIndex][dataPointIndex]
        const c = w.globals.seriesCandleC[seriesIndex][dataPointIndex]
        const change = ((c - o) / o * 100).toFixed(2)
        const changeColor = c >= o ? '#10b981' : '#ef4444'
        
        return `
          <div style="padding: 8px 12px; background: #1f2937; border: 1px solid #374151; border-radius: 6px; font-size: 12px;">
            <div style="color: #9ca3af; margin-bottom: 4px;">BTC/USD</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; font-family: ui-monospace;">
              <span style="color: #6b7280;">O:</span><span style="color: #e5e7eb;">$${o.toLocaleString()}</span>
              <span style="color: #6b7280;">H:</span><span style="color: #10b981;">$${h.toLocaleString()}</span>
              <span style="color: #6b7280;">L:</span><span style="color: #ef4444;">$${l.toLocaleString()}</span>
              <span style="color: #6b7280;">C:</span><span style="color: #e5e7eb;">$${c.toLocaleString()}</span>
            </div>
            <div style="margin-top: 6px; text-align: center; color: ${changeColor}; font-weight: bold;">${change}%</div>
          </div>
        `
      }
    },
  }), [annotations, priceRange])

  if (ohlcData.length === 0) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center text-muted-foreground">
        Keine Daten verfügbar
      </div>
    )
  }

  return (
    <div className="w-full">
      <Chart
        options={options}
        series={series}
        type="candlestick"
        height={600}
      />
    </div>
  )
}
