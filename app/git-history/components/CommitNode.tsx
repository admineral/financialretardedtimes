/**
 * Git History - CommitNode Component
 * 
 * Individual commit display in the git graph
 */

'use client'

import { GraphCommit } from '../lib/types'
import { GitCommit, GitMerge, User, Calendar, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

interface CommitNodeProps {
  commit: GraphCommit
  color: string
  laneWidth: number
  rowHeight: number
  maxLanes?: number
}

export function CommitNode({ commit, color, laneWidth, rowHeight, maxLanes = 8 }: CommitNodeProps) {
  const nodeX = commit.lane * laneWidth + laneWidth / 2
  const nodeSize = 20
  const graphWidth = maxLanes * laneWidth
  
  const getCommitTitle = (message: string) => {
    return message.split('\n')[0]
  }
  
  const getCommitBody = (message: string) => {
    const lines = message.split('\n')
    return lines.length > 1 ? lines.slice(1).join('\n').trim() : null
  }
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }
  
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) return 'gerade eben'
    if (diffInSeconds < 3600) return `vor ${Math.floor(diffInSeconds / 60)} Min.`
    if (diffInSeconds < 86400) return `vor ${Math.floor(diffInSeconds / 3600)} Std.`
    if (diffInSeconds < 604800) return `vor ${Math.floor(diffInSeconds / 86400)} Tagen`
    return formatDate(dateString)
  }

  return (
    <div className="flex items-center gap-3 group" style={{ minHeight: `${rowHeight}px` }}>
      {/* Graph node */}
      <div className="relative flex-shrink-0" style={{ width: `${graphWidth}px` }}>
        <div
          className="absolute"
          style={{
            left: `${nodeX}px`,
            top: `${rowHeight / 2}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className={`rounded-full flex items-center justify-center border-2 transition-all group-hover:scale-110 ${
              commit.isHead ? 'ring-2 ring-offset-2 ring-offset-background' : ''
            }`}
            style={{
              width: `${nodeSize}px`,
              height: `${nodeSize}px`,
              backgroundColor: color,
              borderColor: color,
              boxShadow: commit.isHead ? `0 0 8px ${color}` : 'none',
            }}
          >
            {commit.isMerge ? (
              <GitMerge className="w-3 h-3 text-background" />
            ) : (
              <GitCommit className="w-3 h-3 text-background" />
            )}
          </div>
        </div>
      </div>

      {/* Commit info */}
      <div className="flex-1 min-w-0 py-2">
        <div className="flex items-start gap-3">
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <div className="flex-1 min-w-0 cursor-pointer">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={commit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sm hover:text-primary transition-colors line-clamp-1 group-hover:underline"
                  >
                    {getCommitTitle(commit.message)}
                  </a>
                  {commit.isHead && commit.branches.length > 0 && (
                    <div className="flex gap-1">
                      {commit.branches.map(branch => (
                        <Badge
                          key={branch}
                          variant="outline"
                          className="text-xs px-1.5 py-0"
                          style={{ borderColor: color, color }}
                        >
                          {branch}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {commit.isMerge && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 text-purple-400 border-purple-400/30">
                      Merge
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    {commit.author.avatar ? (
                      <img
                        src={commit.author.avatar}
                        alt={commit.author.name}
                        className="w-4 h-4 rounded-full"
                      />
                    ) : (
                      <User className="w-3 h-3" />
                    )}
                    <span className="truncate max-w-[120px]">
                      {commit.author.username || commit.author.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{getRelativeTime(commit.date)}</span>
                  </div>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                    {commit.shortSha}
                  </code>
                </div>
              </div>
            </HoverCardTrigger>
            
            <HoverCardContent className="w-96" side="right">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm">
                      {getCommitTitle(commit.message)}
                    </h4>
                    <a
                      href={commit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  
                  {getCommitBody(commit.message) && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {getCommitBody(commit.message)}
                    </p>
                  )}
                </div>
                
                <div className="border-t pt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    {commit.author.avatar && (
                      <img
                        src={commit.author.avatar}
                        alt={commit.author.name}
                        className="w-6 h-6 rounded-full"
                      />
                    )}
                    <div>
                      <div className="text-sm font-medium">{commit.author.name}</div>
                      {commit.author.username && (
                        <div className="text-xs text-muted-foreground">@{commit.author.username}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    <div>Committed: {formatDate(commit.date)}</div>
                    <div className="font-mono mt-1">SHA: {commit.sha}</div>
                  </div>
                  
                  {commit.parents.length > 0 && (
                    <div className="text-xs">
                      <div className="text-muted-foreground">
                        Parents: {commit.parents.length}
                      </div>
                      <div className="font-mono text-muted-foreground mt-1">
                        {commit.parents.map(p => p.substring(0, 7)).join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>
    </div>
  )
}
