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
  const maxCommits = useMemo(() => {
    return Math.max(...dailyStats.map(d => d.commitCount), 1)
  }, [dailyStats])

  const chartData = useMemo(() => {
    return dailyStats.slice(0, 30).reverse().map(day => ({
      ...day,
      heightPercent: (day.commitCount / maxCommits) * 100,
    }))
  }, [dailyStats, maxCommits])

  const recentCommits = useMemo(() => {
    return commits.slice(0, 10)
  }, [commits])

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
        <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-primary" />
          Commit Activity (Last 30 Days)
        </h3>
        
        <div className="relative h-48 flex items-end gap-1">
          {chartData.map((day, idx) => {
            const isToday = idx === chartData.length - 1
            const date = new Date(day.date)
            const dayLabel = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
            
            return (
              <div
                key={day.date}
                className="flex-1 flex flex-col items-center group relative"
              >
                {/* Bar */}
                <div
                  className={`w-full rounded-t transition-all duration-300 ${
                    isToday
                      ? 'bg-primary shadow-lg shadow-primary/20'
                      : 'bg-primary/40 hover:bg-primary/60'
                  }`}
                  style={{ height: `${day.heightPercent}%` }}
                />
                
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                  <div className="glass-card-gold px-3 py-2 rounded text-xs whitespace-nowrap">
                    <div className="font-bold text-primary mb-1">{dayLabel}</div>
                    <div className="text-muted-foreground">
                      {day.commitCount} commit{day.commitCount !== 1 ? 's' : ''}
                    </div>
                    <div className="text-muted-foreground/70">
                      {day.uniqueContributors} contributor{day.uniqueContributors !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                
                {/* Date Label - show every 5th */}
                {idx % 5 === 0 && (
                  <div className="text-[9px] text-muted-foreground/60 mt-2 transform -rotate-45 origin-top-left">
                    {date.getDate()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
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
