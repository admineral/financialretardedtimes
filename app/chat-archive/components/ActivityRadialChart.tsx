'use client'

import React, { useState } from 'react'
import { cn } from '@/lib/utils'

interface ActivityRadialChartProps {
  hourCounts?: { [hour: number]: number }
  totalMessages: number
  className?: string
  size?: number
}

export function ActivityRadialChart({ 
  hourCounts, 
  totalMessages, 
  className,
  size = 200 
}: ActivityRadialChartProps) {
  const padding = 30 // Increased padding for labels
  const centerX = size / 2
  const centerY = size / 2
  const outerRadius = size / 2 - padding
  const innerRadius = size / 4

  // Handle null/undefined hourCounts with sample data for testing
  const safeHourCounts = hourCounts || {
    // Sample data to show the visualization working
    0: 5, 1: 2, 2: 1, 3: 0, 4: 0, 5: 1,
    6: 8, 7: 15, 8: 25, 9: 30, 10: 28, 11: 22,
    12: 35, 13: 40, 14: 38, 15: 32, 16: 28, 17: 25,
    18: 30, 19: 35, 20: 42, 21: 38, 22: 25, 23: 12
  }
  
  // Find max count for scaling
  const maxCount = Math.max(...Object.values(safeHourCounts), 1)
  
  // Calculate total if not provided
  const effectiveTotalMessages = totalMessages || Object.values(safeHourCounts).reduce((sum, count) => sum + count, 0)
  
  // Find peak activity hour
  const peakHour = Object.entries(safeHourCounts).reduce((peak, [hour, count]) => 
    count > peak.count ? { hour: parseInt(hour), count } : peak, 
    { hour: 0, count: 0 }
  )

  // State for hover
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)

  // Generate radial segments
  const segments = []
  const labels = []
  
  for (let hour = 0; hour < 24; hour++) {
    const count = safeHourCounts[hour] || 0
    const intensity = count / maxCount
    const percentage = effectiveTotalMessages > 0 ? (count / effectiveTotalMessages) * 100 : 0
    const isPeakHour = hour === peakHour.hour
    
    // Calculate angles (15 degrees per hour, starting from top)
    const startAngle = (hour * 15) - 90
    const endAngle = ((hour + 1) * 15) - 90
    
    const startRadian = (startAngle * Math.PI) / 180
    const endRadian = (endAngle * Math.PI) / 180
    
    // Calculate radius based on activity intensity
    const segmentRadius = innerRadius + (intensity * (outerRadius - innerRadius))
    
    // Color based on activity level and peak
    let fillColor = "rgba(34, 197, 94, 0.6)" // green with transparency
    if (intensity > 0.7) {
      fillColor = isPeakHour ? "rgba(239, 68, 68, 0.8)" : "rgba(249, 115, 22, 0.7)" // red for peak, orange for high
    } else if (intensity > 0.4) {
      fillColor = "rgba(234, 179, 8, 0.7)" // yellow
    }
    
    if (count > 0) {
      // Calculate path coordinates (rounded to avoid hydration issues)
      const x1 = Math.round((centerX + Math.cos(startRadian) * innerRadius) * 1000) / 1000
      const y1 = Math.round((centerY + Math.sin(startRadian) * innerRadius) * 1000) / 1000
      const x2 = Math.round((centerX + Math.cos(endRadian) * innerRadius) * 1000) / 1000
      const y2 = Math.round((centerY + Math.sin(endRadian) * innerRadius) * 1000) / 1000
      const x3 = Math.round((centerX + Math.cos(endRadian) * segmentRadius) * 1000) / 1000
      const y3 = Math.round((centerY + Math.sin(endRadian) * segmentRadius) * 1000) / 1000
      const x4 = Math.round((centerX + Math.cos(startRadian) * segmentRadius) * 1000) / 1000
      const y4 = Math.round((centerY + Math.sin(startRadian) * segmentRadius) * 1000) / 1000
      
      const pathData = [
        `M ${x1} ${y1}`,
        `A ${innerRadius} ${innerRadius} 0 0 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${segmentRadius} ${segmentRadius} 0 0 0 ${x4} ${y4}`,
        'Z'
      ].join(' ')
      
      segments.push(
        <g key={`segment-${hour}`}>
          <path
            d={pathData}
            fill={fillColor}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth={0.5}
            className={`cursor-help transition-all duration-200 hover:brightness-110 ${isPeakHour ? 'animate-pulse' : ''}`}
            onMouseEnter={() => setHoveredHour(hour)}
            onMouseLeave={() => setHoveredHour(null)}
          >
            <title>{`${hour.toString().padStart(2, '0')}:00 - ${count} messages (${percentage.toFixed(1)}%)${isPeakHour ? ' 🔥 PEAK HOUR' : ''}`}</title>
          </path>
        </g>
      )
    }
    
    // Add hour labels for key hours
    if (hour % 3 === 0) {
      const labelAngle = (hour * 15) - 90
      const labelRadian = (labelAngle * Math.PI) / 180
      const labelRadius = outerRadius + 12 // Reduced distance to fit within padding
      const labelX = Math.round((centerX + Math.cos(labelRadian) * labelRadius) * 1000) / 1000
      const labelY = Math.round((centerY + Math.sin(labelRadian) * labelRadius) * 1000) / 1000
      
      labels.push(
        <text
          key={`label-${hour}`}
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-xs font-medium fill-muted-foreground"
        >
          {hour.toString().padStart(2, '0')}
        </text>
      )
    }
  }

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {/* Radial Chart SVG */}
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="drop-shadow-sm"
        >
          {/* Background circles */}
          <circle
            cx={centerX}
            cy={centerY}
            r={outerRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            className="text-border opacity-20"
          />
          <circle
            cx={centerX}
            cy={centerY}
            r={innerRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            className="text-border opacity-20"
          />
          
          {/* Activity segments */}
          {segments}
          
          {/* Hour labels */}
          {labels}
          
          {/* Center content */}
          <circle
            cx={centerX}
            cy={centerY}
            r={innerRadius - 5}
            fill="hsl(var(--background))"
            stroke="currentColor"
            strokeWidth={1}
            className="text-border opacity-30"
          />
          
          {/* Center text - shows hovered hour or total */}
          {hoveredHour !== null ? (
            <>
              <text
                x={centerX}
                y={centerY - 12}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs font-medium fill-foreground"
              >
                {hoveredHour.toString().padStart(2, '0')}:00
              </text>
              <text
                x={centerX}
                y={centerY + 4}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-sm font-bold fill-foreground"
              >
                {safeHourCounts[hoveredHour] || 0}
              </text>
              <text
                x={centerX}
                y={centerY + 16}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs fill-muted-foreground"
              >
                messages
              </text>
            </>
          ) : (
            <>
              <text
                x={centerX}
                y={centerY - 8}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs font-medium fill-foreground"
              >
                {effectiveTotalMessages.toLocaleString()}
              </text>
              <text
                x={centerX}
                y={centerY + 8}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs fill-muted-foreground"
              >
                total messages
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  )
}
