'use client'

/**
 * EditionCharts.tsx (Newspaper edition v3 — genui charts)
 *
 * Self-contained SVG charts for the dataComponent blocks. Every number
 * comes from the deterministic EditionData payload — the model only picks
 * the component, the range, and writes commentary/annotations.
 *
 * Styled with the main NY-Post dark/gold theme tokens (hsl(var(--primary))
 * etc.) so they sit natively inside the glassy article layout.
 */

import { useMemo } from 'react'
import type {
  EditionActivityPoint,
  EditionCandle,
  EditionFearGreedPoint,
  EditionSentimentPoint
} from '../../edition/types'

const GOLD = 'hsl(var(--primary))'
const INK_SOFT = 'hsl(var(--muted-foreground) / 0.75)'
const RULE = 'hsl(var(--primary) / 0.15)'
const UP = 'hsl(152 60% 45%)'
const DOWN = 'hsl(0 72% 55%)'

export interface EditionChartAnnotation {
  date: string
  text: string
}

function formatPrice(value: number): string {
  return `$${Math.round(value).toLocaleString('de-DE')}`
}

function formatTimestampTick(timestamp: number | string, shortRange: boolean): string {
  const date = new Date(timestamp)
  if (shortRange) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="py-10 text-center text-xs" style={{ color: INK_SOFT }}>
      {label}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// btcChart — candlesticks with optional annotations
// ═══════════════════════════════════════════════════════════════════════

export function EditionCandleChart({
  candles,
  annotations = [],
  shortRange = false
}: {
  candles: EditionCandle[]
  annotations?: EditionChartAnnotation[]
  shortRange?: boolean
}) {
  const W = 860
  const H = 300
  const PAD = { top: 16, right: 64, bottom: 26, left: 8 }

  const layout = useMemo(() => {
    if (candles.length === 0) return null
    const min = Math.min(...candles.map(c => c.low))
    const max = Math.max(...candles.map(c => c.high))
    const span = max - min || 1
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top - PAD.bottom
    const step = innerW / candles.length
    const x = (i: number) => PAD.left + i * step + step / 2
    const y = (price: number) => PAD.top + innerH - ((price - min) / span) * innerH
    return { min, max, x, y, step }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles])

  if (!layout || candles.length === 0) {
    return <EmptyChart label="Keine Kerzendaten verfügbar." />
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

  const tickEvery = Math.max(1, Math.floor(candles.length / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="BTC Kerzenchart">
      {[0.25, 0.5, 0.75].map(f => {
        const price = min + (max - min) * f
        return (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(price)} y2={y(price)} stroke={RULE} strokeDasharray="3 4" />
            <text x={W - PAD.right + 6} y={y(price) + 3} fontSize="10" fill={INK_SOFT} fontFamily="monospace">
              {formatPrice(price)}
            </text>
          </g>
        )
      })}

      {candles.map((candle, i) => {
        const up = candle.close >= candle.open
        const color = up ? UP : DOWN
        const bodyTop = y(Math.max(candle.open, candle.close))
        const bodyBottom = y(Math.min(candle.open, candle.close))
        const bodyW = Math.max(step * 0.55, 1.5)
        return (
          <g key={candle.timestamp}>
            <line x1={x(i)} x2={x(i)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth={0.8} />
            <rect x={x(i) - bodyW / 2} y={bodyTop} width={bodyW} height={Math.max(bodyBottom - bodyTop, 0.8)} fill={color} />
          </g>
        )
      })}

      {annotationMarkers.map((marker, i) => (
        <g key={`${marker.date}-${i}`}>
          <line x1={marker.x} x2={marker.x} y1={PAD.top} y2={H - PAD.bottom} stroke={GOLD} strokeWidth={0.8} strokeDasharray="2 3" opacity={0.7} />
          <circle cx={marker.x} cy={PAD.top + 4 + (i % 3) * 12} r={6} fill={GOLD} />
          <text x={marker.x} y={PAD.top + 7.5 + (i % 3) * 12} fontSize="8" fill="hsl(var(--primary-foreground))" textAnchor="middle" fontWeight="bold">
            {i + 1}
          </text>
        </g>
      ))}

      {candles.map((candle, i) => {
        if (i % tickEvery !== 0) return null
        return (
          <text key={`tick-${candle.timestamp}`} x={x(i)} y={H - 8} fontSize="10" fill={INK_SOFT} textAnchor="middle" fontFamily="monospace">
            {formatTimestampTick(candle.timestamp, shortRange)}
          </text>
        )
      })}

      <line x1={PAD.left} x2={W - PAD.right} y1={y(last.close)} y2={y(last.close)} stroke={GOLD} strokeWidth={0.8} strokeDasharray="5 3" />
      <text x={W - PAD.right + 6} y={y(last.close) - 5} fontSize="10" fill={GOLD} fontFamily="monospace" fontWeight="bold">
        {formatPrice(last.close)}
      </text>
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// fearGreedVsBtc — F&G index line (0-100) overlaid with BTC price line
// ═══════════════════════════════════════════════════════════════════════

export function FearGreedVsBtcChart({
  history,
  candles
}: {
  history: EditionFearGreedPoint[]
  candles: EditionCandle[]
}) {
  const W = 860
  const H = 260
  const PAD = { top: 18, right: 64, bottom: 26, left: 34 }

  if (history.length === 0) {
    return <EmptyChart label="Keine Fear-&-Greed-Historie verfügbar." />
  }

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (history.length === 1 ? innerW / 2 : (i / (history.length - 1)) * innerW)
  const yIdx = (index: number) => PAD.top + innerH - (index / 100) * innerH

  const start = new Date(history[0].createdAt).getTime()
  const end = new Date(history[history.length - 1].createdAt).getTime()
  const priceCandles = candles.filter(c => c.timestamp >= start - 4 * 3600 * 1000 && c.timestamp <= end + 4 * 3600 * 1000)
  const closes = priceCandles.map(c => c.close)
  const minC = closes.length ? Math.min(...closes) : 0
  const maxC = closes.length ? Math.max(...closes) : 1
  const spanC = maxC - minC || 1
  const spanT = end - start || 1
  const xPrice = (ts: number) => PAD.left + ((ts - start) / spanT) * innerW
  const yPrice = (close: number) => PAD.top + innerH - ((close - minC) / spanC) * innerH

  const idxPath = history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${yIdx(p.todayIndex).toFixed(1)}`).join(' ')
  const areaPath = `${idxPath} L ${x(history.length - 1).toFixed(1)} ${yIdx(0).toFixed(1)} L ${x(0).toFixed(1)} ${yIdx(0).toFixed(1)} Z`
  const pricePath = priceCandles
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${xPrice(c.timestamp).toFixed(1)} ${yPrice(c.close).toFixed(1)}`)
    .join(' ')

  const latest = history[history.length - 1]
  const tickEvery = Math.max(1, Math.floor(history.length / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Fear und Greed Index gegen BTC-Preis">
      {[25, 50, 75].map(level => (
        <g key={level}>
          <line x1={PAD.left} x2={W - PAD.right} y1={yIdx(level)} y2={yIdx(level)} stroke={RULE} strokeDasharray="3 4" />
          <text x={6} y={yIdx(level) + 3} fontSize="9" fill={INK_SOFT} fontFamily="monospace">{level}</text>
        </g>
      ))}
      <text x={6} y={yIdx(100) + 8} fontSize="9" fill={INK_SOFT} fontFamily="monospace">Greed</text>
      <text x={6} y={yIdx(0) - 2} fontSize="9" fill={INK_SOFT} fontFamily="monospace">Fear</text>

      {priceCandles.length > 1 && (
        <>
          <path d={pricePath} fill="none" stroke={INK_SOFT} strokeWidth={1.4} strokeDasharray="5 3" />
          <text x={W - PAD.right + 6} y={PAD.top + 8} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
            BTC {formatPrice(maxC)}
          </text>
          <text x={W - PAD.right + 6} y={H - PAD.bottom} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
            {formatPrice(minC)}
          </text>
        </>
      )}

      <path d={areaPath} fill={GOLD} opacity={0.08} />
      <path d={idxPath} fill="none" stroke={GOLD} strokeWidth={2} />
      {history.map((p, i) => (
        <circle key={p.createdAt} cx={x(i)} cy={yIdx(p.todayIndex)} r={2.2} fill={GOLD} />
      ))}
      <text x={W - PAD.right + 6} y={yIdx(latest.todayIndex) + 3} fontSize="11" fill={GOLD} fontFamily="monospace" fontWeight="bold">
        {latest.todayIndex}
      </text>

      {history.map((p, i) => {
        if (i % tickEvery !== 0) return null
        return (
          <text key={`tick-${p.createdAt}`} x={x(i)} y={H - 8} fontSize="10" fill={INK_SOFT} textAnchor="middle" fontFamily="monospace">
            {formatTimestampTick(p.createdAt, false)}
          </text>
        )
      })}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// sentimentVsBtc — chat sentiment buckets (-100..100) vs BTC price
// ═══════════════════════════════════════════════════════════════════════

export function SentimentVsBtcChart({ points }: { points: EditionSentimentPoint[] }) {
  const W = 860
  const H = 260
  const PAD = { top: 18, right: 64, bottom: 26, left: 38 }

  const valid = points.filter(p => Number.isFinite(p.netSentiment))
  if (valid.length === 0) {
    return <EmptyChart label="Keine Sentiment-Daten verfügbar." />
  }

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (valid.length === 1 ? innerW / 2 : (i / (valid.length - 1)) * innerW)
  const ySent = (net: number) => PAD.top + innerH - ((net + 100) / 200) * innerH

  const prices = valid.map(p => p.priceAtBucket).filter((v): v is number => v !== null)
  const minP = prices.length ? Math.min(...prices) : 0
  const maxP = prices.length ? Math.max(...prices) : 1
  const spanP = maxP - minP || 1
  const yPrice = (price: number) => PAD.top + innerH - ((price - minP) / spanP) * innerH

  const sentPath = valid.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${ySent(p.netSentiment).toFixed(1)}`).join(' ')
  const pricePath = valid
    .map((p, i) => (p.priceAtBucket === null ? null : `${x(i).toFixed(1)} ${yPrice(p.priceAtBucket).toFixed(1)}`))
    .filter((s): s is string => s !== null)
    .map((coords, i) => `${i === 0 ? 'M' : 'L'} ${coords}`)
    .join(' ')

  const tickEvery = Math.max(1, Math.floor(valid.length / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Chat-Sentiment gegen BTC-Preis">
      <line x1={PAD.left} x2={W - PAD.right} y1={ySent(0)} y2={ySent(0)} stroke={RULE} strokeDasharray="3 4" />
      <text x={6} y={ySent(0) + 3} fontSize="9" fill={INK_SOFT} fontFamily="monospace">0</text>
      <text x={6} y={ySent(100) + 8} fontSize="9" fill={UP} fontFamily="monospace">Bull</text>
      <text x={6} y={ySent(-100) - 2} fontSize="9" fill={DOWN} fontFamily="monospace">Bear</text>

      {/* sentiment bars from zero line */}
      {valid.map((p, i) => (
        <line
          key={`bar-${p.timestamp}`}
          x1={x(i)}
          x2={x(i)}
          y1={ySent(0)}
          y2={ySent(p.netSentiment)}
          stroke={p.netSentiment >= 0 ? UP : DOWN}
          strokeWidth={Math.max(innerW / valid.length * 0.4, 1.2)}
          opacity={0.35}
        />
      ))}
      <path d={sentPath} fill="none" stroke={GOLD} strokeWidth={2} />

      {prices.length > 1 && (
        <>
          <path d={pricePath} fill="none" stroke={INK_SOFT} strokeWidth={1.4} strokeDasharray="5 3" />
          <text x={W - PAD.right + 6} y={PAD.top + 8} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
            BTC {formatPrice(maxP)}
          </text>
          <text x={W - PAD.right + 6} y={H - PAD.bottom} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
            {formatPrice(minP)}
          </text>
        </>
      )}

      {valid.map((p, i) => {
        if (i % tickEvery !== 0) return null
        return (
          <text key={`tick-${p.timestamp}`} x={x(i)} y={H - 8} fontSize="10" fill={INK_SOFT} textAnchor="middle" fontFamily="monospace">
            {formatTimestampTick(p.timestamp, false)}
          </text>
        )
      })}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// activityVsBtc — activity bars per day + BTC close line
// ═══════════════════════════════════════════════════════════════════════

export function ActivityVsBtcChart({ points }: { points: EditionActivityPoint[] }) {
  const W = 860
  const H = 230
  const PAD = { top: 16, right: 64, bottom: 26, left: 10 }

  if (points.length === 0) {
    return <EmptyChart label="Keine Aktivitätsdaten verfügbar." />
  }

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const maxMsgs = Math.max(...points.map(p => p.messageCount), 1)
  const step = innerW / points.length

  const closes = points.map(p => p.btcClose).filter((v): v is number => v !== null)
  const minC = closes.length ? Math.min(...closes) : 0
  const maxC = closes.length ? Math.max(...closes) : 1
  const spanC = maxC - minC || 1
  const yPrice = (close: number) => PAD.top + innerH - ((close - minC) / spanC) * innerH

  const pricePath = points
    .map((p, i) => (p.btcClose === null ? null : `${(PAD.left + i * step + step / 2).toFixed(1)} ${yPrice(p.btcClose).toFixed(1)}`))
    .filter((s): s is string => s !== null)
    .map((coords, i) => `${i === 0 ? 'M' : 'L'} ${coords}`)
    .join(' ')

  const tickEvery = Math.max(1, Math.floor(points.length / 8))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Chat-Aktivität gegen BTC-Preis">
      {points.map((p, i) => {
        const h = (p.messageCount / maxMsgs) * innerH
        const intensity = p.messageCount / maxMsgs
        return (
          <g key={p.date}>
            <rect
              x={PAD.left + i * step + step * 0.12}
              y={PAD.top + innerH - h}
              width={step * 0.76}
              height={Math.max(h, 1)}
              fill={GOLD}
              opacity={0.2 + intensity * 0.7}
            />
            {i % tickEvery === 0 && (
              <text x={PAD.left + i * step + step / 2} y={H - 8} fontSize="10" fill={INK_SOFT} textAnchor="middle" fontFamily="monospace">
                {formatTimestampTick(`${p.date}T12:00:00`, false)}
              </text>
            )}
          </g>
        )
      })}

      {closes.length > 1 && (
        <>
          <path d={pricePath} fill="none" stroke={INK_SOFT} strokeWidth={1.6} strokeDasharray="5 3" />
          <text x={W - PAD.right + 6} y={PAD.top + 8} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
            BTC {formatPrice(maxC)}
          </text>
          <text x={W - PAD.right + 6} y={H - PAD.bottom} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
            {formatPrice(minC)}
          </text>
        </>
      )}

      <text x={PAD.left} y={10} fontSize="9" fill={INK_SOFT} fontFamily="monospace">
        max {maxMsgs.toLocaleString('de-DE')} Nachrichten/Tag
      </text>
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// fearGreedGauge — current index as a semicircle gauge
// ═══════════════════════════════════════════════════════════════════════

export function FearGreedGauge({
  index,
  classification
}: {
  index: number
  classification: string
}) {
  const W = 320
  const H = 180
  const cx = W / 2
  const cy = H - 30
  const r = 110

  const clamped = Math.max(0, Math.min(100, index))
  const angle = Math.PI - (clamped / 100) * Math.PI
  const needleX = cx + Math.cos(angle) * (r - 18)
  const needleY = cy - Math.sin(angle) * (r - 18)

  const arc = (from: number, to: number, color: string) => {
    const a0 = Math.PI - (from / 100) * Math.PI
    const a1 = Math.PI - (to / 100) * Math.PI
    const x0 = cx + Math.cos(a0) * r
    const y0 = cy - Math.sin(a0) * r
    const x1 = cx + Math.cos(a1) * r
    const y1 = cy - Math.sin(a1) * r
    return <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="butt" opacity={0.85} />
  }

  return (
    <div className="mx-auto max-w-[340px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Fear und Greed Index: ${index}`}>
        {arc(0, 20, DOWN)}
        {arc(20, 40, 'hsl(20 80% 50%)')}
        {arc(40, 60, 'hsl(43 60% 50%)')}
        {arc(60, 80, 'hsl(90 50% 45%)')}
        {arc(80, 100, UP)}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={7} fill={GOLD} />
        <text x={cx} y={cy - 34} fontSize="34" fill={GOLD} textAnchor="middle" fontFamily="monospace" fontWeight="bold">
          {Math.round(clamped)}
        </text>
        <text x={cx} y={cy - 12} fontSize="12" fill={INK_SOFT} textAnchor="middle">
          {classification}
        </text>
        <text x={cx - r} y={cy + 16} fontSize="9" fill={DOWN} textAnchor="middle" fontFamily="monospace">FEAR</text>
        <text x={cx + r} y={cy + 16} fontSize="9" fill={UP} textAnchor="middle" fontFamily="monospace">GREED</text>
      </svg>
    </div>
  )
}
