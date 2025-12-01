'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  TrashIcon, 
  RefreshCwIcon, 
  DatabaseIcon,
  ClockIcon,
  UsersIcon,
  FileTextIcon
} from 'lucide-react'

interface CacheStats {
  totalFiles: number
  totalUsers: number
  oldestEntryAge: number | null
  newestEntryAge: number | null
  cacheExpiration: string
}

export default function AdminPage() {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [userCacheInfo, setUserCacheInfo] = useState<{
    username: string
    cachedPages: number[]
    totalPages: number
  } | null>(null)

  const fetchCacheStats = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/Test/api/cache')
      const data = await response.json()
      setCacheStats(data)
    } catch (error) {
      console.error('Failed to fetch cache stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const clearExpiredCache = async () => {
    try {
      setIsLoading(true)
      await fetch('/Test/api/cache', { method: 'DELETE' })
      await fetchCacheStats()
    } catch (error) {
      console.error('Failed to clear expired cache:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const clearUserCache = async (targetUsername: string) => {
    try {
      setIsLoading(true)
      await fetch(`/Test/api/cache?username=${encodeURIComponent(targetUsername)}`, { 
        method: 'DELETE' 
      })
      await fetchCacheStats()
      if (userCacheInfo?.username === targetUsername) {
        setUserCacheInfo(null)
      }
    } catch (error) {
      console.error('Failed to clear user cache:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchUserCache = async () => {
    if (!username.trim()) return
    
    try {
      setIsLoading(true)
      const response = await fetch(`/Test/api/cache?username=${encodeURIComponent(username.trim())}`)
      const data = await response.json()
      setUserCacheInfo(data)
    } catch (error) {
      console.error('Failed to fetch user cache:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCacheStats()
  }, [])

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Cache Administration</h1>

        {/* Cache Statistics */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseIcon className="h-5 w-5" />
              Cache Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cacheStats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    {cacheStats.totalFiles}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <FileTextIcon className="h-4 w-4" />
                    Cache Files
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 mb-1">
                    {cacheStats.totalUsers}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <UsersIcon className="h-4 w-4" />
                    Users Cached
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600 mb-1">
                    {cacheStats.oldestEntryAge ? `${Math.round(cacheStats.oldestEntryAge / 60)}h` : '—'}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <ClockIcon className="h-4 w-4" />
                    Oldest Entry
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600 mb-1">
                    {cacheStats.newestEntryAge ? `${cacheStats.newestEntryAge}min` : '—'}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <ClockIcon className="h-4 w-4" />
                    Newest Entry
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">Loading cache statistics...</div>
            )}
            
            <div className="mt-6 flex gap-2 justify-center">
              <Button onClick={fetchCacheStats} disabled={isLoading} variant="outline">
                <RefreshCwIcon className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              
              <Button onClick={clearExpiredCache} disabled={isLoading} variant="destructive">
                <TrashIcon className="h-4 w-4 mr-2" />
                Clear Expired
              </Button>
            </div>
            
            <div className="mt-4 text-center">
              <Badge variant="secondary">
                Cache expires after {cacheStats?.cacheExpiration || '24 hours'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* User Cache Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5" />
              User Cache Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Enter username to check cache"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && fetchUserCache()}
              />
              <Button onClick={fetchUserCache} disabled={isLoading || !username.trim()}>
                Check Cache
              </Button>
            </div>

            {userCacheInfo && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Cache for @{userCacheInfo.username}</h3>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={() => clearUserCache(userCacheInfo.username)}
                    disabled={isLoading}
                  >
                    <TrashIcon className="h-3 w-3 mr-1" />
                    Clear Cache
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm">
                    <strong>Total cached pages:</strong> {userCacheInfo.totalPages}
                  </div>
                  
                  {userCacheInfo.cachedPages.length > 0 && (
                    <div className="text-sm">
                      <strong>Cached pages:</strong> 
                      <div className="flex flex-wrap gap-1 mt-1">
                        {userCacheInfo.cachedPages.map(page => (
                          <Badge key={page} variant="outline" className="text-xs">
                            Page {page}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {userCacheInfo.totalPages === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No cached data found for this user.
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
