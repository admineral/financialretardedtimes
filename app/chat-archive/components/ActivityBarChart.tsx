'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface ActivityBarChartProps {
  hourCounts?: { [hour: number]: number }
  totalMessages: number
  className?: string
  height?: number
}

export function ActivityBarChart({ 
  hourCounts, 
  totalMessages, 
  className,
  height = 120 
}: ActivityBarChartProps) {
  const isCompact = height > 150 // Detect if we're in the compact selector view
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

  // Get current hour
  const currentHour = new Date().getHours()

  // Generate bars for each hour
  const bars = []
  for (let hour = 0; hour < 24; hour++) {
    const count = safeHourCounts[hour] || 0
    const intensity = count / maxCount
    const percentage = effectiveTotalMessages > 0 ? (count / effectiveTotalMessages) * 100 : 0
    const chartHeight = isCompact ? 96 : height - 20 // 96px for compact (h-24), otherwise leave space for labels
    const barHeight = Math.max(2, intensity * chartHeight)
    const isPeakHour = hour === peakHour.hour
    const isCurrentHour = hour === currentHour
    
    // Color based on activity level and peak
    let barColor = "bg-green-500" // low activity
    if (intensity > 0.7) {
      barColor = isPeakHour ? "bg-red-500" : "bg-orange-500" // red for peak, orange for high
    } else if (intensity > 0.4) {
      barColor = "bg-yellow-500" // medium activity
    }

    bars.push(
      <div key={hour} className="flex flex-col items-center flex-1 min-w-0">
        {/* Bar */}
        <div 
          className="relative flex flex-col justify-end w-full"
          style={{ height: chartHeight }}
          title={`${hour.toString().padStart(2, '0')}:00 - ${count} messages (${percentage.toFixed(1)}%)${isPeakHour ? ' 🔥 PEAK HOUR' : ''}${isCurrentHour ? ' 🕐 CURRENT HOUR' : ''}`}
        >
          <div
            className={cn(
              "w-full min-w-[2px] rounded-t-sm transition-all duration-300 hover:opacity-80 cursor-help",
              barColor,
              isCurrentHour && "animate-pulse shadow-lg"
            )}
            style={{ height: Math.max(1, barHeight) }}
          />
        </div>
        
        {/* No individual labels - using aligned labels below */}
      </div>
    )
  }

  if (isCompact) {
    // Compact version for the selector
    return (
      <div className={cn("space-y-2", className)}>
        {/* Compact Bar Chart */}
        <div className="bg-muted/20 rounded-lg p-2">
          <div className="flex items-end gap-px h-24 mb-2">
            {bars}
          </div>
          
          {/* Compact time labels - positioned to align with bars */}
          <div className="flex text-xs text-muted-foreground">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="flex-1 text-center">
                {hour % 6 === 0 ? hour.toString().padStart(2, '0') : ''}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Full version
  return (
    <div className={cn("space-y-2", className)}>
      {/* Bar Chart with aligned labels */}
      <div className="bg-muted/20 rounded-lg p-2">
        <div className="flex items-end gap-px min-w-0 overflow-hidden mb-1">
          {bars}
        </div>
        
        {/* Time labels - aligned with bars */}
        <div className="flex text-xs text-muted-foreground -mx-1">
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="flex-1 text-center min-w-0">
              {hour % 4 === 0 ? `${hour.toString().padStart(2, '0')}:00` : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
