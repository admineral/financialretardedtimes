'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, Quote } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Fear & Greed Data Interface
 */
export interface FearGreedData {
  index: number
  classification: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  classificationDE: 'Extreme Angst' | 'Angst' | 'Neutral' | 'Gier' | 'Extreme Gier'
  trend: 'rising' | 'falling' | 'stable'
  drivers: {
    factor: string
    sentiment: 'bullish' | 'bearish' | 'neutral'
    weight: number
    insight: string
  }[]
  quotes: {
    username: string
    text: string
    sentiment: 'bullish' | 'bearish' | 'neutral'
  }[]
  summary: string
  periodComparison?: {
    today?: number
    last3Days?: number
    last7Days?: number
    insight: string
  }
}

interface FearGreedGaugeProps {
  data: Partial<FearGreedData> | undefined
  isLoading: boolean
  days: number
}

/**
 * Get color based on index value
 */
function getIndexColor(index: number): string {
  if (index <= 20) return 'text-red-600'
  if (index <= 40) return 'text-orange-500'
  if (index <= 60) return 'text-yellow-500'
  if (index <= 80) return 'text-lime-500'
  return 'text-green-500'
}

/**
 * Get background color based on index value
 */
function getIndexBgColor(index: number): string {
  if (index <= 20) return 'bg-red-600'
  if (index <= 40) return 'bg-orange-500'
  if (index <= 60) return 'bg-yellow-500'
  if (index <= 80) return 'bg-lime-500'
  return 'bg-green-500'
}

/**
 * Get sentiment color
 */
function getSentimentColor(sentiment: 'bullish' | 'bearish' | 'neutral'): string {
  switch (sentiment) {
    case 'bullish': return 'text-green-500'
    case 'bearish': return 'text-red-500'
    default: return 'text-yellow-500'
  }
}

/**
 * Get sentiment background color
 */
function getSentimentBgColor(sentiment: 'bullish' | 'bearish' | 'neutral'): string {
  switch (sentiment) {
    case 'bullish': return 'bg-green-500/10 border-green-500/30'
    case 'bearish': return 'bg-red-500/10 border-red-500/30'
    default: return 'bg-yellow-500/10 border-yellow-500/30'
  }
}

/**
 * Fear & Greed Gauge Component
 * 
 * Displays the Fear & Greed index with a visual gauge,
 * sentiment drivers, and notable quotes.
 */
