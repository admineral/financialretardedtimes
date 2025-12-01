'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  ArrowLeftIcon,
  LightbulbIcon,
  CalendarIcon,
  ExternalLinkIcon,
  UserIcon,
  CircleIcon,
  ClockIcon,
  CrownIcon,
  MessageCircleIcon,
  ZapIcon,
  TrashIcon
} from 'lucide-react'
import { TradingViewUserProfile } from '../../types'
import { formatDistanceToNow } from 'date-fns'

function ProfilePageContent() {
  const params = useParams()
  const router = useRouter()
  const username = params.username as string
  
  const [profile, setProfile] = useState<TradingViewUserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Caching and pagination state
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
  // const [ideasPerPage] = useState(24) // Match what we actually get from pagination
  const [displayPerPage] = useState(24) // UI display: 6 rows x 4 columns (1:1 mapping)
  const [isLoadingPage, setIsLoadingPage] = useState(false)
  const [hasNextPage, setHasNextPage] = useState(true)
  const [prefetchingPages, setPrefetchingPages] = useState<Set<number>>(new Set())
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set())
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!username) return

    const fetchProfile = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const response = await fetch(`/Test/api/user-profile?username=${encodeURIComponent(username)}`)
        const data = await response.json()
        
        if (response.ok) {
          setProfile(data)
        } else {
          setError(data.error || 'Failed to fetch profile')
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        setError('Network error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [username])

  // Fetch a specific page of ideas
  const fetchPageIdeas = useCallback(async (pageNumber: number, isPrefetch: boolean = false) => {
    // Check cache first
    if (ideasCache.has(pageNumber)) {
      console.log(`📋 Using cached ideas for page ${pageNumber}`)
      return ideasCache.get(pageNumber)!
    }

    // Prevent concurrent requests for the same page
    if (loadingPages.has(pageNumber)) {
      console.log(`⏳ Page ${pageNumber} is already loading, waiting...`)
      // Wait for the other request to complete
      while (loadingPages.has(pageNumber)) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      // Check cache again after waiting
      if (ideasCache.has(pageNumber)) {
        return ideasCache.get(pageNumber)!
      }
    }

    // Mark this page as loading
    setLoadingPages(prev => new Set(prev).add(pageNumber))

    if (!isPrefetch) {
      setIsLoadingPage(true)
    } else {
      setPrefetchingPages(prev => new Set(prev).add(pageNumber))
    }

    try {
      console.log(`🚀 Fetching page ${pageNumber} for ${username}${isPrefetch ? ' (prefetch)' : ''}`)
      
      const response = await fetch(`/Test/api/live-ideas?username=${encodeURIComponent(username)}&page=${pageNumber}`)
      const data = await response.json()
      
      if (response.ok && data.ideas) {
        // Update cache
        setIdeasCache(prev => new Map(prev).set(pageNumber, data.ideas))
        setHasNextPage(data.hasNextPage)
        
        // Clear failed status if this page was previously failed
        setFailedPages(prev => {
          const newSet = new Set(prev)
          newSet.delete(pageNumber)
          return newSet
        })
        
        const cacheInfo = data.source?.startsWith('cached_') 
          ? `(cached, ${data.cacheAge || 0}min old)` 
          : '(fresh)'
        
        console.log(`✅ ${isPrefetch ? 'Prefetched' : 'Loaded'} page ${pageNumber}: ${data.ideas.length} ideas ${cacheInfo}`)
        return data.ideas
      } else {
        console.warn(`⚠️ Failed to fetch page ${pageNumber}:`, data.error)
        
        // For prefetch operations, fail silently
        if (isPrefetch) {
          console.log(`📋 Prefetch failed for page ${pageNumber}, continuing...`)
          return []
        }
        
        // For user-initiated requests, track as failed and show user-friendly message
        if (!isPrefetch) {
          setFailedPages(prev => new Set(prev).add(pageNumber))
        }
        console.log(`📋 Page ${pageNumber} temporarily unavailable, this can happen with TradingView scraping`)
        return []
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      if (isPrefetch) {
        console.log(`📋 Prefetch error for page ${pageNumber}:`, errorMessage)
      } else {
        console.warn(`⚠️ Error fetching page ${pageNumber}:`, errorMessage)
        setFailedPages(prev => new Set(prev).add(pageNumber))
      }
      
      return []
    } finally {
      // Remove from loading pages
      setLoadingPages(prev => {
        const newSet = new Set(prev)
        newSet.delete(pageNumber)
        return newSet
      })

      if (!isPrefetch) {
        setIsLoadingPage(false)
      } else {
        setPrefetchingPages(prev => {
          const newSet = new Set(prev)
          newSet.delete(pageNumber)
          return newSet
        })
      }
    }
  }, [username, ideasCache, loadingPages])

  // Load initial page
  const loadInitialIdeas = useCallback(async () => {
    await fetchPageIdeas(1)
    setCurrentPage(1)
  }, [fetchPageIdeas])

  // Auto-load ideas when profile is loaded
  useEffect(() => {
    if (profile && profile.ideas && profile.ideas > 0 && ideasCache.size === 0) {
      console.log(`🚀 Auto-loading ideas for ${profile.username}`)
      loadInitialIdeas()
    }
  }, [profile, ideasCache.size, loadInitialIdeas])

  // Clear cache for this profile
  const clearProfileCache = async () => {
    try {
      setIsClearingCache(true)
      
      // Clear server-side cache
      const response = await fetch(`/Test/api/cache?username=${encodeURIComponent(username)}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        // Clear client-side cache
        setIdeasCache(new Map())
        setCurrentPage(1)
        setHasNextPage(true)
        setFailedPages(new Set())
        
        console.log(`🗑️ Cleared cache for ${username}`)
        
        // Reload first page
        await loadInitialIdeas()
      } else {
        console.error('Failed to clear server cache')
      }
    } catch (error) {
      console.error('Error clearing cache:', error)
    } finally {
      setIsClearingCache(false)
    }
  }

  // Prefetch next pages when needed (currently disabled due to TradingView rate limiting)
  // const prefetchNextPages = async (currentPageNum: number) => {
  //   const nextPage = currentPageNum + 1
  //   const pageAfterNext = currentPageNum + 2
    
  //   // Prefetch next 2 pages if they're not already cached or being fetched
  //   const pagesToPrefetch = [nextPage, pageAfterNext].filter(page => 
  //     !ideasCache.has(page) && !prefetchingPages.has(page) && hasNextPage
  //   )
    
  //   if (pagesToPrefetch.length > 0) {
  //     console.log(`🔄 Prefetching pages: ${pagesToPrefetch.join(', ')}`)
  //     // Run prefetches in parallel
  //     await Promise.all(pagesToPrefetch.map(page => fetchPageIdeas(page, true)))
  //   }
  // }

  // Get ideas for current page (1:1 mapping now)
  const currentPageIdeas = ideasCache.get(currentPage) || []
  
  // Debug pagination
  console.log(`🔍 [FRONTEND] Current page: ${currentPage}, Ideas on this page: ${currentPageIdeas.length}`)
  console.log(`🔍 [FRONTEND] Showing ideas:`, currentPageIdeas.map(i => i.index))

  // Handle page change - now 1:1 mapping between display and server pages
  const handlePageChange = async (newPage: number) => {
    setCurrentPage(newPage)
    
    // With infinite scroll approach, each page number maps directly to server page
    const serverPageNeeded = newPage
    
    console.log(`📄 Loading page ${newPage} (server page ${serverPageNeeded})`)
    
    // Load the required server page if not cached
    if (!ideasCache.has(serverPageNeeded)) {
      console.log(`📄 Fetching server page ${serverPageNeeded}`)
      await fetchPageIdeas(serverPageNeeded)
    }
    
    // Note: Prefetching disabled to avoid rate limiting issues with TradingView
    // const nextServerPage = serverPageNeeded + 1
    // if (!ideasCache.has(nextServerPage) && hasNextPage) {
    //   console.log(`🔄 Prefetching server page ${nextServerPage}`)
    //   await fetchPageIdeas(nextServerPage, true)
    // }
  }

  // Calculate total possible pages (including unloaded ones)
  const calculateTotalPossiblePages = () => {
    if (!profile?.ideas) return Math.max(currentPage, 1)
    
    // If we have more pages available, estimate based on total ideas
    if (hasNextPage) {
      // Estimate total pages based on profile's total ideas
      return Math.ceil(profile.ideas / displayPerPage)
    }
    
    // If no more pages available, use current loaded pages
    return Math.max(currentPage, Array.from(ideasCache.keys()).length)
  }

  const totalPossiblePages = calculateTotalPossiblePages()

  const formatJoinDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown'
    try {
      const date = new Date(dateString)
      return formatDistanceToNow(date, { addSuffix: true })
    } catch {
      return 'Unknown'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/Test')}
            className="mb-6"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Chat
          </Button>
          
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-8 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="text-center">
                    <Skeleton className="h-8 w-16 mx-auto mb-2" />
                    <Skeleton className="h-4 w-20 mx-auto" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/Test')}
            className="mb-6"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Chat
          </Button>
          
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <UserIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Profile Not Found</h3>
                <p className="text-muted-foreground mb-4">{error}</p>
                <Button onClick={() => router.push('/Test')}>
                  Return to Chat
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <Button 
          variant="ghost" 
          onClick={() => router.push('/Test')}
          className="mb-6"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Chat
        </Button>

        {/* Profile Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 ring-4 ring-blue-500/20 hover:ring-blue-500/40 transition-all">
                <AvatarImage src={profile.avatar || undefined} alt={profile.username || 'User avatar'} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl font-bold">
                  <UserIcon className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">{profile.username}</h1>
                  <Button
                    size="sm"
                    onClick={() => window.open(`https://de.tradingview.com/u/${profile.username}/`, '_blank')}
                    className="gap-2"
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                    View on TradingView
                  </Button>
                </div>
                {profile.bio && (
                  <p className="text-muted-foreground">{profile.bio}</p>
                )}
                {profile.joinDate && (
                  <div className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Joined {formatJoinDate(profile.joinDate)}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 mb-1">
                  {profile.followers?.toLocaleString() || '—'}
                </div>
                <div className="text-sm text-muted-foreground">Followers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 mb-1">
                  {profile.following?.toLocaleString() || '—'}
                </div>
                <div className="text-sm text-muted-foreground">Following</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600 mb-1">
                  {profile.ideas?.toLocaleString() || '—'}
                </div>
                <div className="text-sm text-muted-foreground">Ideas</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600 mb-1">
                  {profile.scripts?.toLocaleString() || '—'}
                </div>
                <div className="text-sm text-muted-foreground">Scripts</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Details */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                Profile Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm font-medium text-muted-foreground">About</div>
                <div className="mt-1">
                  {profile.bio || profile.metaDescription || 'No bio available'}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleIcon className="h-5 w-5" />
                Account Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <Badge variant={profile.isOnline ? 'default' : 'secondary'}>
                  {profile.isOnline ? 'Online' : 'Offline'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ideas Section */}
        {profile.ideas && profile.ideas > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LightbulbIcon className="h-5 w-5 text-yellow-500" />
                  Trading Ideas ({profile.ideas.toLocaleString()})
                </div>
                <div className="flex gap-2">
                  {currentPageIdeas.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={clearProfileCache}
                      disabled={isClearingCache}
                      className="gap-1"
                    >
                      {isClearingCache ? (
                        <>
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Clearing...
                        </>
                      ) : (
                        <>
                          <TrashIcon className="h-3 w-3" />
                          Clear Cache
                        </>
                      )}
                    </Button>
                  )}
                  
                  {isLoadingPage && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </Badge>
                  )}
                  
                  {prefetchingPages.size > 0 && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Prefetching...
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Show extracted ideas if available */}
                {currentPageIdeas.length > 0 ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-semibold">Trading Ideas</h3>
                        <p className="text-sm text-muted-foreground">
                          Page {currentPage} • Showing {currentPageIdeas.length} ideas
                          {hasNextPage && ` • ${totalPossiblePages}+ pages available`}
                          {!hasNextPage && totalPossiblePages > 1 && ` • ${totalPossiblePages} total pages`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-sm px-3 py-1">
                          {currentPageIdeas.length} on this page
                        </Badge>
                        {hasNextPage && (
                          <Badge variant="outline" className="text-sm px-3 py-1">
                            More pages available
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Responsive 4-column grid for 24 ideas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {currentPageIdeas.map((idea) => (
                        <Card key={idea.index} className="hover:shadow-lg transition-all duration-200 h-full flex flex-col">
                          <CardContent className="p-0 flex-1 flex flex-col">
                            {/* Chart preview image */}
                            <div className="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-t-lg overflow-hidden">
                              {idea.imageUrl ? (
                                <Image 
                                  src={idea.imageUrl} 
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
                              <h4 className="font-semibold text-base leading-tight mb-2 line-clamp-2">
                                {idea.title || 'Untitled Idea'}
                              </h4>
                              
                              {idea.content && (
                                <p className="text-sm text-muted-foreground mb-4 line-clamp-3 flex-1">
                                  {idea.content}
                                </p>
                              )}
                              
                              {/* Metadata footer */}
                              <div className="space-y-3 mt-auto">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
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
                                
                                {idea.url && (
                                  <Button
                                    size="sm"
                                    className="w-full"
                                    onClick={() => idea.url && window.open(idea.url, '_blank')}
                                  >
                                    <ExternalLinkIcon className="h-3 w-3 mr-2" />
                                    View Full Analysis
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    
                    {/* Pagination */}
                    {totalPossiblePages > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-8">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        
                        <div className="flex gap-1">
                          {Array.from({ length: Math.min(totalPossiblePages, 10) }, (_, i) => {
                            // Show first few pages, current page area, and last few pages
                            let pageNum: number
                            if (totalPossiblePages <= 10) {
                              pageNum = i + 1
                            } else if (currentPage <= 5) {
                              pageNum = i + 1
                            } else if (currentPage >= totalPossiblePages - 4) {
                              pageNum = totalPossiblePages - 9 + i
                            } else {
                              pageNum = currentPage - 4 + i
                            }
                            
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePageChange(pageNum)}
                                className="w-10"
                              >
                                {pageNum}
                              </Button>
                            )
                          })}
                          
                          {totalPossiblePages > 10 && currentPage < totalPossiblePages - 4 && (
                            <>
                              <span className="px-2 text-muted-foreground">...</span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(totalPossiblePages)}
                                className="w-10"
                              >
                                {totalPossiblePages}
                              </Button>
                            </>
                          )}
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(Math.min(totalPossiblePages, currentPage + 1))}
                          disabled={currentPage === totalPossiblePages || !hasNextPage}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                    
                    {/* Status and External Links */}
                    <div className="text-center mt-8 space-y-4">
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Button 
                          variant="outline"
                          onClick={() => window.open(`https://de.tradingview.com/u/${profile.username}/`, '_blank')}
                          className="gap-2"
                        >
                          <ExternalLinkIcon className="h-4 w-4" />
                          View All {profile.ideas.toLocaleString()} on TradingView
                        </Button>
                      </div>
                      
                      <div className="flex flex-col items-center gap-2">
                        <div className="text-xs text-muted-foreground">
                          Page {currentPage} • {currentPageIdeas.length} ideas • Total available: {profile.ideas.toLocaleString()}
                          {hasNextPage && ' • Click pages to load more ideas'}
                        </div>
                        
                        {prefetchingPages.size > 0 && (
                          <div className="text-xs text-blue-600 flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Loading more ideas in background...
                          </div>
                        )}
                        
                        <div className="text-xs text-green-600">
                          💾 Ideas are cached for 24 hours for faster loading
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Loading state, error state, or fallback content when no ideas are loaded */
                  <div className="text-center py-8 border-2 border-dashed border-muted rounded-lg">
                    {isLoadingPage ? (
                      <div className="space-y-4">
                        <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <h3 className="text-lg font-semibold">Loading Trading Ideas...</h3>
                        <p className="text-muted-foreground">
                          Fetching recent trading ideas and analyses from TradingView
                        </p>
                        <p className="text-xs text-blue-600">
                          💡 If this takes long, the system will automatically retry once
                        </p>
                      </div>
                    ) : failedPages.has(currentPage) ? (
                      <div className="space-y-4">
                        <div className="w-12 h-12 text-red-500 mx-auto mb-4">⚠️</div>
                        <h3 className="text-lg font-semibold">Page Temporarily Unavailable</h3>
                        <p className="text-muted-foreground mb-4">
                          This page couldn&apos;t be loaded. This can happen with TradingView scraping due to rate limiting or temporary issues.
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
                      <div className="space-y-4">
                        <LightbulbIcon className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                          {profile.ideas.toLocaleString()} Trading Ideas & Analyses
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          {profile.username} has published {profile.ideas.toLocaleString()} detailed trading ideas, chart analyses, and market insights.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          <Button 
                            onClick={() => window.open(`https://de.tradingview.com/u/${profile.username}/`, '_blank')}
                            className="gap-2"
                          >
                            <ExternalLinkIcon className="h-4 w-4" />
                            View All Ideas
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => window.open(`https://de.tradingview.com/ideas/search/?author=${profile.username}`, '_blank')}
                            className="gap-2"
                          >
                            <LightbulbIcon className="h-4 w-4" />
                            Search Ideas
                          </Button>
                        </div>
                        
                        <div className="mt-6 text-sm text-muted-foreground">
                          💡 Ideas are loading automatically. More pages will load as you browse through the content.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    }>
      <ProfilePageContent />
    </Suspense>
  )
}