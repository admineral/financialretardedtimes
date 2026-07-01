'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface ActivityClockProps {
  hourCounts?: { [hour: number]: number }
  totalMessages: number
  className?: string
  size?: number
  avatar?: {
    src: string
    fallbackSrc?: string
    alt: string
  }
}

export function ActivityClock({ 
  hourCounts, 
  totalMessages, 
  className,
  size = 200,
  avatar
}: ActivityClockProps) {
  const padding = 30 // Increased padding for labels
  const radius = size / 2 - padding
  const centerX = size / 2
  const centerY = size / 2
  const avatarRadius = radius - 25 // Avatar size - bigger now
  const [avatarError, setAvatarError] = React.useState(false)
  const [avatarLoaded, setAvatarLoaded] = React.useState(false)
  const [isAvatarHovered, setIsAvatarHovered] = React.useState(false)
  const loadedSrcRef = React.useRef<string | null>(null)

  // Preload avatar image with delay
  React.useEffect(() => {
    if (!avatar?.src) {
      setAvatarLoaded(false)
      loadedSrcRef.current = null
      return
    }
    
    // Don't reload if this src is already loaded
    if (avatarLoaded && loadedSrcRef.current === avatar.src) {
      return
    }
    
    // Reset states for new image
    setAvatarLoaded(false)
    setAvatarError(false)
    
    // Wait 5 seconds before loading the image
    const delayTimeout = setTimeout(() => {
      const img = new Image()
      img.onload = () => {
        setAvatarLoaded(true)
        loadedSrcRef.current = avatar.src
      }
      img.onerror = () => {
        if (avatar.fallbackSrc && !avatarError) {
          setAvatarError(true)
          // Try fallback
          const fallbackImg = new Image()
          fallbackImg.onload = () => {
            setAvatarLoaded(true)
            loadedSrcRef.current = avatar.fallbackSrc || null
          }
          fallbackImg.onerror = () => {
            setAvatarLoaded(false)
            loadedSrcRef.current = null
          }
          fallbackImg.src = avatar.fallbackSrc
        } else {
          setAvatarLoaded(false)
          loadedSrcRef.current = null
        }
      }
      img.src = avatar.src
    }, 5000)
    
    return () => clearTimeout(delayTimeout)
  }, [avatar?.src, avatar?.fallbackSrc, avatarError, avatarLoaded])

  // Handle null/undefined hourCounts with sample data for testing
  const safeHourCounts = hourCounts || {
    // Sample data to show the visualization working
    0: 5, 1: 2, 2: 1, 3: 0, 4: 0, 5: 1,
    6: 8, 7: 15, 8: 25, 9: 30, 10: 28, 11: 22,
    12: 35, 13: 40, 14: 38, 15: 32, 16: 28, 17: 25,
    18: 30, 19: 35, 20: 42, 21: 38, 22: 25, 23: 12
  }
  
  // Find max count for scaling
  const maxCount = Math.max(...Object.values(safeHourCounts), 1) // Ensure minimum of 1
  
  // Calculate total if not provided
  const effectiveTotalMessages = totalMessages || Object.values(safeHourCounts).reduce((sum, count) => sum + count, 0)
  
  // Find peak activity hour
  const peakHour = Object.entries(safeHourCounts).reduce((peak, [hour, count]) => 
    count > peak.count ? { hour: parseInt(hour), count } : peak, 
    { hour: 0, count: 0 }
  )
  
  // Generate hour markers and activity arcs
  const hourMarkers = []
  const activityArcs = []
  
  for (let hour = 0; hour < 24; hour++) {
    const angle = (hour * 15) - 90 // 15 degrees per hour (360/24 = 15), start from top (00:00)
    const radian = (angle * Math.PI) / 180
    
    const count = safeHourCounts[hour] || 0
    const intensity = count / maxCount
    const percentage = effectiveTotalMessages > 0 ? (count / effectiveTotalMessages) * 100 : 0
    
    // Hour marker positions (rounded to avoid hydration issues)
    const markerRadius = radius - 10
    const x1 = Math.round((centerX + Math.cos(radian) * (markerRadius - 5)) * 1000) / 1000
    const y1 = Math.round((centerY + Math.sin(radian) * (markerRadius - 5)) * 1000) / 1000
    const x2 = Math.round((centerX + Math.cos(radian) * markerRadius) * 1000) / 1000
    const y2 = Math.round((centerY + Math.sin(radian) * markerRadius) * 1000) / 1000
    
    // Hour labels (show key hours: 0, 6, 12, 18 for 24-hour format)
    const showLabel = hour % 6 === 0
    const labelX = Math.round((centerX + Math.cos(radian) * (radius + 12)) * 1000) / 1000
    const labelY = Math.round((centerY + Math.sin(radian) * (radius + 12)) * 1000) / 1000
    const displayHour = hour.toString().padStart(2, '0')
    
    hourMarkers.push(
      <g key={`marker-${hour}`}>
        {/* Hour tick */}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="currentColor"
          strokeWidth={showLabel ? 2 : 1}
          className="text-muted-foreground"
        />
        
        {/* Hour label */}
        {showLabel && (
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs font-medium fill-muted-foreground"
          >
            {displayHour}
          </text>
        )}
      </g>
    )
    
    // Activity arc for this hour
    if (count > 0) {
      const arcRadius = radius - 15 // Reduced to account for new padding
      const strokeWidth = Math.max(3, intensity * 15) // 3-15px based on activity
      const opacity = Math.max(0.4, intensity)
      const isPeakHour = hour === peakHour.hour
      
      // Color based on activity level and peak
      let strokeColor = "rgb(34, 197, 94)" // green-500 (low activity)
      if (intensity > 0.7) {
        strokeColor = isPeakHour ? "rgb(239, 68, 68)" : "rgb(249, 115, 22)" // red-500 for peak, orange-500 for high
      } else if (intensity > 0.4) {
        strokeColor = "rgb(234, 179, 8)" // yellow-500 (medium activity)
      }
      
      // Calculate arc path (15-degree segment)
      const startAngle = (hour * 15) - 97.5 // Start 7.5 degrees before
      const endAngle = (hour * 15) - 82.5   // End 7.5 degrees after
      
      const startRadian = (startAngle * Math.PI) / 180
      const endRadian = (endAngle * Math.PI) / 180
      
      const x1Arc = Math.round((centerX + Math.cos(startRadian) * arcRadius) * 1000) / 1000
      const y1Arc = Math.round((centerY + Math.sin(startRadian) * arcRadius) * 1000) / 1000
      const x2Arc = Math.round((centerX + Math.cos(endRadian) * arcRadius) * 1000) / 1000
      const y2Arc = Math.round((centerY + Math.sin(endRadian) * arcRadius) * 1000) / 1000
      
      activityArcs.push(
        <g key={`arc-${hour}`}>
          {/* Activity arc */}
          <path
            d={`M ${x1Arc} ${y1Arc} A ${arcRadius} ${arcRadius} 0 0 1 ${x2Arc} ${y2Arc}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity={opacity}
            className={`drop-shadow-sm ${isPeakHour ? 'animate-pulse' : ''}`}
          />
          
          {/* Peak hour indicator */}
          {isPeakHour && (
            <circle
              cx={centerX + Math.cos(radian) * (arcRadius)}
              cy={centerY + Math.sin(radian) * (arcRadius)}
              r={4}
              fill={strokeColor}
              className="animate-pulse drop-shadow-lg"
            />
          )}
          
          {/* Hover tooltip trigger */}
          <path
            d={`M ${x1Arc} ${y1Arc} A ${arcRadius} ${arcRadius} 0 0 1 ${x2Arc} ${y2Arc}`}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(strokeWidth, 10)}
            className="cursor-help"
          >
            <title>{`${hour.toString().padStart(2, '0')}:00 - ${count} messages (${percentage.toFixed(1)}%)${isPeakHour ? ' 🔥 PEAK HOUR' : ''}`}</title>
          </path>
        </g>
      )
    }
  }

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {/* Clock SVG */}
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="drop-shadow-sm"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
        >
          {/* Clock face background */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            className="text-border"
          />
          
          {/* Inner circle */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius - 30}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            className="text-muted-foreground/30"
          />
          
          {/* Hour markers */}
          {hourMarkers}
          
          {/* Activity arcs */}
          {activityArcs}
          
          {/* Current time indicator (24-hour format) */}
          {(() => {
            const now = new Date()
            const currentHour = now.getHours()
            const currentMinute = now.getMinutes()
            const currentTimeAngle = (currentHour * 15 + currentMinute * 0.25) - 90 // More precise with minutes
            const currentTimeRadian = (currentTimeAngle * Math.PI) / 180
            
            const indicatorLength = radius * 0.85
            const indicatorStartRadius = avatarRadius * 0.3 // Start from inside the avatar for better visibility
            const timeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`
            
            // Calculate position for time text at the tip of the indicator
            const textX = Math.round((centerX + Math.cos(currentTimeRadian) * indicatorLength) * 1000) / 1000
            const textY = Math.round((centerY + Math.sin(currentTimeRadian) * indicatorLength) * 1000) / 1000
            
            // Adjust text position slightly away from the dot
            const textOffset = 15
            const textDisplayX = Math.round((centerX + Math.cos(currentTimeRadian) * (indicatorLength + textOffset)) * 1000) / 1000
            const textDisplayY = Math.round((centerY + Math.sin(currentTimeRadian) * (indicatorLength + textOffset)) * 1000) / 1000
            
            return (
              <g>
                {/* Current time indicator line */}
                <line
                  x1={Math.round((centerX + Math.cos(currentTimeRadian) * indicatorStartRadius) * 1000) / 1000}
                  y1={Math.round((centerY + Math.sin(currentTimeRadian) * indicatorStartRadius) * 1000) / 1000}
                  x2={textX}
                  y2={textY}
                  stroke="rgb(30, 30, 30)" // dark gray/black for contrast
                  strokeWidth={3}
                  strokeLinecap="round"
                  className="drop-shadow-lg dark:stroke-white"
                  opacity={0.8}
                />
                
                {/* Current time dot at the end */}
                <circle
                  cx={textX}
                  cy={textY}
                  r={5}
                  fill="rgb(30, 30, 30)"
                  className="drop-shadow-lg dark:fill-white"
                />
                
                {/* Center dot */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={4}
                  fill="rgb(30, 30, 30)"
                  className="drop-shadow-md dark:fill-white"
                />
                
                {/* Current time text - only shown when avatar is hovered */}
                {isAvatarHovered && (
                  <text
                    x={textDisplayX}
                    y={textDisplayY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-sm font-bold fill-foreground drop-shadow-lg"
                    style={{
                      fontSize: '14px',
                      fontWeight: 'bold',
                    }}
                  >
                    {timeString}
                  </text>
                )}
              </g>
            )
          })()}
          
          {/* Center Avatar (if provided and loaded) - drawn last so it's on top */}
          {avatar && avatarLoaded ? (
            <>
              {/* Avatar clip path */}
              <defs>
                <clipPath id="avatar-clip">
                  <circle cx={centerX} cy={centerY} r={avatarRadius} />
                </clipPath>
              </defs>
              
              {/* Avatar group with hover effect */}
              <g 
                className="opacity-100 hover:opacity-0 transition-opacity cursor-pointer"
                onMouseEnter={() => setIsAvatarHovered(true)}
                onMouseLeave={() => setIsAvatarHovered(false)}
              >
                {/* Avatar border */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={avatarRadius + 2}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  className="text-border"
                />
                
                {/* Avatar image - only shown when loaded */}
                <image
                  href={avatarError && avatar.fallbackSrc ? avatar.fallbackSrc : avatar.src}
                  x={centerX - avatarRadius}
                  y={centerY - avatarRadius}
                  width={avatarRadius * 2}
                  height={avatarRadius * 2}
                  clipPath="url(#avatar-clip)"
                  preserveAspectRatio="xMidYMid slice"
                />
              </g>
            </>
          ) : !avatar ? (
            /* Center dot (fallback when no avatar provided) */
            <circle
              cx={centerX}
              cy={centerY}
              r={3}
              fill="currentColor"
              className="text-muted-foreground"
            />
          ) : null}
        </svg>
      </div>
      
    </div>
  )
}