export function FearGreedGauge({ data, isLoading, days }: FearGreedGaugeProps) {
  // Calculate gauge rotation (-90 to 90 degrees based on 0-100 index)
  const gaugeRotation = useMemo(() => {
    if (!data?.index) return -90
    return (data.index / 100) * 180 - 90
  }, [data?.index])

  if (isLoading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Gauge Skeleton */}
        <div className="flex flex-col items-center">
          <div className="w-64 h-32 bg-muted rounded-t-full" />
          <div className="h-8 w-24 bg-muted rounded mt-4" />
          <div className="h-6 w-32 bg-muted rounded mt-2" />
        </div>
        
        {/* Drivers Skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Main Gauge */}
      <div className="flex flex-col items-center">
        {/* Semi-circular gauge */}
        <div className="relative w-72 h-36 overflow-hidden">
          {/* Gauge background */}
          <div className="absolute inset-0 rounded-t-full overflow-hidden">
            <div 
              className="absolute inset-0"
              style={{
                background: 'conic-gradient(from 180deg at 50% 100%, #dc2626 0deg, #f97316 45deg, #eab308 90deg, #84cc16 135deg, #22c55e 180deg)'
              }}
            />
          </div>
          
          {/* Inner circle (cutout) */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-background rounded-t-full" />
          
          {/* Needle */}
          <div 
            className="absolute bottom-0 left-1/2 origin-bottom transition-transform duration-1000 ease-out"
            style={{ transform: `translateX(-50%) rotate(${gaugeRotation}deg)` }}
          >
            <div className="w-1 h-28 bg-foreground rounded-full shadow-lg" />
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-foreground rounded-full" />
          </div>
          
          {/* Labels */}
          <div className="absolute bottom-2 left-4 text-xs font-medium text-red-600">Fear</div>
          <div className="absolute bottom-2 right-4 text-xs font-medium text-green-500">Greed</div>
        </div>
        
        {/* Index Value */}
        <div className="mt-4 text-center">
          <div className={cn(
            "text-5xl font-bold tabular-nums transition-colors",
            data?.index !== undefined ? getIndexColor(data.index) : 'text-muted-foreground'
          )}>
            {data?.index ?? '—'}
          </div>
          <div className="text-lg font-medium text-muted-foreground mt-1">
            {data?.classificationDE ?? 'Analysiere...'}
          </div>
          
          {/* Trend indicator */}
          {data?.trend && (
            <div className="flex items-center justify-center gap-1 mt-2 text-sm">
              {data.trend === 'rising' && (
                <>
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-green-500">Steigend</span>
                </>
              )}
              {data.trend === 'falling' && (
                <>
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-red-500">Fallend</span>
                </>
              )}
              {data.trend === 'stable' && (
                <>
                  <Minus className="w-4 h-4 text-yellow-500" />
                  <span className="text-yellow-500">Stabil</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Period Comparison (for multi-day) */}
      {data?.periodComparison && (
        <div className="bg-muted/30 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Zeitraum-Vergleich
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-3">
            {data.periodComparison.today !== undefined && (
              <div className="text-center">
                <div className={cn("text-2xl font-bold", getIndexColor(data.periodComparison.today))}>
                  {data.periodComparison.today}
                </div>
                <div className="text-xs text-muted-foreground">Heute</div>
              </div>
            )}
            {data.periodComparison.last3Days !== undefined && (
              <div className="text-center">
                <div className={cn("text-2xl font-bold", getIndexColor(data.periodComparison.last3Days))}>
                  {data.periodComparison.last3Days}
                </div>
                <div className="text-xs text-muted-foreground">3 Tage</div>
              </div>
            )}
            {data.periodComparison.last7Days !== undefined && (
              <div className="text-center">
                <div className={cn("text-2xl font-bold", getIndexColor(data.periodComparison.last7Days))}>
                  {data.periodComparison.last7Days}
                </div>
                <div className="text-xs text-muted-foreground">7 Tage</div>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{data.periodComparison.insight}</p>
        </div>
      )}

      {/* Summary */}
      {data?.summary && (
        <div className="bg-muted/20 rounded-lg p-4 border-l-4 border-primary">
          <p className="text-sm leading-relaxed">{data.summary}</p>
        </div>
      )}

      {/* Sentiment Drivers */}
      {data?.drivers && data.drivers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Sentiment-Treiber
          </h3>
          <div className="space-y-3">
            {data.drivers.map((driver, i) => (
              <div 
                key={i}
                className={cn(
                  "rounded-lg p-3 border",
                  getSentimentBgColor(driver.sentiment)
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{driver.factor}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-medium", getSentimentColor(driver.sentiment))}>
                      {driver.sentiment === 'bullish' ? '🐂 Bullish' : 
                       driver.sentiment === 'bearish' ? '🐻 Bearish' : '⚖️ Neutral'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {driver.weight}%
                    </span>
                  </div>
                </div>
                {/* Weight bar */}
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                  <div 
                    className={cn("h-full rounded-full transition-all duration-500", getIndexBgColor(
                      driver.sentiment === 'bullish' ? 75 : 
                      driver.sentiment === 'bearish' ? 25 : 50
                    ))}
                    style={{ width: `${driver.weight}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{driver.insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notable Quotes */}
      {data?.quotes && data.quotes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Stimmungsbilder aus dem Chat
          </h3>
          <div className="space-y-3">
            {data.quotes.map((quote, i) => (
              <div 
                key={i}
                className={cn(
                  "rounded-lg p-3 border relative",
                  getSentimentBgColor(quote.sentiment)
                )}
              >
                <Quote className="absolute top-2 right-2 w-4 h-4 text-muted-foreground/30" />
                <p className="text-sm italic pr-6">&ldquo;{quote.text}&rdquo;</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-medium">— {quote.username}</span>
                  <span className={cn("text-xs", getSentimentColor(quote.sentiment))}>
                    {quote.sentiment === 'bullish' ? '🐂' : 
                     quote.sentiment === 'bearish' ? '🐻' : '⚖️'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Days indicator */}
      <div className="text-center text-xs text-muted-foreground">
        Basierend auf den letzten {days} Tag{days > 1 ? 'en' : ''}
      </div>
    </div>
  )
}

