'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { ChatViewer, ActivityTracker, UserProfileHeader } from './components'
import { ActivityProvider, useActivity } from '@/lib/activity-context'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { RefreshCwIcon, LightbulbIcon, ExternalLinkIcon, ClockIcon, MessageCircleIcon, ZapIcon, CrownIcon } from 'lucide-react'
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

// Inner component that uses the context
function ChatArchiveContent() {
  const { 
    selectedDate,
    setRoom, 
    setUsername, 
    setSelectedDate,
    refreshActivities
  } = useActivity()
  const [isClearing, setIsClearing] = useState(false)
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
                        ? (isClearing || !parsedParams.room || !parsedParams.username)
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
  
  // No URL params available - show empty state
  if (!urlParams) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Chat Archive</h2>
          <p className="text-muted-foreground">Please select a user from the chat to view their activity.</p>
        </div>
      </div>
    )
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
