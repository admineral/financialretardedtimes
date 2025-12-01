'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  PlayIcon, 
  PauseIcon, 
  SettingsIcon,
  CheckIcon 
} from 'lucide-react'

interface PollingControlsProps {
  isEnabled: boolean
  interval: number
  onToggle: (enabled: boolean) => void
  onIntervalChange: (interval: number) => void
  className?: string
}

const INTERVAL_OPTIONS = [
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
  { value: 20000, label: '20s' }
]

export function PollingControls({
  isEnabled,
  interval,
  onToggle,
  onIntervalChange,
  className = ''
}: PollingControlsProps) {
  const [showIntervalSelector, setShowIntervalSelector] = useState(false)

  // Close interval selector when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowIntervalSelector(false)
    }

    if (showIntervalSelector) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showIntervalSelector])

  const currentIntervalLabel = INTERVAL_OPTIONS.find(opt => opt.value === interval)?.label || `${interval/1000}s`

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Auto-refresh toggle */}
      <Button
        variant={isEnabled ? "default" : "outline"}
        size="sm"
        onClick={() => onToggle(!isEnabled)}
        className="h-7 px-2 text-xs"
      >
        {isEnabled ? (
          <>
            <PauseIcon className="h-3 w-3 mr-1" />
            Auto
          </>
        ) : (
          <>
            <PlayIcon className="h-3 w-3 mr-1" />
            Manual
          </>
        )}
      </Button>

      {/* Interval selector */}
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            setShowIntervalSelector(!showIntervalSelector)
          }}
          disabled={!isEnabled}
          className="h-7 px-2 text-xs"
        >
          <SettingsIcon className="h-3 w-3 mr-1" />
          {currentIntervalLabel}
        </Button>

        {/* Dropdown menu */}
        {showIntervalSelector && (
          <div 
            className="absolute top-8 right-0 z-50 bg-background border rounded-md shadow-lg p-1 min-w-[80px]"
            onClick={(e) => e.stopPropagation()}
          >
            {INTERVAL_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onIntervalChange(option.value)
                  setShowIntervalSelector(false)
                }}
                className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-muted flex items-center justify-between ${
                  interval === option.value ? 'bg-muted' : ''
                }`}
              >
                <span>{option.label}</span>
                {interval === option.value && (
                  <CheckIcon className="h-3 w-3 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status indicator */}
      <Badge 
        variant={isEnabled ? "default" : "secondary"} 
        className="text-xs px-1.5 py-0.5"
      >
        {isEnabled ? 'Auto' : 'Manual'}
      </Badge>
    </div>
  )
}
