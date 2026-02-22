/**
 * CommitTicker.tsx
 * 
 * Displays commit statistics like a stock ticker:
 * - Today's commits with change indicator
 * - Yesterday's commits
 * - 7-day average
 */

'use client'

import { useMemo } from 'react'
import { 
  GitCommit, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Calendar,
  BarChart3,
} from 'lucide-react'
import type { DailyStats } from '../actions/cache'

interface CommitTickerProps {
  dailyStats: DailyStats[]
  isLoading?: boolean
}

export function CommitTicker({ dailyStats, isLoading }: CommitTickerProps) {
  const stats = useMemo(() => {
    if (dailyStats.length === 0) {
      return {
        today: 0,
        yesterday: 0,
        average7d: 0,
        change: 0,
        changePercent: 0,
      }
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0]

    const todayStats = dailyStats.find(d => d.date === todayStr)
    const yesterdayStats = dailyStats.find(d => d.date === yesterdayStr)
    
    const last7Days = dailyStats.slice(0, 7)
    const total7d = last7Days.reduce((sum, d) => sum + d.commitCount, 0)
    const average7d = last7Days.length > 0 ? Math.round(total7d / last7Days.length) : 0

    const today = todayStats?.commitCount || 0
    const yesterday = yesterdayStats?.commitCount || 0
    const change = today - yesterday
    const changePercent = yesterday > 0 ? Math.round((change / yesterday) * 100) : 0

    return {
      today,
      yesterday,
      average7d,
      change,
      changePercent,
    }
  }, [dailyStats])

  const getTrendIcon = () => {
    if (stats.change > 0) return <TrendingUp className="w-3 h-3 text-emerald-400" />
    if (stats.change < 0) return <TrendingDown className="w-3 h-3 text-red-400" />
    return <Minus className="w-3 h-3 text-muted-foreground" />
  }

  const getTrendColor = () => {
    if (stats.change > 0) return 'text-emerald-400'
    if (stats.change < 0) return 'text-red-400'
    return 'text-muted-foreground'
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-6 text-xs animate-pulse">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-4 w-20 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 sm:gap-6 flex-wrap text-xs">
      {/* Today */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <GitCommit className="w-3.5 h-3.5 text-primary" />
          <span>Today</span>
        </div>
        <span className="font-mono font-bold text-foreground">{stats.today}</span>
        {stats.yesterday > 0 && (
          <span className={`flex items-center gap-0.5 font-mono ${getTrendColor()}`}>
            {getTrendIcon()}
            {stats.change > 0 && '+'}
            {stats.change}
          </span>
        )}
      </div>

      <div className="w-px h-4 bg-primary/20 hidden sm:block" />

      {/* Yesterday */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          <span>Yesterday</span>
        </div>
        <span className="font-mono font-semibold text-muted-foreground">{stats.yesterday}</span>
      </div>

      <div className="w-px h-4 bg-primary/20 hidden sm:block" />

      {/* 7-day Average */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>7D Avg</span>
        </div>
        <span className="font-mono font-semibold text-muted-foreground">{stats.average7d}</span>
        {stats.today > 0 && stats.average7d > 0 && (
          <span className={`font-mono text-[10px] ${stats.today >= stats.average7d ? 'text-emerald-400' : 'text-amber-400'}`}>
            ({stats.today >= stats.average7d ? '↑' : '↓'} {Math.abs(Math.round(((stats.today - stats.average7d) / stats.average7d) * 100))}%)
          </span>
        )}
      </div>
    </div>
  )
}
