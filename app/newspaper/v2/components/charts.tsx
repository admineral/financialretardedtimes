'use client'

/**
 * charts.tsx (Newspaper v2)
 *
 * Lightweight, self-contained SVG charts for the data components.
 * All values come from the deterministic V2Data payload — never from the AI.
 * Colors read the v2 theme variables so day/dark mode both work.
 */

import { useMemo } from 'react'
import type { V2ActivityPoint, V2Candle, V2FearGreedPoint, V2SentimentPoint } from '../lib/types'

const INK_SOFT = 'hsl(var(--v2-ink) / 0.45)'
const RULE = 'hsl(var(--v2-rule) / 0.3)'
const KICKER = 'hsl(var(--v2-kicker))'
const UP = 'hsl(var(--v2-up))'
const DOWN = 'hsl(var(--v2-down))'

const CANDLE_PAD = { top: 16, right: 64, bottom: 26, left: 8 }
const SENT_PAD = { top: 18, right: 64, bottom: 26, left: 34 }

function formatPrice(value: number): string {
  return `$${Math.round(value).toLocaleString('de-DE')}`
}

function formatDayShort(dateKey: string): string {
  const [, month, day] = dateKey.split('-')
  return `${day}.${month}.`
}

export interface ChartAnnotation {
  date: string
  text: string
}

// ═══════════════════════════════════════════════════════════════════════
// BTC candlestick chart (30 days, 4H candles)
// ═══════════════════════════════════════════════════════════════════════

