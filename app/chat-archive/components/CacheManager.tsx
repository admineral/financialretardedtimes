'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2Icon } from 'lucide-react'
import { getClientCacheStats, clearClientActivityCache } from '@/lib/client-activity-cache'
import { useActivity } from '@/lib/activity-context'

interface CacheManagerProps {
  room: string
  username: string
  onDataFetched?: () => void
}

export function CacheManager({ room, username, onDataFetched }: CacheManagerProps) {
  const { refreshActivities } = useActivity()
  const [cacheStats, setCacheStats] = useState<{ totalEntries: number; totalSize: number }>({ 
    totalEntries: 0, 
    totalSize: 0 
  })
  const [isClearing, setIsClearing] = useState(false)

  // Load cache stats
  const loadCacheStats = () => {
    const stats = getClientCacheStats()
    setCacheStats(stats)
  }

  // Refresh stats on mount and when dependencies change
  useEffect(() => {
    loadCacheStats()
  }, [room, username])

  // Handle clear cache for this user/room
  const handleClearCache = () => {
    if (!room || !username) return
    
    const confirmed = window.confirm(
      `Are you sure you want to clear all cached data for ${username} in ${room}?\n\nThis will remove all stored activity data from localStorage.`
    )
    
    if (!confirmed) return
    
    setIsClearing(true)
    
    try {
      clearClientActivityCache(room, username)
      loadCacheStats()
      
      // Trigger refresh in parent components
      if (onDataFetched) {
        onDataFetched()
      }
      
      // Force refresh activities from API
      refreshActivities()
      
      alert('Cache cleared successfully!')
    } catch (error) {
      console.error('Error clearing cache:', error)
      alert('Failed to clear cache')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="w-full flex justify-end">
      <Button
        variant="destructive"
        size="sm"
        onClick={handleClearCache}
        disabled={isClearing || !room || !username || cacheStats.totalEntries === 0}
        className="h-9"
      >
        <Trash2Icon className="h-4 w-4 mr-2" />
        {isClearing ? 'Clearing Cache...' : 'Clear Cache'}
      </Button>
    </div>
  )
}
