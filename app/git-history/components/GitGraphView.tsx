/**
 * Git History - GitGraphView Component
 * 
 * Main git graph visualization combining all components
 */

'use client'

import { useRef, useEffect, useState } from 'react'
import { GraphData } from '../lib/types'
import { CommitNode } from './CommitNode'
import { BranchLines } from './BranchLines'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, AlertCircle } from 'lucide-react'

interface GitGraphViewProps {
  graphData: GraphData | null
  isLoading: boolean
  error: string | null
}

const LANE_WIDTH = 40
const ROW_HEIGHT = 80

export function GitGraphView({ graphData, isLoading, error }: GitGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(600)
  
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerHeight(window.innerHeight - rect.top)
      }
    }
    
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin mb-4" />
          <p className="text-muted-foreground">Loading commit graph...</p>
        </div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
          <p className="text-destructive mb-2">Failed to load commit graph</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }
  
  if (!graphData || graphData.commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground">No commits to display</p>
          <p className="text-sm text-muted-foreground mt-2">
            Select branches from the sidebar to view commits
          </p>
        </div>
      </div>
    )
  }
  
  const totalHeight = graphData.commits.length * ROW_HEIGHT
  
  // Create CSS variables for branch colors
  const branchColorStyles = graphData.branches.reduce((acc, branch) => {
    acc[`--branch-color-${branch.name}`] = branch.color
    return acc
  }, {} as Record<string, string>)

  return (
    <div ref={containerRef} className="flex-1 h-full">
      <ScrollArea className="h-full">
        <div 
          className="relative"
          style={{ 
            minHeight: `${totalHeight}px`,
            ...branchColorStyles,
          }}
        >
          {/* SVG overlay for branch lines */}
          <BranchLines
            commits={graphData.commits}
            laneWidth={LANE_WIDTH}
            rowHeight={ROW_HEIGHT}
            height={totalHeight}
          />
          
          {/* Commit nodes */}
          <div className="relative z-10">
            {graphData.commits.map((commit) => {
              // Find the branch color for this commit
              const branch = graphData.branches.find(b => 
                commit.branches.includes(b.name) || b.sha === commit.sha
              )
              const color = branch?.color || '#64748b'
              
              return (
                <CommitNode
                  key={commit.sha}
                  commit={commit}
                  color={color}
                  laneWidth={LANE_WIDTH}
                  rowHeight={ROW_HEIGHT}
                />
              )
            })}
          </div>
        </div>
      </ScrollArea>
      
      {/* Stats footer */}
      <div className="border-t border-primary/10 p-3 bg-card/50">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {graphData.commits.length} commits across {graphData.branches.length} branches
          </span>
          <span>
            Max width: {graphData.maxLanes} lanes
          </span>
        </div>
      </div>
    </div>
  )
}