export function CandleChart({
  candles,
  annotations = []
}: {
  candles: V2Candle[]
  annotations?: ChartAnnotation[]
}) {
  const W = 860
  const H = 300

  const layout = useMemo(() => {
    if (candles.length === 0) return null
    const min = Math.min(...candles.map(c => c.low))
    const max = Math.max(...candles.map(c => c.high))
    const span = max - min || 1
    const innerW = W - CANDLE_PAD.left - CANDLE_PAD.right
    const innerH = H - CANDLE_PAD.top - CANDLE_PAD.bottom
    const step = innerW / candles.length
    const x = (i: number) => CANDLE_PAD.left + i * step + step / 2
    const y = (price: number) => CANDLE_PAD.top + innerH - ((price - min) / span) * innerH
    return { min, max, x, y, step, innerH }
  }, [candles])

  if (!layout || candles.length === 0) {
    return <div className="py-10 text-center text-xs" style={{ color: INK_SOFT }}>Keine Kerzendaten verfügbar.</div>
  }

  const { min, max, x, y, step } = layout
  const last = candles[candles.length - 1]

  const annotationMarkers = annotations
    .map(annotation => {
      const dayStart = new Date(`${annotation.date}T00:00:00Z`).getTime() - 12 * 3600 * 1000
      const dayEnd = dayStart + 48 * 3600 * 1000
      const index = candles.findIndex(c => c.timestamp >= dayStart && c.timestamp <= dayEnd)
      if (index < 0) return null
      return { x: x(index), text: annotation.text, date: annotation.date }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .slice(0, 6)

  const dateTickEvery = Math.max(1, Math.floor(candles.length / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="BTC Kerzenchart der letzten 30 Tage">
      {/* horizontal grid */}
      {[0.25, 0.5, 0.75].map(f => {
        const price = min + (max - min) * f
        return (
          <g key={f}>
            <line x1={CANDLE_PAD.left} x2={W - CANDLE_PAD.right} y1={y(price)} y2={y(price)} stroke={RULE} strokeDasharray="3 4" />
            <text x={W - CANDLE_PAD.right + 6} y={y(price) + 3} fontSize="10" fill={INK_SOFT} fontFamily="monospace">
              {formatPrice(price)}
            </text>
          </g>
        )
      })}

      {/* candles */}
      {candles.map((candle, i) => {
        const up = candle.close >= candle.open
        const color = up ? UP : DOWN
        const bodyTop = y(Math.max(candle.open, candle.close))
        const bodyBottom = y(Math.min(candle.open, candle.close))
        const bodyW = Math.max(step * 0.55, 1.5)
        return (
          <g key={candle.timestamp}>
            <line x1={x(i)} x2={x(i)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth={0.8} />
            <rect
              x={x(i) - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={Math.max(bodyBottom - bodyTop, 0.8)}
              fill={color}
            />
          </g>
        )
      })}

      {/* annotations */}
      {annotationMarkers.map((marker, i) => (
        <g key={`${marker.date}-${i}`}>
          <line x1={marker.x} x2={marker.x} y1={CANDLE_PAD.top} y2={H - CANDLE_PAD.bottom} stroke={KICKER} strokeWidth={0.8} strokeDasharray="2 3" opacity={0.7} />
          <circle cx={marker.x} cy={CANDLE_PAD.top + 4 + (i % 3) * 12} r={6} fill={KICKER} />
          <text x={marker.x} y={CANDLE_PAD.top + 7.5 + (i % 3) * 12} fontSize="8" fill="hsl(var(--background))" textAnchor="middle" fontWeight="bold">
            {i + 1}
          </text>
        </g>
      ))}

      {/* date axis */}
      {candles.map((candle, i) => {
        if (i % dateTickEvery !== 0) return null
        const date = new Date(candle.timestamp)
        const label = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })
        return (
          <text key={`tick-${candle.timestamp}`} x={x(i)} y={H - 8} fontSize="10" fill={INK_SOFT} textAnchor="middle" fontFamily="monospace">
            {label}
          </text>
        )
      })}

      {/* last price marker */}
      <line x1={CANDLE_PAD.left} x2={W - CANDLE_PAD.right} y1={y(last.close)} y2={y(last.close)} stroke={KICKER} strokeWidth={0.8} strokeDasharray="5 3" />
      <text x={W - CANDLE_PAD.right + 6} y={y(last.close) - 5} fontSize="10" fill={KICKER} fontFamily="monospace" fontWeight="bold">
        {formatPrice(last.close)}
      </text>
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sentiment timeline (chat sentiment 0-100 vs BTC close, per day)
// ═══════════════════════════════════════════════════════════════════════

export function SentimentChart({ points }: { points: V2SentimentPoint[] }) {
  const W = 860
  const H = 260

  const valid = points.filter(p => Number.isFinite(p.score))

  const layout = useMemo(() => {
    if (valid.length === 0) return null
    const innerW = W - SENT_PAD.left - SENT_PAD.right
    const innerH = H - SENT_PAD.top - SENT_PAD.bottom
    const x = (i: number) => SENT_PAD.left + (valid.length === 1 ? innerW / 2 : (i / (valid.length - 1)) * innerW)
    const ySent = (score: number) => SENT_PAD.top + innerH - (score / 100) * innerH

    const closes = valid.map(p => p.btcClose).filter((c): c is number => c !== null)
    const minC = closes.length ? Math.min(...closes) : 0
    const maxC = closes.length ? Math.max(...closes) : 1
    const spanC = maxC - minC || 1
    const yBtc = (close: number) => SENT_PAD.top + innerH - ((close - minC) / spanC) * innerH

    return { x, ySent, yBtc, innerH, hasBtc: closes.length > 1, minC, maxC }
  }, [valid])

  if (!layout || valid.length === 0) {
    return <div className="py-10 text-center text-xs" style={{ color: INK_SOFT }}>Keine Sentiment-Daten verfügbar.</div>
  }

  const { x, ySent, yBtc, hasBtc, minC, maxC } = layout

  const sentPath = valid.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${ySent(p.score).toFixed(1)}`).join(' ')
  const areaPath = `${sentPath} L ${x(valid.length - 1).toFixed(1)} ${ySent(0).toFixed(1)} L ${x(0).toFixed(1)} ${ySent(0).toFixed(1)} Z`
  const btcPath = hasBtc
    ? valid
        .map((p, i) => (p.btcClose === null ? null : `${x(i).toFixed(1)} ${yBtc(p.btcClose).toFixed(1)}`))
        .filter((s): s is string => s !== null)
        .map((coords, i) => `${i === 0 ? 'M' : 'L'} ${coords}`)
        .join(' ')
    : ''

  const tickEvery = Math.max(1, Math.floor(valid.length / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Chat-Sentiment vs. BTC über 30 Tage">
      {/* neutral line at 50 */}
      <line x1={SENT_PAD.left} x2={W - SENT_PAD.right} y1={ySent(50)} y2={ySent(50)} stroke={RULE} strokeDasharray="3 4" />
      <text x={4} y={ySent(50) + 3} fontSize="9" fill={INK_SOFT} fontFamily="monospace">50</text>
      <text x={4} y={ySent(100) + 8} fontSize="9" fill={INK_SOFT} fontFamily="monospace">Bull</text>
      <text x={4} y={ySent(0) - 2} fontSize="9" fill={INK_SOFT} fontFamily="monospace">Bear</text>

      {/* sentiment area + line */}
      <path d={areaPath} fill={KICKER} opacity={0.1} />
      <path d={sentPath} fill="none" stroke={KICKER} strokeWidth={2} />
      {valid.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={ySent(p.score)} r={2.2} fill={KICKER} />
      ))}

      {/* BTC overlay */}
      {hasBtc && (
        <>
          <path d={btcPath} fill="none" stroke={INK_SOFT} strokeWidth={1.4} strokeDasharray="5 3" />
          <text x={W - SENT_PAD.right + 6} y={SENT_PAD.top + 8} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
            BTC {formatPrice(maxC)}
          </text>
          <text x={W - SENT_PAD.right + 6} y={H - SENT_PAD.bottom} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
            {formatPrice(minC)}
          </text>
        </>
      )}

      {/* date axis */}
      {valid.map((p, i) => {
        if (i % tickEvery !== 0) return null
        return (
          <text key={`tick-${p.date}`} x={x(i)} y={H - 8} fontSize="10" fill={INK_SOFT} textAnchor="middle" fontFamily="monospace">
            {formatDayShort(p.date)}
          </text>
        )
      })}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Activity heatmap (messages per day)
// ═══════════════════════════════════════════════════════════════════════

export function ActivityBars({ points }: { points: V2ActivityPoint[] }) {
  const W = 860
  const H = 200
  const PAD = { top: 14, right: 10, bottom: 26, left: 10 }

  if (points.length === 0) {
    return <div className="py-10 text-center text-xs" style={{ color: INK_SOFT }}>Keine Aktivitätsdaten verfügbar.</div>
  }

  const max = Math.max(...points.map(p => p.messageCount), 1)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const step = innerW / points.length
  const tickEvery = Math.max(1, Math.floor(points.length / 8))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Chat-Aktivität pro Tag">
      {points.map((p, i) => {
        const h = (p.messageCount / max) * innerH
        const intensity = p.messageCount / max
        return (
          <g key={p.date}>
            <rect
              x={PAD.left + i * step + step * 0.12}
              y={PAD.top + innerH - h}
              width={step * 0.76}
              height={Math.max(h, 1)}
              fill={KICKER}
              opacity={0.25 + intensity * 0.75}
            />
            {i % tickEvery === 0 && (
              <text x={PAD.left + i * step + step / 2} y={H - 8} fontSize="10" fill={INK_SOFT} textAnchor="middle" fontFamily="monospace">
                {formatDayShort(p.date)}
              </text>
            )}
          </g>
        )
      })}
      <text x={PAD.left} y={10} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
        max {max.toLocaleString('de-DE')} Nachrichten/Tag
      </text>
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Fear & Greed history line
// ═══════════════════════════════════════════════════════════════════════

export function FearGreedLine({ history }: { history: V2FearGreedPoint[] }) {
  const W = 860
  const H = 210
  const PAD = { top: 16, right: 60, bottom: 24, left: 32 }

  if (history.length === 0) {
    return <div className="py-10 text-center text-xs" style={{ color: INK_SOFT }}>Keine Fear-&-Greed-Historie verfügbar.</div>
  }

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (history.length === 1 ? innerW / 2 : (i / (history.length - 1)) * innerW)
  const y = (index: number) => PAD.top + innerH - (index / 100) * innerH
  const path = history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.todayIndex).toFixed(1)}`).join(' ')
  const latest = history[history.length - 1]
  const tickEvery = Math.max(1, Math.floor(history.length / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Fear und Greed Verlauf">
      {[25, 50, 75].map(level => (
        <g key={level}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(level)} y2={y(level)} stroke={RULE} strokeDasharray="3 4" />
          <text x={6} y={y(level) + 3} fontSize="9" fill={INK_SOFT} fontFamily="monospace">{level}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke={KICKER} strokeWidth={2} />
      {history.map((p, i) => (
        <circle key={p.createdAt} cx={x(i)} cy={y(p.todayIndex)} r={2} fill={KICKER} />
      ))}
      <text x={W - PAD.right + 6} y={y(latest.todayIndex) + 3} fontSize="11" fill={KICKER} fontFamily="monospace" fontWeight="bold">
        {latest.todayIndex}
      </text>
      {history.map((p, i) => {
        if (i % tickEvery !== 0) return null
        const label = new Date(p.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })
        return (
          <text key={`tick-${p.createdAt}`} x={x(i)} y={H - 6} fontSize="10" fill={INK_SOFT} textAnchor="middle" fontFamily="monospace">
            {label}
          </text>
        )
      })}
    </svg>
  )
}
