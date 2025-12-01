'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCwIcon } from 'lucide-react'
import { useActivity } from '@/lib/activity-context'

interface CacheManagerProps {
  room: string
  username: string
  onDataFetched?: () => void
}

export function CacheManager({ room, username, onDataFetched }: CacheManagerProps) {
  const { refreshActivities, isLoading } = useActivity()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Handle force refresh (fetches fresh data from TradingView, updates database cache)
  const handleForceRefresh = async () => {
    if (!room || !username) return
    
    setIsRefreshing(true)
    
    try {
      await refreshActivities()
      
      // Trigger refresh in parent components
      if (onDataFetched) {
        onDataFetched()
      }
    } catch (error) {
      console.error('Error refreshing data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="w-full flex justify-end">
      <Button
        variant="outline"
        size="sm"
        onClick={handleForceRefresh}
        disabled={isRefreshing || isLoading || !room || !username}
        className="h-9"
      >
        <RefreshCwIcon className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
        {isRefreshing ? 'Refreshing...' : 'Force Refresh'}
      </Button>
    </div>
  )
}
