/**
 * ActivityHeatmap.tsx
 * 
 * Simple bar chart showing chat message activity over time.
 * Sits directly under the timeline - like volume bars under a price chart.
 * 
 * EXPORTS: ActivityHeatmap (React component)
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2, Flame } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

interface ActivityBucket {
  timestamp: string
  label: string
  count: number
  uniqueUsers: number
  intensity: number
}

interface ActivityStats {
  totalMessages: number
  totalUsers: number
  maxPerBucket: number
  peakTime: string
}

type TimelineMode = '24h' | '3d' | '7d'

interface ActivityHeatmapProps {
  className?: string
  mode?: TimelineMode
  onModeChange?: (mode: TimelineMode) => void
  autoStart?: boolean
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function getBarColor(intensity: number): string {
  if (intensity === 0) return 'hsl(var(--foreground) / 0.1)'
  if (intensity < 0.3) return 'hsl(160 84% 39% / 0.5)'
  if (intensity < 0.6) return 'hsl(160 84% 39% / 0.7)'
  if (intensity < 0.8) return 'hsl(38 92% 50% / 0.8)'
  return 'hsl(24 95% 53% / 0.9)'
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; count: number; uniqueUsers: number } }> }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-popover/95 backdrop-blur border border-border rounded px-2 py-1.5 text-[10px] whitespace-nowrap shadow-lg">
        <div className="font-mono font-medium text-foreground">{data.label}</div>
        <div className="text-muted-foreground text-[9px]">
          {data.count} msgs · {data.uniqueUsers} users
        </div>
      </div>
    )
  }
  return null
}

function CustomXAxisTick({ x, y, payload, mode }: { x: string | number; y: string | number; payload: { value: string }; mode: string }) {
  const xPos = Number(x)
  const yPos = Number(y)
  const label = payload.value as string
  
  // For 24h mode, just show time
  if (mode === '24h') {
    const time = label.split(' ').pop()?.replace(':00', '') || label
    return (
      <text x={xPos} y={yPos + 10} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">
        {time}
      </text>
    )
  }
  
  // For 3d/7d, show day and time
  const parts = label.split(' ')
  const date = parts[0] // "Dec 7" or similar
  const time = parts[1]?.replace(':00', '') || ''
  
  // Show date at midnight, otherwise just time
  if (time === '00' || time === '0') {
    return (
      <g>
        <text x={xPos} y={yPos + 10} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={9} fontWeight="600" fontFamily="monospace">
          {date}
        </text>
        <line x1={xPos} y1={yPos - 5} x2={xPos} y2={yPos + 2} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="2,2" />
      </g>
    )
  }
  
  return (
    <text x={xPos} y={yPos + 10} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">
      {time}
    </text>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export function ActivityHeatmap({
  className = '',
  mode: externalMode,
  onModeChange,
  autoStart = true,
}: ActivityHeatmapProps) {
  const [internalMode, setInternalMode] = useState<TimelineMode>('24h')
  const mode = externalMode ?? internalMode
  
  const [buckets, setBuckets] = useState<ActivityBucket[]>([])
  const [stats, setStats] = useState<ActivityStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Load activity data
  const loadActivity = useCallback(async () => {
    if (isLoading) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`/test-timeline/api/activity?mode=${mode}&_t=${Date.now()}`)
      if (!res.ok) throw new Error('Failed to load')
      
      const data = await res.json()
      setBuckets(data.buckets || [])
      setStats(data.stats || null)
      setHasLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setHasLoaded(true)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, mode])
  
  // Auto-start
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (autoStart && !hasStartedRef.current && !hasLoaded) {
      hasStartedRef.current = true
      loadActivity()
    }
  }, [autoStart, hasLoaded, loadActivity])
  
  // Handle mode change
  const handleModeChange = useCallback((newMode: TimelineMode) => {
    if (newMode === mode) return
    if (onModeChange) onModeChange(newMode)
    else setInternalMode(newMode)
    setHasLoaded(false)
    setBuckets([])
    setStats(null)
  }, [mode, onModeChange])
  
  // Reload when mode changes
  useEffect(() => {
    if (hasStartedRef.current && !hasLoaded && !isLoading) {
      loadActivity()
    }
  }, [mode, hasLoaded, isLoading, loadActivity])
  
  const labelInterval = mode === '24h' ? Math.max(1, Math.ceil(buckets.length / 12)) : 1
  
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Left: Mode & Stats */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {/* Mode pills */}
        <div className="flex items-center bg-foreground/[0.03] rounded p-0.5">
          {(['24h', '3d', '7d'] as TimelineMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              disabled={isLoading}
              className={`px-1.5 py-0.5 text-[8px] font-mono font-medium rounded transition-all ${
                mode === m 
                  ? 'bg-foreground/10 text-foreground' 
                  : 'text-foreground/40 hover:text-foreground/70'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        
        {/* Stats */}
        {stats && !isLoading && (
          <div className="flex items-center gap-1.5 text-[9px] text-foreground/50 font-mono">
            <span>{stats.totalMessages}</span>
            {stats.peakTime && (
              <>
                <Flame className="w-2.5 h-2.5 text-orange-500/70" />
                <span className="text-orange-500/70">{stats.peakTime}</span>
              </>
            )}
          </div>
        )}
        
        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-foreground/30" />}
      </div>
      
      {/* Right: Bar chart */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {hasLoaded && buckets.length > 0 && !isLoading && (
          <div ref={scrollRef} className="w-full h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={buckets}
                margin={{ top: 5, right: 5, left: 5, bottom: 25 }}
              >
                <XAxis 
                  dataKey="label" 
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                  interval={labelInterval}
                  tick={(props) => <CustomXAxisTick {...props} mode={mode} />}
                />
                <YAxis 
                  tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={25}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--foreground) / 0.05)' }} />
                <Bar 
                  dataKey="count" 
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                >
                  {buckets.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.intensity)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        
        {error && !isLoading && (
          <span className="text-[9px] text-red-500/50">error</span>
        )}
      </div>
    </div>
  )
}
