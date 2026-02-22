'use client'

import { useMemo, useState } from 'react'
import { GitCommit, GitMerge, Calendar } from 'lucide-react'
import type { DailyStats, CachedCommit } from '../actions/cache'

interface CommitChartProps {
  dailyStats: DailyStats[]
  commits: CachedCommit[]
  isLoading?: boolean
}

type ChartRange = 7 | 14 | 30 | 'all'

export function CommitChart({ dailyStats, commits, isLoading }: CommitChartProps) {
  const [chartRange, setChartRange] = useState<ChartRange>(30)
  
  // Calculate the actual date range we have data for
  const dataDateRange = useMemo(() => {
    if (dailyStats.length === 0) return { oldest: null, newest: null, totalDays: 0 }
    const sorted = [...dailyStats].sort((a, b) => a.date.localeCompare(b.date))
    return {
      oldest: sorted[0].date,
      newest: sorted[sorted.length - 1].date,
      totalDays: sorted.length,
    }
  }, [dailyStats])
  
  // Build chart data based on selected range
  const chartData = useMemo(() => {
    const days: { date: string; commitCount: number; uniqueContributors: number; mergeCount: number }[] = []
    const statsMap = new Map(dailyStats.map(d => [d.date, d]))
    
    // Determine number of days to show
    let numDays: number
    if (chartRange === 'all') {
      // Show all days we have data for (plus fill gaps)
      if (!dataDateRange.oldest) return days
      const oldest = new Date(dataDateRange.oldest + 'T00:00:00')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      numDays = Math.ceil((today.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24)) + 1
    } else {
      numDays = chartRange
    }
    
    // Generate days from oldest to today
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

  const chartDataWithHeight = useMemo(() => {
    return chartData.map(day => ({
      ...day,
      heightPercent: day.commitCount > 0 ? Math.max((day.commitCount / maxCommits) * 100, 5) : 0,
    }))
  }, [chartData, maxCommits])

  const recentCommits = useMemo(() => {
    return commits.slice(0, 10)
  }, [commits])
  
  const totalCommitsInRange = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.commitCount, 0)
  }, [chartData])

  if (isLoading) {
    return (
      <div className="w-full animate-pulse">
        <div className="h-32 bg-muted/20 rounded-lg mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-muted/20 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Bar Chart */}
      <div className="glass-card p-6 rounded-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-primary" />
            Commit Activity
          </h3>
          
          <div className="flex items-center gap-3">
            {/* Range Selector */}
            <div className="flex items-center gap-1 text-xs">
              {([7, 14, 30, 'all'] as ChartRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setChartRange(range)}
                  className={`px-2 py-1 rounded transition-all ${
                    chartRange === range
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {range === 'all' ? `All (${dataDateRange.totalDays}d)` : `${range}D`}
                </button>
              ))}
            </div>
            
            <span className="text-xs text-muted-foreground border-l border-primary/20 pl-3">
              {totalCommitsInRange.toLocaleString()} commits
            </span>
          </div>
        </div>
        
        {totalCommitsInRange === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No commits found. Click "Sync" to fetch data.
          </div>
        ) : (
          <>
            {/* Y-axis labels */}
            <div className="flex mb-2">
              <div className="w-12 flex flex-col justify-between text-[10px] text-muted-foreground/60 text-right pr-2 h-48">
                <span>{maxCommits.toLocaleString()}</span>
                <span>{Math.round(maxCommits * 0.75).toLocaleString()}</span>
                <span>{Math.round(maxCommits * 0.5).toLocaleString()}</span>
                <span>{Math.round(maxCommits * 0.25).toLocaleString()}</span>
                <span>0</span>
              </div>
              
              {/* Chart area */}
              <div className="flex-1 relative h-48 border-l border-b border-primary/10">
                {/* Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="border-t border-primary/5 w-full" />
                  ))}
                </div>
                
                {/* Bars */}
                <div className="absolute inset-0 flex items-end gap-[1px] px-1">
                  {chartDataWithHeight.map((day, idx) => {
                    const isToday = idx === chartDataWithHeight.length - 1
                    const date = new Date(day.date + 'T00:00:00')
                    const dayLabel = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
                    const hasCommits = day.commitCount > 0
                    
                    // Calculate actual pixel height based on container height (192px = h-48)
                    const barHeight = hasCommits 
                      ? Math.max((day.commitCount / maxCommits) * 100, 2) 
                      : 0
                    
                    return (
                      <div
                        key={day.date}
                        className="flex-1 flex flex-col justify-end group relative"
                        style={{ minWidth: '4px', maxWidth: '20px' }}
                      >
                        {/* Bar */}
                        <div
                          className={`w-full rounded-t-sm transition-all duration-200 ${
                            !hasCommits
                              ? 'bg-muted/10'
                              : isToday
                              ? 'bg-primary shadow-lg shadow-primary/30'
                              : 'bg-primary/70 hover:bg-primary'
                          }`}
                          style={{ 
                            height: `${barHeight}%`,
                            minHeight: hasCommits ? '4px' : '1px',
                          }}
                        />
                        
                        {/* Tooltip */}
                        {hasCommits && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                            <div className="glass-card-gold px-3 py-2 rounded text-xs whitespace-nowrap shadow-xl border border-primary/20">
                              <div className="font-bold text-primary mb-1">{dayLabel}</div>
                              <div className="text-foreground font-semibold">
                                {day.commitCount.toLocaleString()} commit{day.commitCount !== 1 ? 's' : ''}
                              </div>
                              {day.uniqueContributors > 0 && (
                                <div className="text-muted-foreground">
                                  {day.uniqueContributors} contributor{day.uniqueContributors !== 1 ? 's' : ''}
                                </div>
                              )}
                              {day.mergeCount > 0 && (
                                <div className="text-purple-400">
                                  {day.mergeCount} merge{day.mergeCount !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            
            {/* X-axis labels */}
            <div className="flex ml-12">
              <div className="flex-1 flex justify-between text-[10px] text-muted-foreground/60 px-1">
                {chartDataWithHeight.filter((_, idx) => {
                  // Show fewer labels when there are many days
                  const totalDays = chartDataWithHeight.length
                  if (totalDays <= 14) return idx % 2 === 0
                  if (totalDays <= 30) return idx % 5 === 0
                  return idx % 7 === 0
                }).map((day) => {
                  const date = new Date(day.date + 'T00:00:00')
                  return (
                    <span key={day.date} className="text-center">
                      {date.getDate()}/{date.getMonth() + 1}
                    </span>
                  )
                })}
              </div>
            </div>
            
            {/* Stats summary */}
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-primary/10 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-primary" />
                <span className="text-muted-foreground">Peak: <span className="text-foreground font-semibold">{maxCommits.toLocaleString()}</span> commits</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Avg: <span className="text-foreground font-semibold">{Math.round(totalCommitsInRange / chartDataWithHeight.filter(d => d.commitCount > 0).length || 1).toLocaleString()}</span>/day</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Days with activity: <span className="text-foreground font-semibold">{chartDataWithHeight.filter(d => d.commitCount > 0).length}</span></span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Recent Commits List */}
      <div className="glass-card p-6 rounded-sm">
        <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-primary" />
          Recent Commits
        </h3>
        
        <div className="space-y-3">
          {recentCommits.map((commit) => {
            const date = new Date(commit.date)
            const timeStr = date.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            })
            const dateStr = date.toLocaleDateString('en-US', { 
              month: 'short', 
              day: '2-digit' 
            })
            
            return (
              <a
                key={commit.sha}
                href={commit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group hover:bg-primary/5 p-3 rounded transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${
                    commit.isMerge 
                      ? 'bg-purple-500/20 text-purple-400' 
                      : 'bg-primary/20 text-primary'
                  }`}>
                    {commit.isMerge ? (
                      <GitMerge className="w-3.5 h-3.5" />
                    ) : (
                      <GitCommit className="w-3.5 h-3.5" />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {commit.message.split('\n')[0]}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{commit.shortSha}</span>
                      <span>•</span>
                      <span>{commit.author.username || commit.author.name}</span>
                      <span>•</span>
                      <span>{dateStr} {timeStr}</span>
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
        
        {recentCommits.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No commits available
          </div>
        )}
      </div>
    </div>
  )
}
