/**
 * NewspaperSidebar.tsx
 * 
 * Left sidebar displaying top contributors, active chatters, and trending topics.
 * 
 * OPTIMIZED VERSION:
 * - Initially fetches only 5 chatters (lightweight initial load)
 * - Fetches remaining chatters on "weitere anzeigen" click
 * - NO eager profile fetching - all profiles load on hover only
 * - Avatars come from chatters endpoint or use fallback
 * 
 * EXPORTS: NewspaperSidebar (React component)
 */

'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from './ui/Skeleton'
import { UserHoverCard } from '@/app/Test/components/UserHoverCard'
import type { UnifiedNewspaperData, ActiveChatter } from '../lib/types'

interface NewspaperSidebarProps {
  data: Partial<UnifiedNewspaperData> | undefined
  isLoading: boolean
  selectedDate?: string | null
  selectedDates?: string[]
}

const INITIAL_CHATTERS_COUNT = 5

export function NewspaperSidebar({ data, isLoading, selectedDate, selectedDates }: NewspaperSidebarProps) {
  const router = useRouter()
  
  // Active chatters state - staged loading
  const [initialChatters, setInitialChatters] = useState<ActiveChatter[]>([]) // First 5
  const [additionalChatters, setAdditionalChatters] = useState<ActiveChatter[]>([]) // Rest
  const [totalChattersCount, setTotalChattersCount] = useState<number>(0)
  const [isLoadingInitial, setIsLoadingInitial] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [showAllChatters, setShowAllChatters] = useState(false)
  const [hasFetchedMore, setHasFetchedMore] = useState(false)
  const [clickedUser, setClickedUser] = useState<string | null>(null)
  
  // Reset state when dates change
  useEffect(() => {
    setClickedUser(null)
    setShowAllChatters(false)
    setHasFetchedMore(false)
    setAdditionalChatters([])
  }, [selectedDate, selectedDates])
  
  // Navigate to user profile
  const handleUserClick = useCallback((username: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setClickedUser(username)
    router.push(`/chat-archive?username=${encodeURIComponent(username)}&room=bitcoin_de_DE`)
  }, [router])

  // Combine all chatters for display
  const allChatters = useMemo(() => {
    return [...initialChatters, ...additionalChatters]
  }, [initialChatters, additionalChatters])

  // Displayed chatters (limited or all)
  const activeChatters = showAllChatters ? allChatters : initialChatters
  const hasMoreChatters = totalChattersCount > INITIAL_CHATTERS_COUNT

  // Fetch INITIAL chatters (first 5) - runs on page load
  useEffect(() => {
    const fetchInitialChatters = async () => {
      const dates = selectedDates?.length ? selectedDates : (selectedDate ? [selectedDate] : [])
      if (dates.length === 0) return

      setIsLoadingInitial(true)
      
      try {
        // Only fetch first 5 chatters + get total count
        const response = await fetch(`/api/date-chatters?dates=${dates.join(',')}&limit=${INITIAL_CHATTERS_COUNT}`)
        
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`)
        }

        const result = await response.json()
        
        if (result.chatters) {
          const chatters: ActiveChatter[] = result.chatters.map((c: { username: string; avatar: string | null; messageCount: number }) => ({
            username: c.username,
            avatar: c.avatar || undefined,
            messageCount: c.messageCount
          }))
          
          setInitialChatters(chatters)
          // userCount from API tells us total unique users
          setTotalChattersCount(result.userCount || chatters.length)
        }
      } catch (err) {
        console.error('[NewspaperSidebar] Error fetching initial chatters:', err)
      } finally {
        setIsLoadingInitial(false)
      }
    }

    fetchInitialChatters()
  }, [selectedDate, selectedDates])

  // Fetch MORE chatters - only when "weitere anzeigen" is clicked
  const fetchMoreChatters = useCallback(async () => {
    if (hasFetchedMore || isLoadingMore) return
    
    const dates = selectedDates?.length ? selectedDates : (selectedDate ? [selectedDate] : [])
    if (dates.length === 0) return

    setIsLoadingMore(true)
    
    try {
      // Fetch all chatters (up to 100)
      const response = await fetch(`/api/date-chatters?dates=${dates.join(',')}&limit=100`)
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.chatters) {
        const allFetched: ActiveChatter[] = result.chatters.map((c: { username: string; avatar: string | null; messageCount: number }) => ({
          username: c.username,
          avatar: c.avatar || undefined,
          messageCount: c.messageCount
        }))
        
        // Only add chatters that aren't in initial set
        const initialUsernames = new Set(initialChatters.map(c => c.username))
        const additional = allFetched.filter(c => !initialUsernames.has(c.username))
        
        setAdditionalChatters(additional)
        setTotalChattersCount(result.userCount || allFetched.length)
        setHasFetchedMore(true)
      }
    } catch (err) {
      console.error('[NewspaperSidebar] Error fetching more chatters:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [selectedDate, selectedDates, initialChatters, hasFetchedMore, isLoadingMore])

  // Handle show more click
  const handleShowMore = useCallback(() => {
    if (!showAllChatters && !hasFetchedMore) {
      // First time clicking "show more" - fetch additional chatters
      fetchMoreChatters()
    }
    setShowAllChatters(!showAllChatters)
  }, [showAllChatters, hasFetchedMore, fetchMoreChatters])

  // Build avatar lookup from chatters - NO additional API calls
  const chatterAvatarMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const chatter of allChatters) {
      if (chatter.avatar) {
        map.set(chatter.username, chatter.avatar)
      }
    }
    return map
  }, [allChatters])

  // Enrich contributors with avatars from chatters ONLY (no eager profile fetching)
  const enrichedContributors = useMemo(() => {
    if (!data?.topContributors) return undefined
    return data.topContributors.map(contributor => ({
      ...contributor,
      // Use avatar from: 1) contributor data, 2) chatter map, 3) undefined (fallback shown)
      avatar: contributor.avatar || chatterAvatarMap.get(contributor.username)
    }))
  }, [data?.topContributors, chatterAvatarMap])

  return (
    <aside className="lg:col-span-2 hidden lg:block">
      <div className="sticky top-20">
        {/* Top Contributors Section - AI-selected */}
        <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-4 pb-2 border-b border-foreground/20">
          Top Beitragende
        </h3>
        <ul className="space-y-3 font-body text-sm">
          {enrichedContributors && enrichedContributors.length > 0 ? (
            enrichedContributors.map((contributor, idx) => {
              const isClicked = clickedUser === contributor.username
              return (
                <UserHoverCard
                  key={idx}
                  username={contributor.username}
                  userMessages={[]}
                  side="right"
                  align="start"
                  onClick={(e) => handleUserClick(contributor.username, e)}
                >
                  <li 
                    className={`flex items-center gap-2 cursor-pointer rounded-md px-1 py-0.5 -mx-1 transition-all duration-150 ${
                      isClicked 
                        ? 'bg-primary/20 scale-95' 
                        : 'hover:bg-muted/50 active:scale-95 active:bg-primary/10'
                    }`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleUserClick(contributor.username, e as unknown as React.MouseEvent)
                      }
                    }}
                  >
                    <Avatar className={`h-6 w-6 border border-foreground/20 ${isClicked ? 'opacity-70' : ''}`}>
                      <AvatarImage 
                        src={contributor.avatar} 
                        alt={contributor.username}
                        className="rounded-full object-cover"
                      />
                      <AvatarFallback className="bg-muted text-xs font-semibold">
                        {contributor.initial || contributor.username?.slice(0, 1).toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className={`truncate flex-1 ${isClicked ? 'opacity-70' : ''}`}>
                      {contributor.username || <Skeleton className="h-4 w-24" />}
                    </span>
                    {isClicked && (
                      <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    )}
                  </li>
                </UserHoverCard>
              )
            })
          ) : (
            <>
              <li className="flex items-center gap-2">
                <Skeleton className="w-6 h-6 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </li>
              <li className="flex items-center gap-2">
                <Skeleton className="w-6 h-6 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </li>
              <li className="flex items-center gap-2">
                <Skeleton className="w-6 h-6 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </li>
            </>
          )}
        </ul>

        {/* Trending Topics Section */}
        <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mt-8 mb-4 pb-2 border-b border-foreground/20">
          Trending Themen
        </h3>
        <ul className="space-y-2 font-body text-sm">
          {data?.trendingTopics && data.trendingTopics.length > 0 ? (
            data.trendingTopics.map((topic, idx) => (
              <li 
                key={idx} 
                className="text-primary hover:underline cursor-pointer"
              >
                #{topic}
              </li>
            ))
          ) : (
            <>
              <li><Skeleton className="h-4 w-28" /></li>
              <li><Skeleton className="h-4 w-24" /></li>
              <li><Skeleton className="h-4 w-32" /></li>
              <li><Skeleton className="h-4 w-20" /></li>
            </>
          )}
        </ul>

        {/* Active Chatters Section */}
        <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mt-8 mb-4 pb-2 border-b border-foreground/20">
          Aktive Chatter
          {totalChattersCount > 0 && (
            <span className="ml-2 text-[10px] font-normal text-muted-foreground/60">
              ({totalChattersCount})
            </span>
          )}
        </h3>
        <ul className="space-y-2 font-body text-sm">
          {!isLoadingInitial && activeChatters.length > 0 ? (
            <>
              {activeChatters.map((chatter, idx) => {
                const isClicked = clickedUser === chatter.username
                return (
                  <UserHoverCard
                    key={`${chatter.username}-${idx}`}
                    username={chatter.username}
                    userMessages={[]}
                    side="right"
                    align="start"
                    onClick={(e) => handleUserClick(chatter.username, e)}
                  >
                    <li 
                      className={`flex items-center gap-2 cursor-pointer rounded-md px-1 py-0.5 -mx-1 transition-all duration-150 ${
                        isClicked 
                          ? 'bg-primary/20 scale-95' 
                          : 'hover:bg-muted/50 active:scale-95 active:bg-primary/10'
                      }`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleUserClick(chatter.username, e as unknown as React.MouseEvent)
                        }
                      }}
                    >
                      <Avatar className={`h-5 w-5 border border-foreground/10 ${isClicked ? 'opacity-70' : ''}`}>
                        <AvatarImage 
                          src={chatter.avatar} 
                          alt={chatter.username}
                          className="rounded-full object-cover"
                        />
                        <AvatarFallback className="bg-muted text-[10px] font-semibold">
                          {chatter.username?.slice(0, 1).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`truncate flex-1 text-xs ${isClicked ? 'opacity-70' : ''}`}>
                        {chatter.username}
                      </span>
                      {isClicked ? (
                        <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {chatter.messageCount}
                        </Badge>
                      )}
                    </li>
                  </UserHoverCard>
                )
              })}
              
              {/* Show more button */}
              {hasMoreChatters && (
                <li>
                  <button
                    onClick={handleShowMore}
                    disabled={isLoadingMore}
                    className="text-xs text-primary hover:underline cursor-pointer w-full text-left py-1 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <>
                        <div className="h-2.5 w-2.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span>Lade weitere...</span>
                      </>
                    ) : showAllChatters ? (
                      <>↑ Weniger anzeigen</>
                    ) : (
                      <>↓ {totalChattersCount - INITIAL_CHATTERS_COUNT} weitere anzeigen</>
                    )}
                  </button>
                </li>
              )}
            </>
          ) : (
            <>
              <li className="flex items-center gap-2">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="h-3 w-20 flex-1" />
                <Skeleton className="h-4 w-6" />
              </li>
              <li className="flex items-center gap-2">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="h-3 w-16 flex-1" />
                <Skeleton className="h-4 w-6" />
              </li>
              <li className="flex items-center gap-2">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="h-3 w-24 flex-1" />
                <Skeleton className="h-4 w-6" />
              </li>
              <li className="flex items-center gap-2">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="h-3 w-18 flex-1" />
                <Skeleton className="h-4 w-6" />
              </li>
              <li className="flex items-center gap-2">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="h-3 w-22 flex-1" />
                <Skeleton className="h-4 w-6" />
              </li>
            </>
          )}
        </ul>
      </div>
    </aside>
  )
}
