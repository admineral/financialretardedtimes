/**
 * Git History - BranchLines Component
 * 
 * SVG overlay for drawing connections between commits
 */

'use client'

import { GraphCommit } from '../lib/types'
import { calculateConnections, generateConnectionPath } from '../lib/graph-utils'

interface BranchLinesProps {
  commits: GraphCommit[]
  laneWidth: number
  rowHeight: number
  height: number
}

export function BranchLines({ commits, laneWidth, rowHeight, height }: BranchLinesProps) {
  const connections = calculateConnections(commits)
  
  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      style={{
        width: `${laneWidth * 8}px`,
        height: `${height}px`,
      }}
    >
      <defs>
        {/* Gradient for merge lines */}
        <linearGradient id="mergeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgb(168, 85, 247)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="rgb(168, 85, 247)" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      
      {connections.map((connection, index) => {
        const fromCommit = commits.find(c => c.sha === connection.fromSha)
        const toCommit = commits.find(c => c.sha === connection.toSha)
        
        if (!fromCommit || !toCommit) return null
        
        const fromX = connection.fromLane * laneWidth + laneWidth / 2
        const toX = connection.toLane * laneWidth + laneWidth / 2
        const fromY = connection.fromIndex * rowHeight + rowHeight / 2
        const toY = connection.toIndex * rowHeight + rowHeight / 2
        
        const path = generateConnectionPath(fromX, fromY, toX, toY, connection.isMerge)
        
        // Get color from the source commit
        const strokeColor = connection.isMerge 
          ? 'url(#mergeGradient)' 
          : fromCommit.branches.length > 0
          ? `var(--branch-color-${fromCommit.branches[0]}, rgb(100, 116, 139))`
          : 'rgb(100, 116, 139)'
        
        return (
          <path
            key={`${connection.fromSha}-${connection.toSha}-${index}`}
            d={path}
            stroke={strokeColor}
            strokeWidth={connection.isMerge ? 2.5 : 2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={connection.isMerge ? 0.7 : 0.5}
            className="transition-opacity hover:opacity-100"
          />
        )
      })}
      
      {/* Vertical lane guides (optional, subtle) */}
      {Array.from({ length: 8 }).map((_, laneIndex) => {
        const x = laneIndex * laneWidth + laneWidth / 2
        return (
          <line
            key={`lane-${laneIndex}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke="rgb(100, 116, 139)"
            strokeWidth={0.5}
            opacity={0.1}
            strokeDasharray="4 4"
          />
        )
      })}
    </svg>
  )
}
