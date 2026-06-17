'use client'

import { Avatar,AvatarFallback,AvatarImage } from '@/components/ui/avatar'
import { differenceInDays,formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import {
ChartBar,
Clock,
Crosshair,
Flame,
Minus,
Target,
ThumbsDown,
ThumbsUp,
TrendingDown,
TrendingUp,
Users
} from 'lucide-react'
import { useState } from 'react'

export interface Prediction {
  id: string
  username: string
  avatar?: string
  originalText: string
  prediction: string
  targetPrice: number | null
  direction: 'bullish' | 'bearish' | 'neutral'
  timeframe: 'short' | 'mid' | 'long'
  targetDate: string | null
  targetDateText: string
  confidence: 'low' | 'medium' | 'high'
  priceAtPrediction: number
  timestamp: string
  emoji?: string
}

interface PredictionCardProps {
  prediction: Prediction
  currentPrice?: number
  onBetYes?: (prediction: Prediction) => void
  onBetNo?: (prediction: Prediction) => void
  yesPool?: number
  noPool?: number
  userBet?: 'yes' | 'no' | null
}

const timeframeConfig = {
  short: { icon: Flame, label: 'Kurzfristig', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  mid: { icon: ChartBar, label: 'Mittelfristig', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  long: { icon: Crosshair, label: 'Langfristig', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
}

const directionConfig = {
  bullish: { icon: TrendingUp, label: 'Bullish', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  bearish: { icon: TrendingDown, label: 'Bearish', color: 'text-red-400', bg: 'bg-red-500/20' },
  neutral: { icon: Minus, label: 'Neutral', color: 'text-amber-400', bg: 'bg-amber-500/20' },
}

const confidenceConfig = {
  low: { label: 'Unsicher', dots: 1 },
  medium: { label: 'Normal', dots: 2 },
  high: { label: 'Sehr sicher', dots: 3 },
}

export function PredictionCard({ 
  prediction, 
  onBetYes, 
  onBetNo,
  yesPool = 0,
  noPool = 0,
  userBet 
}: PredictionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const tf = timeframeConfig[prediction.timeframe]
  const dir = directionConfig[prediction.direction]
  const conf = confidenceConfig[prediction.confidence]
  const TfIcon = tf.icon
  const DirIcon = dir.icon
  
  // Time remaining
  const daysRemaining = prediction.targetDate 
    ? differenceInDays(new Date(prediction.targetDate), new Date())
    : null
  
  // Odds calculation (simple pool-based)
  const totalPool = yesPool + noPool
  const yesOdds = totalPool > 0 ? (totalPool / Math.max(yesPool, 1)).toFixed(2) : '2.00'
  const noOdds = totalPool > 0 ? (totalPool / Math.max(noPool, 1)).toFixed(2) : '2.00'
  const yesProbability = totalPool > 0 ? Math.round((noPool / totalPool) * 100) : 50
  const noProbability = 100 - yesProbability
  
  return (
    <div className={`group rounded-xl border ${tf.border} ${tf.bg} backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-lg`}>
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          {/* User & Prediction */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 border-2 border-primary/20 flex-shrink-0">
              <AvatarImage src={prediction.avatar} alt={prediction.username} />
              <AvatarFallback className="bg-card text-muted-foreground text-xs font-bold">
                {prediction.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">@{prediction.username}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${dir.bg} ${dir.color} font-semibold uppercase`}>
                  <DirIcon className="w-3 h-3 inline mr-0.5" />
                  {dir.label}
                </span>
              </div>
              <p className="text-sm text-foreground/90 mt-1 leading-snug">
                {prediction.emoji && <span className="mr-1">{prediction.emoji}</span>}
                „{prediction.prediction}“
              </p>
            </div>
          </div>
          
          {/* Target Price */}
          {prediction.targetPrice && (
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-muted-foreground">Ziel</div>
              <div className={`font-bold text-lg ${dir.color} tabular-nums`}>
                ${prediction.targetPrice.toLocaleString()}
              </div>
            </div>
          )}
        </div>
        
        {/* Tags Row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {/* Timeframe Badge */}
          <span className={`text-[10px] px-2 py-1 rounded-full ${tf.bg} ${tf.color} border ${tf.border} font-medium flex items-center gap-1`}>
            <TfIcon className="w-3 h-3" />
            {tf.label}
          </span>
          
          {/* Deadline */}
          <span className="text-[10px] px-2 py-1 rounded-full bg-card/50 text-muted-foreground border border-primary/10 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {prediction.targetDateText}
          </span>
          
          {/* Days remaining */}
          {daysRemaining !== null && daysRemaining > 0 && (
            <span className={`text-[10px] px-2 py-1 rounded-full ${
              daysRemaining <= 7 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
              daysRemaining <= 30 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
              'bg-card/50 text-muted-foreground border-primary/10'
            } border flex items-center gap-1`}>
              <Target className="w-3 h-3" />
              {daysRemaining} Tage
            </span>
          )}
          
          {/* Confidence */}
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <span 
                key={i} 
                className={`w-1.5 h-1.5 rounded-full ${
                  i < conf.dots ? 'bg-primary' : 'bg-muted'
                }`} 
              />
            ))}
          </span>
        </div>
      </div>
      
      {/* Betting Section */}
      <div className="border-t border-foreground/5 px-4 py-3 bg-background/30">
        {/* Probability Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>JA {yesProbability}%</span>
            <span>NEIN {noProbability}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden flex">
            <div 
              className="bg-emerald-500 transition-all duration-500" 
              style={{ width: `${yesProbability}%` }} 
            />
            <div 
              className="bg-red-500 transition-all duration-500" 
              style={{ width: `${noProbability}%` }} 
            />
          </div>
        </div>
        
        {/* Bet Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onBetYes?.(prediction)}
            disabled={userBet === 'yes'}
            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              userBet === 'yes'
                ? 'bg-emerald-500 text-white'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 hover:scale-105'
            }`}
          >
            <ThumbsUp className="w-4 h-4" />
            <span>JA</span>
            <span className="text-xs opacity-70">{yesOdds}x</span>
          </button>
          
          <button
            onClick={() => onBetNo?.(prediction)}
            disabled={userBet === 'no'}
            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              userBet === 'no'
                ? 'bg-red-500 text-white'
                : 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:scale-105'
            }`}
          >
            <ThumbsDown className="w-4 h-4" />
            <span>NEIN</span>
            <span className="text-xs opacity-70">{noOdds}x</span>
          </button>
        </div>
        
        {/* Pool Info */}
        {totalPool > 0 && (
          <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {Math.round(totalPool / 10)} Wetten
            </span>
            <span>Pool: {totalPool} credits</span>
          </div>
        )}
      </div>
      
      {/* Expandable Details */}
      {isExpanded && (
        <div className="border-t border-foreground/5 px-4 py-3 text-xs text-muted-foreground bg-card/30">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-foreground/50">Preis damals:</span>
              <span className="ml-1 font-mono">${prediction.priceAtPrediction.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-foreground/50">Gepostet:</span>
              <span className="ml-1">
                {formatDistanceToNow(new Date(prediction.timestamp), { addSuffix: true, locale: de })}
              </span>
            </div>
          </div>
          <p className="mt-2 italic text-foreground/60 line-clamp-2">
            „{prediction.originalText}“
          </p>
        </div>
      )}
      
      {/* Expand Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors border-t border-foreground/5"
      >
        {isExpanded ? '▲ Weniger' : '▼ Details'}
      </button>
    </div>
  )
}

export function PredictionCardSkeleton() {
  return (
    <div className="rounded-xl border border-primary/10 bg-card/50 animate-pulse">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-muted" />
          <div className="flex-1">
            <div className="h-4 bg-muted rounded w-24 mb-2" />
            <div className="h-3 bg-muted rounded w-full" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <div className="h-5 bg-muted rounded-full w-20" />
          <div className="h-5 bg-muted rounded-full w-16" />
        </div>
      </div>
      <div className="border-t border-foreground/5 px-4 py-3">
        <div className="h-2 bg-muted rounded-full mb-3" />
        <div className="flex gap-2">
          <div className="flex-1 h-10 bg-muted rounded-lg" />
          <div className="flex-1 h-10 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  )
}

