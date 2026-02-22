'use client'

import { useMemo, useState } from 'react'
import { GitCommit, TrendingUp, TrendingDown, Activity, Users, GitMerge } from 'lucide-react'
import type { DailyStats, CachedCommit } from '../actions/cache'

interface CommitChartProps {
  dailyStats: DailyStats[]
  commits: CachedCommit[]
  isLoading?: boolean
}

type ChartRange = 7 | 14 | 30 | 90 | 'all'

export function CommitChart({ dailyStats, commits, isLoading }: CommitChartProps) {
  const [chartRange, setChartRange] = useState<ChartRange>(7)
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
  
  const dataDateRange = useMemo(() => {
    if (dailyStats.length === 0) return { oldest: null, newest: null, totalDays: 0 }
    const sorted = [...dailyStats].sort((a, b) => a.date.localeCompare(b.date))
    return {
      oldest: sorted[0].date,
      newest: sorted[sorted.length - 1].date,
      totalDays: sorted.length,
    }
  }, [dailyStats])
  
  const chartData = useMemo(() => {
    const days: { date: string; commitCount: number; uniqueContributors: number; mergeCount: number }[] = []
    const statsMap = new Map(dailyStats.map(d => [d.date, d]))
    
    let numDays: number
    if (chartRange === 'all') {
      if (!dataDateRange.oldest) return days
      const oldest = new Date(dataDateRange.oldest + 'T00:00:00')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      numDays = Math.ceil((today.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24)) + 1
    } else {
      numDays = chartRange
    }
    
    for (let i = numDays - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      
      const stats = statsMap.get(dateStr)
      days.push({
        date: dateStr,
        commitCount: stats?.commitCount || 0,
        uniqueContributors: stats?.uniqueContributors || 0,
        mergeCount: stats?.mergeCount || 0,
      })
    }
    
    return days
  }, [dailyStats, chartRange, dataDateRange])

  const maxCommits = useMemo(() => {
    return Math.max(...chartData.map(d => d.commitCount), 1)
  }, [chartData])
  
  const totalCommitsInRange = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.commitCount, 0)
  }, [chartData])

  const totalMergesInRange = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.mergeCount, 0)
  }, [chartData])

  const activeDays = useMemo(() => {
    return chartData.filter(d => d.commitCount > 0).length
  }, [chartData])

  const avgCommitsPerActiveDay = useMemo(() => {
    return activeDays > 0 ? Math.round(totalCommitsInRange / activeDays) : 0
  }, [totalCommitsInRange, activeDays])

  const trend = useMemo(() => {
    if (chartData.length < 7) return { direction: 'neutral' as const, percent: 0 }
    const midpoint = Math.floor(chartData.length / 2)
    const firstHalf = chartData.slice(0, midpoint).reduce((sum, d) => sum + d.commitCount, 0)
    const secondHalf = chartData.slice(midpoint).reduce((sum, d) => sum + d.commitCount, 0)
    if (firstHalf === 0) return { direction: 'up' as const, percent: 100 }
    const percent = Math.round(((secondHalf - firstHalf) / firstHalf) * 100)
    return {
      direction: percent > 0 ? 'up' as const : percent < 0 ? 'down' as const : 'neutral' as const,
      percent: Math.abs(percent)
    }
  }, [chartData])

  if (isLoading) {
    return (
      <div className="w-full animate-pulse space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-muted/20 rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-muted/20 rounded-lg" />
      </div>
    )
  }

  const rangeOptions: { value: ChartRange; label: string }[] = [
    { value: 7, label: '7D' },
    { value: 14, label: '14D' },
    { value: 30, label: '30D' },
    { value: 90, label: '90D' },
    { value: 'all', label: `All (${dataDateRange.totalDays}d)` },
  ]

  return (
    <div className="w-full space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-card p-4 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <GitCommit className="w-3.5 h-3.5" />
            <span>Total Commits</span>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {totalCommitsInRange.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            in {chartData.length} days
          </div>
        </div>

        <div className="glass-card p-4 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Activity className="w-3.5 h-3.5" />
            <span>Avg / Day</span>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {avgCommitsPerActiveDay.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {activeDays} active days
          </div>
        </div>

        <div className="glass-card p-4 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <GitMerge className="w-3.5 h-3.5" />
            <span>Merges</span>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {totalMergesInRange.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {totalCommitsInRange > 0 ? Math.round((totalMergesInRange / totalCommitsInRange) * 100) : 0}% of commits
          </div>
        </div>

        <div className="glass-card p-4 rounded-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            {trend.direction === 'up' ? (
              <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            ) : trend.direction === 'down' ? (
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
            ) : (
              <Activity className="w-3.5 h-3.5" />
            )}
            <span>Trend</span>
          </div>
          <div className={`text-2xl font-bold font-mono ${
            trend.direction === 'up' ? 'text-green-500' : 
            trend.direction === 'down' ? 'text-red-500' : 
            'text-foreground'
          }`}>
            {trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}{trend.percent}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            vs first half
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-primary/10">
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-primary" />
            Commit Activity
          </h3>
          
          {/* Range Selector */}
          <div className="flex items-center bg-muted/30 rounded-lg p-0.5">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setChartRange(option.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  chartRange === option.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        
        {totalCommitsInRange === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No commits found. Click "Sync" to fetch data.
          </div>
        ) : (
          <div className="p-4">
            {/* Y-axis labels + Chart */}
            <div className="flex">
              {/* Y-axis */}
              <div className="w-10 flex flex-col justify-between text-[10px] text-muted-foreground/70 text-right pr-2 py-1" style={{ height: '200px' }}>
                <span>{maxCommits}</span>
                <span>{Math.round(maxCommits * 0.5)}</span>
                <span>0</span>
              </div>
              
              {/* Chart Area */}
              <div className="flex-1 relative" style={{ height: '200px' }}>
                {/* Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  <div className="border-t border-primary/10" />
                  <div className="border-t border-primary/5" />
                  <div className="border-t border-primary/10" />
                </div>
                
                {/* Bars Container */}
                <div className="absolute inset-0 flex items-end">
                  {chartData.map((day, idx) => {
                    const isToday = idx === chartData.length - 1
                    const isHovered = hoveredBar === idx
                    const hasCommits = day.commitCount > 0
                    const heightPercent = hasCommits 
                      ? Math.max((day.commitCount / maxCommits) * 100, 2) 
                      : 0
                    
                    const barWidth = Math.max(100 / chartData.length - 0.5, 2)
                    
                    return (
                      <div
                        key={day.date}
                        className="relative flex flex-col justify-end h-full"
                        style={{ 
                          width: `${100 / chartData.length}%`,
                          padding: '0 1px',
                        }}
                        onMouseEnter={() => setHoveredBar(idx)}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        {/* Bar */}
                        <div
                          className={`w-full rounded-t transition-all duration-150 ${
                            !hasCommits
                              ? 'bg-muted/20'
                              : isToday
                              ? 'bg-gradient-to-t from-primary to-primary/70'
                              : isHovered
                              ? 'bg-primary'
                              : 'bg-primary/60'
                          }`}
                          style={{ 
                            height: `${heightPercent}%`,
                            minHeight: hasCommits ? '3px' : '1px',
                            boxShadow: isToday ? '0 0 10px var(--primary)' : 'none',
                          }}
                        />
                        
                        {/* Tooltip */}
                        {isHovered && hasCommits && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-none">
                            <div className="bg-popover border border-primary/20 px-3 py-2 rounded-lg shadow-xl text-xs whitespace-nowrap">
                              <div className="font-bold text-primary mb-1">
                                {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { 
                                  weekday: 'short',
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                                {isToday && <span className="ml-1 text-muted-foreground">(Today)</span>}
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <GitCommit className="w-3 h-3 text-primary" />
                                  <span className="text-foreground font-semibold">{day.commitCount}</span>
                                  <span className="text-muted-foreground">commits</span>
                                </div>
                                {day.mergeCount > 0 && (
                                  <div className="flex items-center gap-2">
                                    <GitMerge className="w-3 h-3 text-purple-400" />
                                    <span className="text-foreground font-semibold">{day.mergeCount}</span>
                                    <span className="text-muted-foreground">merges</span>
                                  </div>
                                )}
                                {day.uniqueContributors > 0 && (
                                  <div className="flex items-center gap-2">
                                    <Users className="w-3 h-3 text-blue-400" />
                                    <span className="text-foreground font-semibold">{day.uniqueContributors}</span>
                                    <span className="text-muted-foreground">contributors</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            
            {/* X-axis */}
            <div className="flex mt-2">
              <div className="w-10" />
              <div className="flex-1 flex justify-between text-[10px] text-muted-foreground/70 px-1">
                {(() => {
                  const totalDays = chartData.length
                  let step = 1
                  if (totalDays > 60) step = 14
                  else if (totalDays > 30) step = 7
                  else if (totalDays > 14) step = 5
                  else if (totalDays > 7) step = 2
                  
                  const labels: { date: string; idx: number }[] = []
                  labels.push({ date: chartData[0]?.date || '', idx: 0 })
                  
                  for (let i = step; i < totalDays - 1; i += step) {
                    labels.push({ date: chartData[i].date, idx: i })
                  }
                  
                  if (totalDays > 1) {
                    labels.push({ date: chartData[totalDays - 1].date, idx: totalDays - 1 })
                  }
                  
                  return labels.map(({ date, idx }) => {
                    if (!date) return null
                    const d = new Date(date + 'T00:00:00')
                    const isToday = idx === totalDays - 1
                    return (
                      <span 
                        key={date} 
                        className={isToday ? 'text-primary font-medium' : ''}
                        style={{ 
                          position: 'absolute',
                          left: `calc(${(idx / totalDays) * 100}% + 40px)`,
                          transform: 'translateX(-50%)',
                        }}
                      >
                        {isToday ? 'Today' : `${d.getDate()}/${d.getMonth() + 1}`}
                      </span>
                    )
                  })
                })()}
              </div>
            </div>
          </div>
        )}
        
        {/* Footer Stats */}
        {totalCommitsInRange > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-t border-primary/10 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
                <span className="text-muted-foreground">Peak:</span>
                <span className="font-semibold text-foreground">{maxCommits}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-primary/40" />
                <span className="text-muted-foreground">Avg:</span>
                <span className="font-semibold text-foreground">{avgCommitsPerActiveDay}/day</span>
              </div>
            </div>
            <div className="text-muted-foreground">
              {chartData[0]?.date && new Date(chartData[0].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' → '}
              {chartData[chartData.length - 1]?.date && new Date(chartData[chartData.length - 1].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
