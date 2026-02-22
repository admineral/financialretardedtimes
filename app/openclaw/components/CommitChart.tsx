'use client'

import { useMemo } from 'react'
import { GitCommit, GitMerge } from 'lucide-react'
import type { DailyStats, CachedCommit } from '../actions/cache'

interface CommitChartProps {
  dailyStats: DailyStats[]
  commits: CachedCommit[]
  isLoading?: boolean
}

export function CommitChart({ dailyStats, commits, isLoading }: CommitChartProps) {
  // Build chart data with all days in the last 30 days (fill empty days with 0)
  const chartData = useMemo(() => {
    const days: { date: string; commitCount: number; uniqueContributors: number; mergeCount: number }[] = []
    const statsMap = new Map(dailyStats.map(d => [d.date, d]))
    
    // Generate last 30 days
    for (let i = 29; i >= 0; i--) {
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
  }, [dailyStats])

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
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-primary" />
            Commit Activity (Last 30 Days)
          </h3>
          <span className="text-xs text-muted-foreground">
            {totalCommitsInRange} total commits
          </span>
        </div>
        
        {totalCommitsInRange === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No commits in the last 30 days. Click "Sync" to fetch data.
          </div>
        ) : (
          <div className="relative h-48 flex items-end gap-[2px]">
            {chartDataWithHeight.map((day, idx) => {
              const isToday = idx === chartDataWithHeight.length - 1
              const date = new Date(day.date + 'T00:00:00')
              const dayLabel = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
              const hasCommits = day.commitCount > 0
              
              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center group relative min-w-[8px]"
                >
                  {/* Bar */}
                  <div
                    className={`w-full rounded-t transition-all duration-300 ${
                      !hasCommits
                        ? 'bg-muted/20'
                        : isToday
                        ? 'bg-primary shadow-lg shadow-primary/20'
                        : 'bg-primary/60 hover:bg-primary/80'
                    }`}
                    style={{ 
                      height: hasCommits ? `${day.heightPercent}%` : '2px',
                      minHeight: hasCommits ? '8px' : '2px',
                    }}
                  />
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div className="glass-card-gold px-3 py-2 rounded text-xs whitespace-nowrap shadow-lg">
                      <div className="font-bold text-primary mb-1">{dayLabel}</div>
                      <div className="text-foreground">
                        {day.commitCount} commit{day.commitCount !== 1 ? 's' : ''}
                      </div>
                      {day.uniqueContributors > 0 && (
                        <div className="text-muted-foreground">
                          {day.uniqueContributors} contributor{day.uniqueContributors !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Date Label - show every 7th day for better readability */}
                  {idx % 7 === 0 && (
                    <div className="text-[9px] text-muted-foreground/60 mt-2 whitespace-nowrap">
                      {date.getDate()}/{date.getMonth() + 1}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
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
