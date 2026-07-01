'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { ChatViewer, ActivityTracker, UserProfileHeader } from './components'
import { ActivityProvider, useActivity } from '@/lib/activity-context'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RefreshCwIcon, LightbulbIcon, ExternalLinkIcon, ClockIcon, MessageCircleIcon, ZapIcon, CrownIcon, Trash2Icon, SearchIcon, UserIcon, HistoryIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

// Inner component that uses the context
function ChatArchiveContent() {
  const { 
    selectedDate,
    setRoom, 
    setUsername, 
    setSelectedDate,
    refreshActivities,
    clearActivities
  } = useActivity()
  const [isClearing, setIsClearing] = useState(false)
  const [isClearingAllCache, setIsClearingAllCache] = useState(false)
  const [activeTab, setActiveTab] = useState<'activity' | 'ideas'>('activity')
  
  // Ideas state
  const [ideasCache, setIdeasCache] = useState<Map<number, Array<{
    index: number
    title: string | null
    url: string | null
    content: string | null
    symbol: string | null
    imageUrl: string | null
    author: string | null
    publishedAt: string | null
    comments: number
    boosts: number
    isEditorsPick: boolean
    strategy: string | null
    chartId: string | null
    page: number
  }>>>(new Map())
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoadingPage, setIsLoadingPage] = useState(false)
  const [hasNextPage, setHasNextPage] = useState(true)
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set())
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set())
  const [isClearingIdeasCache, setIsClearingIdeasCache] = useState(false)
  const [ideasInitialized, setIdeasInitialized] = useState(false)

  // Get today's date in YYYY-MM-DD format
  const getTodayDateString = () => {
    const today = new Date()
    return format(today, 'yyyy-MM-dd')
  }

  const todayDate = getTodayDateString()
  
  // Get URL params on mount - use lazy initialization to avoid flickering
  const [initialParams] = useState<{room: string, username: string} | null>(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      const urlRoom = searchParams.get('room')
      const urlUsername = searchParams.get('username')
      
      if (urlRoom && urlUsername) {
        return {
          room: urlRoom,
          username: urlUsername
        }
      }
    }
    return null
  })
  
  // Form state for the URL input - initialize with URL params
  const [tradingViewUrl, setTradingViewUrl] = useState(() => {
    if (initialParams) {
      return `https://de.tradingview.com/chat/history/?room=${initialParams.room}&date=${todayDate}&tzoffset=-120&usernames=${initialParams.username}`
    }
    return ''
  })
  
  const [parsedParams, setParsedParams] = useState(() => {
    if (initialParams) {
      return {
        room: initialParams.room,
        date: todayDate,
        username: initialParams.username
      }
    }
    return {
      room: '',
      date: todayDate,
      username: ''
    }
  })

  // Parse URL parameters
  const parseUrl = (url: string) => {
    try {
      const urlObj = new URL(url)
      const params = new URLSearchParams(urlObj.search)
      
      return {
        room: params.get('room') || '',
        date: params.get('date') || '',
        username: params.get('usernames') || ''
      }
    } catch {
      return { room: '', date: '', username: '' }
    }
  }

  // Update context only once on mount when we have initialParams
  useEffect(() => {
    if (initialParams) {
      setRoom(initialParams.room)
      setUsername(initialParams.username)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps - run only once on mount

  // Update parsed params when URL changes
  useEffect(() => {
    const params = parseUrl(tradingViewUrl)
    setParsedParams(params)
    
    // Update context
    if (params.room) setRoom(params.room)
    if (params.username) setUsername(params.username)
  }, [tradingViewUrl, setRoom, setUsername])

  // Sync selectedDate from context to parsedParams
  useEffect(() => {
    const dateString = format(selectedDate, 'yyyy-MM-dd')
    setParsedParams(prev => ({ ...prev, date: dateString }))
  }, [selectedDate])

  // Handle activity date click
  const handleActivityDateClick = (date: Date) => {
    setSelectedDate(date)
  }

  // Fetch a specific page of ideas
  const fetchPageIdeas = useCallback(async (pageNumber: number) => {
    // Check cache first
    if (ideasCache.has(pageNumber)) {
      console.log(`📋 Using cached ideas for page ${pageNumber}`)
      return ideasCache.get(pageNumber)!
    }

    // Prevent concurrent requests for the same page
    if (loadingPages.has(pageNumber)) {
      console.log(`⏳ Page ${pageNumber} is already loading, waiting...`)
      while (loadingPages.has(pageNumber)) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      if (ideasCache.has(pageNumber)) {
        return ideasCache.get(pageNumber)!
      }
    }

    setLoadingPages(prev => new Set(prev).add(pageNumber))
    setIsLoadingPage(true)

    try {
      console.log(`🚀 Fetching page ${pageNumber} for ${parsedParams.username}`)
      
      const response = await fetch(`/Test/api/live-ideas?username=${encodeURIComponent(parsedParams.username)}&page=${pageNumber}`)
      const data = await response.json()
      
      if (response.ok && data.ideas) {
        setIdeasCache(prev => new Map(prev).set(pageNumber, data.ideas))
        setHasNextPage(data.hasNextPage)
        
        setFailedPages(prev => {
          const newSet = new Set(prev)
          newSet.delete(pageNumber)
          return newSet
        })
        
        console.log(`✅ Loaded page ${pageNumber}: ${data.ideas.length} ideas`)
        return data.ideas
      } else {
        console.warn(`⚠️ Failed to fetch page ${pageNumber}:`, data.error)
        setFailedPages(prev => new Set(prev).add(pageNumber))
        return []
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching page ${pageNumber}:`, error)
      setFailedPages(prev => new Set(prev).add(pageNumber))
      return []
    } finally {
      setLoadingPages(prev => {
        const newSet = new Set(prev)
        newSet.delete(pageNumber)
        return newSet
      })
      setIsLoadingPage(false)
    }
  }, [parsedParams.username, ideasCache, loadingPages])

  // Load initial ideas when Ideas tab is first opened
  useEffect(() => {
    if (activeTab === 'ideas' && !ideasInitialized && parsedParams.username) {
      console.log(`🚀 Initializing ideas for ${parsedParams.username}`)
      setIdeasInitialized(true)
      fetchPageIdeas(1)
    }
  }, [activeTab, ideasInitialized, parsedParams.username, fetchPageIdeas])

  // Handle page change
  const handlePageChange = async (newPage: number) => {
    setCurrentPage(newPage)
    if (!ideasCache.has(newPage)) {
      await fetchPageIdeas(newPage)
    }
  }

  // Clear ideas cache
  const clearIdeasCache = async () => {
    try {
      setIsClearingIdeasCache(true)
      
      const response = await fetch(`/Test/api/cache?username=${encodeURIComponent(parsedParams.username)}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        setIdeasCache(new Map())
        setCurrentPage(1)
        setHasNextPage(true)
        setFailedPages(new Set())
        
        console.log(`🗑️ Cleared ideas cache for ${parsedParams.username}`)
        
        // Reload first page
        await fetchPageIdeas(1)
      }
    } catch (error) {
      console.error('Error clearing ideas cache:', error)
    } finally {
      setIsClearingIdeasCache(false)
    }
  }

  // Handle force refresh (fetches fresh data from TradingView, updates database cache)
  const handleForceRefresh = async () => {
    if (!parsedParams.room || !parsedParams.username) return

    setIsClearing(true)

    try {
      await refreshActivities()
    } catch (error) {
      console.error('Error refreshing data:', error)
    } finally {
      setIsClearing(false)
    }
  }

  // Handle clearing ALL cache (DELETE ONLY - no auto-fetch)
  const handleClearAllCache = async () => {
    if (!parsedParams.room || !parsedParams.username) return

    const confirmed = window.confirm(
      `⚠️ DELETE ALL cached data for ${parsedParams.username}?\n\n` +
      `This will delete:\n` +
      `• Activity daily counts\n` +
      `• Activity messages\n` +
      `• User profile\n` +
      `• Chat messages\n\n` +
      `You will need to reload the page to fetch fresh data.`
    )

    if (!confirmed) return

    setIsClearingAllCache(true)

    try {
      // 1. Clear UI state immediately
      clearActivities()

      // 2. Delete all cached data from database
      console.log(`🗑️ Clearing all cache for ${parsedParams.username}...`)
      const deleteResponse = await fetch(
        `/api/cache-management?room=${encodeURIComponent(parsedParams.room)}&username=${encodeURIComponent(parsedParams.username)}`,
        { method: 'DELETE' }
      )

      if (deleteResponse.ok) {
        const result = await deleteResponse.json()
        console.log(`✅ Cleared ${result.totalDeleted} cached records`, result)
        alert(`✅ Deleted ${result.totalDeleted} records.\n\nReload the page to fetch fresh data.`)
      } else {
        const errorText = await deleteResponse.text()
        console.error('Failed to clear cache:', errorText)
        alert(`❌ Failed to clear cache: ${errorText}`)
      }
    } catch (error) {
      console.error('Error clearing cache:', error)
      alert(`❌ Error: ${error}`)
    } finally {
      setIsClearingAllCache(false)
    }
  }

  // Get current page ideas
  const currentPageIdeas = ideasCache.get(currentPage) || []

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-[1400px]">
        {/* Profile Header */}
        {parsedParams.room && parsedParams.username && (
          <div className="mb-8">
            <UserProfileHeader 
              username={parsedParams.username}
              room={parsedParams.room}
            />
          </div>
        )}

        {/* Tabs Section with Cache Clear Button */}
        <div className="mb-6">
          <div className="flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-6">
              <button 
                className={cn(
                  "pb-3 font-semibold transition-colors",
                  activeTab === 'activity' ? "border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab('activity')}
              >
                Activity
              </button>
              <button 
                className={cn(
                  "pb-3 font-semibold transition-colors",
                  activeTab === 'ideas' ? "border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab('ideas')}
              >
                Ideas
              </button>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              {/* Clear All Cache Button - Only show on Activity tab */}
              {activeTab === 'activity' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClearAllCache}
                        disabled={isClearingAllCache || isClearing || !parsedParams.room || !parsedParams.username}
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2Icon className={cn("h-5 w-5", isClearingAllCache && "animate-pulse")} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Clear ALL cache & re-fetch (migrate from legacy)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Refresh Button - changes based on active tab */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={activeTab === 'activity' ? handleForceRefresh : clearIdeasCache}
                      disabled={
                        activeTab === 'activity' 
                          ? (isClearing || isClearingAllCache || !parsedParams.room || !parsedParams.username)
                          : (isClearingIdeasCache || !parsedParams.username)
                      }
                      className="hover:bg-muted"
                    >
                      <RefreshCwIcon className={cn("h-5 w-5", (isClearing || isClearingIdeasCache) && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{activeTab === 'activity' ? 'Force refresh activity data' : 'Clear ideas cache'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Activity Tab Content */}
        {activeTab === 'activity' && parsedParams.room && parsedParams.username && (
          <div className="w-full mb-8">
            {/* Activity Tracker */}
            <ActivityTracker
              onDateClick={handleActivityDateClick}
            />
          </div>
        )}

        {/* Ideas Tab Content */}
        {activeTab === 'ideas' && (
          <div className="w-full mb-8">
            {currentPageIdeas.length > 0 ? (
              <div className="space-y-6">
                {/* Header */}
                <div>
                  <h3 className="text-xl font-semibold">Trading Ideas</h3>
                  <p className="text-sm text-muted-foreground">
                    Page {currentPage} • Showing {currentPageIdeas.length} ideas
                  </p>
                </div>
                
                {/* Ideas Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {currentPageIdeas.map((idea) => (
                    <Card key={idea.index} className="hover:shadow-lg transition-all duration-200 h-full flex flex-col">
                      <CardContent className="p-0 flex-1 flex flex-col">
                        {/* Chart preview image */}
                        <div className="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-t-lg overflow-hidden">
                          {idea.imageUrl ? (
                            <Image 
                              src={idea.imageUrl.includes('s3.tradingview.com') ? `/api/image-proxy?url=${encodeURIComponent(idea.imageUrl)}` : idea.imageUrl}
                              alt="Chart preview"
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-yellow-100 to-yellow-200">
                              <LightbulbIcon className="h-12 w-12 text-yellow-600" />
                            </div>
                          )}
                          
                          {/* Badges overlay */}
                          <div className="absolute top-3 left-3 flex gap-2">
                            {idea.isEditorsPick && (
                              <Badge className="bg-yellow-500 text-white text-xs">
                                <CrownIcon className="h-3 w-3 mr-1" />
                                Editor&apos;s Pick
                              </Badge>
                            )}
                            {idea.strategy && (
                              <Badge 
                                variant={idea.strategy === 'Long' ? 'default' : 'destructive'} 
                                className="text-xs"
                              >
                                {idea.strategy}
                              </Badge>
                            )}
                          </div>
                          
                          {/* Symbol overlay */}
                          {idea.symbol && (
                            <div className="absolute top-3 right-3">
                              <Badge variant="secondary" className="text-xs">
                                {idea.symbol}
                              </Badge>
                            </div>
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="p-4 flex-1 flex flex-col">
                          <div className="flex items-start gap-2 mb-2">
                            <h4 
                              className="font-semibold text-base leading-tight line-clamp-2 flex-1 cursor-pointer hover:text-primary transition-colors"
                              onClick={() => idea.url && window.open(idea.url, '_blank')}
                            >
                              {idea.title || 'Untitled Idea'}
                            </h4>
                            {idea.url && (
                              <button
                                onClick={() => idea.url && window.open(idea.url, '_blank')}
                                className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0 mt-0.5"
                              >
                                <ExternalLinkIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          
                          {idea.content && (
                            <p className="text-sm text-muted-foreground mb-4 line-clamp-3 flex-1">
                              {idea.content}
                            </p>
                          )}
                          
                          {/* Metadata footer */}
                          <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto">
                            {idea.publishedAt && (
                              <div className="flex items-center gap-1">
                                <ClockIcon className="h-3 w-3" />
                                {new Date(idea.publishedAt).toLocaleDateString()}
                              </div>
                            )}
                            
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                <MessageCircleIcon className="h-3 w-3" />
                                {idea.comments || 0}
                              </div>
                              
                              <div className="flex items-center gap-1">
                                <ZapIcon className="h-3 w-3" />
                                {idea.boosts || 0}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                {/* Pagination */}
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1 || isLoadingPage}
                  >
                    Previous
                  </Button>
                  
                  <div className="text-sm text-muted-foreground px-4">
                    Page {currentPage}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={!hasNextPage || isLoadingPage}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : isLoadingPage ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <h3 className="text-lg font-semibold">Loading Trading Ideas...</h3>
                <p className="text-muted-foreground">
                  Fetching ideas from TradingView
                </p>
              </div>
            ) : failedPages.has(currentPage) ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-12 h-12 text-red-500 mx-auto mb-4">⚠️</div>
                <h3 className="text-lg font-semibold">Page Temporarily Unavailable</h3>
                <p className="text-muted-foreground mb-4">
                  This page couldn&apos;t be loaded. This can happen with TradingView scraping.
                </p>
                <div className="flex gap-2 justify-center">
                  <Button 
                    onClick={async () => {
                      setFailedPages(prev => {
                        const newSet = new Set(prev)
                        newSet.delete(currentPage)
                        return newSet
                      })
                      await handlePageChange(currentPage)
                    }}
                    disabled={isLoadingPage}
                  >
                    Try Again
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setCurrentPage(1)}
                  >
                    Go to Page 1
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 space-y-4">
                <LightbulbIcon className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">Trading Ideas</h3>
                <p className="text-muted-foreground">
                  Loading ideas for {parsedParams.username}...
                </p>
            </div>
            )}
          </div>
        )}

        {/* Chat Viewer Section - Only show on Activity tab */}
        {activeTab === 'activity' && parsedParams.room && parsedParams.username && parsedParams.date && (
          <ChatViewer
            room={parsedParams.room}
            date={parsedParams.date}
            username={parsedParams.username}
            tradingViewUrl={tradingViewUrl}
            onAutoLoad={true}
            onDataFetched={() => {}}
            onDateChange={(newDate) => {
              setParsedParams(prev => ({ ...prev, date: newDate }))
              // Update the activity context selected date
              setSelectedDate(new Date(newDate))
            }}
            onUrlChange={(newUrl) => {
              setTradingViewUrl(newUrl)
            }}
          />
        )}
      </div>
    </div>
  )
}

// Loading screen component for immediate feedback
function LoadingScreen({ username }: { username?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6">
        {/* Animated loader */}
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 rounded-full" />
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        
        {/* Loading text */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            {username ? `Loading ${username}'s Profile...` : 'Loading Chat Archive...'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Fetching activity data
          </p>
        </div>
        
        {/* Progress dots */}
        <div className="flex justify-center gap-1">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// Constants for localStorage
const RECENT_USERS_KEY = 'chat-archive-recent-users'
const MAX_RECENT_USERS = 10
const DEFAULT_ROOM = 'bitcoin_de_DE'

interface RecentUser {
  username: string
  room: string
  lastVisited: number
}

// Helper to get recent users from localStorage
function getRecentUsers(): RecentUser[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(RECENT_USERS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Error reading recent users:', e)
  }
  return []
}

// Helper to save a user to recent users
function saveRecentUser(username: string, room: string) {
  if (typeof window === 'undefined') return
  try {
    const users = getRecentUsers()
    const filtered = users.filter(u => !(u.username === username && u.room === room))
    const newUser: RecentUser = { username, room, lastVisited: Date.now() }
    const updated = [newUser, ...filtered].slice(0, MAX_RECENT_USERS)
    localStorage.setItem(RECENT_USERS_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Error saving recent user:', e)
  }
}

// Helper to remove a user from recent users
function removeRecentUser(username: string, room: string) {
  if (typeof window === 'undefined') return
  try {
    const users = getRecentUsers()
    const filtered = users.filter(u => !(u.username === username && u.room === room))
    localStorage.setItem(RECENT_USERS_KEY, JSON.stringify(filtered))
  } catch (e) {
    console.error('Error removing recent user:', e)
  }
}

// User selection screen when no URL params
function UserSelectionScreen() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [room, setRoom] = useState(DEFAULT_ROOM)
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    setRecentUsers(getRecentUsers())
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
    
    setIsSearching(true)
    saveRecentUser(username.trim(), room)
    router.push(`/chat-archive?username=${encodeURIComponent(username.trim())}&room=${encodeURIComponent(room)}`)
  }

  const handleRecentUserClick = (user: RecentUser) => {
    saveRecentUser(user.username, user.room)
    router.push(`/chat-archive?username=${encodeURIComponent(user.username)}&room=${encodeURIComponent(user.room)}`)
  }

  const handleRemoveRecentUser = (e: React.MouseEvent, user: RecentUser) => {
    e.stopPropagation()
    removeRecentUser(user.username, user.room)
    setRecentUsers(getRecentUsers())
  }

  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Chat Archive</h1>
          <p className="text-muted-foreground">
            Search for a TradingView user to view their chat activity and statistics
          </p>
        </div>

        {/* Search Form */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium">
                  TradingView Username
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter username..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="room" className="text-sm font-medium">
                  Chat Room
                </label>
                <select
                  id="room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="bitcoin_de_DE">Bitcoin (DE)</option>
                  <option value="bitcoin">Bitcoin (EN)</option>
                  <option value="crypto_de_DE">Crypto (DE)</option>
                  <option value="crypto">Crypto (EN)</option>
                  <option value="stocks_de_DE">Stocks (DE)</option>
                  <option value="stocks">Stocks (EN)</option>
                  <option value="forex_de_DE">Forex (DE)</option>
                  <option value="forex">Forex (EN)</option>
                </select>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={!username.trim() || isSearching}
              >
                {isSearching ? (
                  <>
                    <RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <SearchIcon className="mr-2 h-4 w-4" />
                    View Activity
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Recent Users */}
        {recentUsers.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HistoryIcon className="h-4 w-4" />
              <span>Recent searches</span>
            </div>
            
            <div className="grid gap-2">
              {recentUsers.map((user, index) => (
                <Card 
                  key={`${user.username}-${user.room}-${index}`}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleRecentUserClick(user)}
                >
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <UserIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{user.username}</div>
                        <div className="text-xs text-muted-foreground">{user.room}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(user.lastVisited)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => handleRemoveRecentUser(e, user)}
                      >
                        <XIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            You can also access user profiles directly by clicking on usernames in the{' '}
            <a href="/Test" className="text-primary hover:underline">chat</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

// Wrapper to read URL params before initializing provider
function ChatArchiveWrapper() {
  const [urlParams, setUrlParams] = useState<{room: string, username: string} | null>(null)
  const [key, setKey] = useState(0) // Force remount when params change
  const [isLoading, setIsLoading] = useState(true)
  const [pendingUsername, setPendingUsername] = useState<string | null>(null)
  
  useEffect(() => {
    const updateParams = () => {
      if (typeof window !== 'undefined') {
        const searchParams = new URLSearchParams(window.location.search)
        const urlRoom = searchParams.get('room')
        const urlUsername = searchParams.get('username')
        
        // Track pending username for loading screen
        if (urlUsername) {
          setPendingUsername(urlUsername)
        }
        
        // Only proceed if we have both room and username from URL
        if (urlRoom && urlUsername) {
          // Save to recent users
          saveRecentUser(urlUsername, urlRoom)
          
          setUrlParams(prev => {
            // Check if params actually changed
            if (prev?.room !== urlRoom || prev?.username !== urlUsername) {
              setKey(k => k + 1) // Force remount of provider
              return {
                room: urlRoom,
                username: urlUsername
              }
            }
            return prev
          })
        }
        
        setIsLoading(false)
      }
    }
    
    // Initial read - immediate
    updateParams()
    
    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', updateParams)
    
    // Also check periodically for URL changes (handles programmatic navigation)
    const interval = setInterval(() => {
      const searchParams = new URLSearchParams(window.location.search)
      const urlRoom = searchParams.get('room')
      const urlUsername = searchParams.get('username')
      
      if (urlUsername) {
        setPendingUsername(urlUsername)
      }
      
      if (urlRoom && urlUsername) {
        setUrlParams(prev => {
          if (prev?.room !== urlRoom || prev?.username !== urlUsername) {
            setKey(k => k + 1)
            // Save to recent users
            saveRecentUser(urlUsername, urlRoom)
            return { room: urlRoom, username: urlUsername }
          }
          return prev
        })
      }
    }, 100)
    
    return () => {
      window.removeEventListener('popstate', updateParams)
      clearInterval(interval)
    }
  }, [])
  
  // Show loading screen during initial load or when we have a pending username but no params yet
  if (isLoading || (pendingUsername && !urlParams)) {
    return <LoadingScreen username={pendingUsername || undefined} />
  }
  
  // No URL params available - show user selection UI
  if (!urlParams) {
    return <UserSelectionScreen />
  }
  
  return (
    <ActivityProvider 
      key={key}
      initialRoom={urlParams.room} 
      initialUsername={urlParams.username}
    >
      <ChatArchiveContent />
    </ActivityProvider>
  )
}

// Main page component
export default function ChatArchivePage() {
  return <ChatArchiveWrapper />
}
