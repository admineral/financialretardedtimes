/**
 * NewspaperSidebar.tsx
 * 
 * REDESIGNED: Premium dark edition sidebar
 * 
 * Features:
 * - Glassmorphism cards with gold accents
 * - Animated list items with stagger
 * - Hover cards for user profiles
 * - Message count badges
 */

'use client'

import { UserHoverCard } from '@/app/Test/components/UserHoverCard'
import { Avatar,AvatarFallback,AvatarImage } from '@/components/ui/avatar'
import { ChevronDown,Crown,Hash,TrendingUp,Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback,useEffect,useMemo,useState } from 'react'
import type { ActiveChatter,UnifiedNewspaperData } from '../lib/types'
import { useAvatarContext } from './AvatarContext'
import { Skeleton } from './ui/Skeleton'

interface NewspaperSidebarProps {
  data: Partial<UnifiedNewspaperData> | undefined
  isLoading: boolean
  selectedDate?: string | null
  selectedDates?: string[]
}

const INITIAL_CHATTERS_COUNT = 5

export function NewspaperSidebar({ data, selectedDate, selectedDates }: NewspaperSidebarProps) {
  const router = useRouter()
  const { addAvatars } = useAvatarContext()
  
  const [initialChatters, setInitialChatters] = useState<ActiveChatter[]>([])
  const [additionalChatters, setAdditionalChatters] = useState<ActiveChatter[]>([])
  const [totalChattersCount, setTotalChattersCount] = useState<number>(0)
  const [isLoadingInitial, setIsLoadingInitial] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [showAllChatters, setShowAllChatters] = useState(false)
  const [hasFetchedMore, setHasFetchedMore] = useState(false)
  const [clickedUser, setClickedUser] = useState<string | null>(null)
  
  useEffect(() => {
    setClickedUser(null)
    setShowAllChatters(false)
    setHasFetchedMore(false)
    setAdditionalChatters([])
  }, [selectedDate, selectedDates])
  
  const handleUserClick = useCallback((username: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setClickedUser(username)
    router.push(`/chat-archive?username=${encodeURIComponent(username)}&room=bitcoin_de_DE`)
  }, [router])

  const allChatters = useMemo(() => {
    return [...initialChatters, ...additionalChatters]
  }, [initialChatters, additionalChatters])

  const activeChatters = showAllChatters ? allChatters : initialChatters
  const hasMoreChatters = totalChattersCount > INITIAL_CHATTERS_COUNT

  useEffect(() => {
    const fetchInitialChatters = async () => {
      const dates = selectedDates?.length ? selectedDates : (selectedDate ? [selectedDate] : [])
      if (dates.length === 0) return

      setIsLoadingInitial(true)
      
      try {
        const response = await fetch(`/api/date-chatters?dates=${dates.join(',')}&limit=${INITIAL_CHATTERS_COUNT}`)
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`)

        const result = await response.json()
        
        if (result.chatters) {
          const chatters: ActiveChatter[] = result.chatters.map((c: { username: string; avatar: string | null; messageCount: number }) => ({
            username: c.username,
            avatar: c.avatar || undefined,
            messageCount: c.messageCount
          }))
          
          setInitialChatters(chatters)
          setTotalChattersCount(result.userCount || chatters.length)
          
          const avatarMap: Record<string, string | null> = {}
          for (const c of result.chatters) {
            avatarMap[c.username] = c.avatar
          }
          addAvatars(avatarMap)
        }
      } catch (err) {
        console.error('[NewspaperSidebar] Error fetching initial chatters:', err)
      } finally {
        setIsLoadingInitial(false)
      }
    }

    fetchInitialChatters()
  }, [selectedDate, selectedDates, addAvatars])

  const fetchMoreChatters = useCallback(async () => {
    if (hasFetchedMore || isLoadingMore) return
    
    const dates = selectedDates?.length ? selectedDates : (selectedDate ? [selectedDate] : [])
    if (dates.length === 0) return

    setIsLoadingMore(true)
    
    try {
      const response = await fetch(`/api/date-chatters?dates=${dates.join(',')}&limit=100`)
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`)

      const result = await response.json()
      
      if (result.chatters) {
        const allFetched: ActiveChatter[] = result.chatters.map((c: { username: string; avatar: string | null; messageCount: number }) => ({
          username: c.username,
          avatar: c.avatar || undefined,
          messageCount: c.messageCount
        }))
        
        const initialUsernames = new Set(initialChatters.map(c => c.username))
        const additional = allFetched.filter(c => !initialUsernames.has(c.username))
        
        setAdditionalChatters(additional)
        setTotalChattersCount(result.userCount || allFetched.length)
        setHasFetchedMore(true)
        
        const avatarMap: Record<string, string | null> = {}
        for (const c of result.chatters) {
          avatarMap[c.username] = c.avatar
        }
        addAvatars(avatarMap)
      }
    } catch (err) {
      console.error('[NewspaperSidebar] Error fetching more chatters:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [selectedDate, selectedDates, initialChatters, hasFetchedMore, isLoadingMore, addAvatars])

  const handleShowMore = useCallback(() => {
    if (!showAllChatters && !hasFetchedMore) {
      fetchMoreChatters()
    }
    setShowAllChatters(!showAllChatters)
  }, [showAllChatters, hasFetchedMore, fetchMoreChatters])

  const chatterAvatarMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const chatter of allChatters) {
      if (chatter.avatar) {
        map.set(chatter.username, chatter.avatar)
      }
    }
    return map
  }, [allChatters])

  const enrichedContributors = useMemo(() => {
    if (!data?.topContributors) return undefined
    return data.topContributors.map(contributor => ({
      ...contributor,
      avatar: contributor.avatar || chatterAvatarMap.get(contributor.username)
    }))
  }, [data?.topContributors, chatterAvatarMap])

  return (
    <div className="space-y-8">
      {/* Top Contributors Section */}
      <div>
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-primary/20">
          <Crown className="w-4 h-4 text-primary" />
          <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground">
            Top Beitragende
          </h3>
        </div>
        <ul className="space-y-2">
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
                    className={`
                      stagger-item flex items-center gap-2.5 cursor-pointer rounded-sm px-2 py-2 -mx-2
                      transition-all duration-200 group
                      ${isClicked 
                        ? 'bg-primary/20 scale-98' 
                        : 'hover:bg-card/80 active:scale-98'
                      }
                    `}
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className="relative">
                      <Avatar className={`h-7 w-7 border-2 border-primary/30 ${isClicked ? 'opacity-70' : ''}`}>
                        <AvatarImage 
                          src={contributor.avatar} 
                          alt={contributor.username}
                          className="rounded-full object-cover"
                        />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                          {contributor.initial || contributor.username?.slice(0, 1).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      {/* Rank indicator */}
                      {idx < 3 && (
                        <span className={`
                          absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[9px] font-bold
                          flex items-center justify-center
                          ${idx === 0 ? 'bg-amber-500 text-amber-950' : 
                            idx === 1 ? 'bg-gray-400 text-gray-900' : 
                            'bg-amber-700 text-amber-100'}
                        `}>
                          {idx + 1}
                        </span>
                      )}
                    </div>
                    <span className={`truncate flex-1 text-sm font-body group-hover:text-primary transition-colors ${isClicked ? 'opacity-70' : ''}`}>
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
            Array.from({ length: 3 }).map((_, idx) => (
              <li key={idx} className="flex items-center gap-2.5 px-2 py-2">
                <Skeleton className="w-7 h-7 rounded-full" />
                <Skeleton className="h-4 w-full max-w-[100px]" />
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Trending Topics Section */}
      <div>
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-primary/20">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground">
            Trending
          </h3>
        </div>
        <ul className="space-y-1.5">
          {data?.trendingTopics && data.trendingTopics.length > 0 ? (
            data.trendingTopics.map((topic, idx) => (
              <li 
                key={idx} 
                className="stagger-item text-sm text-primary hover:text-primary/80 cursor-pointer transition-colors flex items-center gap-1.5"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <Hash className="w-3.5 h-3.5 text-primary/50" />
                {topic}
              </li>
            ))
          ) : (
            Array.from({ length: 4 }).map((_, idx) => (
              <li key={idx} className="flex items-center gap-1.5">
                <Skeleton className="w-3.5 h-3.5 rounded" />
                <Skeleton className={`h-4 ${idx % 2 === 0 ? 'w-24' : 'w-20'}`} />
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Active Chatters Section */}
      <div>
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-primary/20">
          <Users className="w-4 h-4 text-blue-400" />
          <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground">
            Aktive Chatter
          </h3>
          {totalChattersCount > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground/50 ml-auto">
              {totalChattersCount}
            </span>
          )}
        </div>
        <ul className="space-y-1">
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
                      className={`
                        stagger-item flex items-center gap-2 cursor-pointer rounded-sm px-2 py-1.5 -mx-2
                        transition-all duration-200 group
                        ${isClicked 
                          ? 'bg-primary/20 scale-98' 
                          : 'hover:bg-card/80 active:scale-98'
                        }
                      `}
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <Avatar className={`h-5 w-5 border border-primary/20 ${isClicked ? 'opacity-70' : ''}`}>
                        <AvatarImage 
                          src={chatter.avatar} 
                          alt={chatter.username}
                          className="rounded-full object-cover"
                        />
                        <AvatarFallback className="bg-card text-[9px] font-semibold text-muted-foreground">
                          {chatter.username?.slice(0, 1).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`truncate flex-1 text-xs font-body group-hover:text-foreground transition-colors ${isClicked ? 'opacity-70' : 'text-muted-foreground'}`}>
                        {chatter.username}
                      </span>
                      {isClicked ? (
                        <div className="h-2.5 w-2.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
                          {chatter.messageCount}
                        </span>
                      )}
                    </li>
                  </UserHoverCard>
                )
              })}
              
              {hasMoreChatters && (
                <li className="pt-2">
                  <button
                    onClick={handleShowMore}
                    disabled={isLoadingMore}
                    className="
                      w-full text-xs text-muted-foreground hover:text-primary 
                      transition-colors flex items-center justify-center gap-1.5 
                      py-2 rounded-sm hover:bg-card/50 disabled:opacity-50
                    "
                  >
                    {isLoadingMore ? (
                      <>
                        <div className="h-2.5 w-2.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span>Lade...</span>
                      </>
                    ) : showAllChatters ? (
                      <>
                        <ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform" />
                        <span>Weniger</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>+{totalChattersCount - INITIAL_CHATTERS_COUNT} weitere</span>
                      </>
                    )}
                  </button>
                </li>
              )}
            </>
          ) : (
            Array.from({ length: 5 }).map((_, idx) => (
              <li key={idx} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className={`h-3 flex-1 max-w-[${60 + idx * 10}px]`} />
                <Skeleton className="h-3 w-6" />
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
