/**
 * NewspaperSidebar.tsx
 * 
 * Left sidebar displaying top contributors, active chatters, and trending topics.
 * 
 * LOCAL: Renders a sticky sidebar with three sections:
 * 1. Top Contributors - AI-selected 3 most interesting/valuable users with avatars
 * 2. Active Chatters - Top users by message count with avatars (fetched from Supabase)
 * 3. Trending Topics - Lists 3-5 discussion topics as clickable hashtags
 * 
 * GLOBAL: Receives data from the parent page component (shared with NewspaperContent).
 * Fetches active chatters directly from Supabase based on selectedDate.
 * Shows user profile hover cards with activity stats when hovering over chatters.
 * 
 * EXPORTS: NewspaperSidebar (React component)
 * 
 * PROPS:
 * - data: Partial<UnifiedNewspaperData> | undefined - Shared newspaper data
 * - isLoading: boolean - Whether content is currently loading
 * - selectedDate: string | null - Selected date for fetching chatters
 * - selectedDates: string[] - Selected dates for multi-day view
 */

'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from './ui/Skeleton'
import { createClient } from '@/lib/supabase/client'
import { UserHoverCard } from '@/app/Test/components/UserHoverCard'
import type { ChatMessage } from '@/app/Test/types'
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
  
  // Fetch active chatters directly from Supabase
  const [allChatters, setAllChatters] = useState<ActiveChatter[]>([])
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([])
  const [isLoadingChatters, setIsLoadingChatters] = useState(false)
  const [showAllChatters, setShowAllChatters] = useState(false)
  const [clickedUser, setClickedUser] = useState<string | null>(null)
  
  // Reset clicked state when component mounts or dates change (e.g., after navigation back)
  useEffect(() => {
    setClickedUser(null)
  }, [selectedDate, selectedDates])
  
  // Navigate to user profile in chat-archive with visual feedback
  const handleUserClick = useCallback((username: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Show brief click feedback then navigate
    setClickedUser(username)
    
    // Small delay to show the click effect before navigation
    setTimeout(() => {
      router.push(`/chat-archive?username=${encodeURIComponent(username)}&room=bitcoin_de_DE`)
    }, 100)
  }, [router])

  // Displayed chatters (limited or all)
  const activeChatters = showAllChatters ? allChatters : allChatters.slice(0, INITIAL_CHATTERS_COUNT)
  const hasMoreChatters = allChatters.length > INITIAL_CHATTERS_COUNT

  // Build a map of username -> messages for hover cards
  const messagesByUser = useMemo(() => {
    const map = new Map<string, ChatMessage[]>()
    for (const msg of allMessages) {
      const existing = map.get(msg.username)
      if (existing) {
        existing.push(msg)
      } else {
        map.set(msg.username, [msg])
      }
    }
    return map
  }, [allMessages])

  // Fetch chatters and messages when date changes
  useEffect(() => {
    const fetchChatters = async () => {
      // Use selectedDates if available, otherwise fall back to selectedDate
      const dates = selectedDates?.length ? selectedDates : (selectedDate ? [selectedDate] : [])
      if (dates.length === 0) return

      setIsLoadingChatters(true)
      setShowAllChatters(false) // Reset when date changes
      try {
        const supabase = createClient()
        
        // Build date ranges for all selected dates
        const dateRanges = dates.map(date => ({
          start: `${date}T00:00:00.000Z`,
          end: `${date}T23:59:59.999Z`
        }))

        // Fetch messages for all dates (with full message data for hover cards)
        const userMap = new Map<string, { avatar?: string; count: number }>()
        const fetchedMessages: ChatMessage[] = []
        
        for (const range of dateRanges) {
          const { data: messages, error } = await supabase
            .from('tv_chat_messages')
            .select('id, username, text, time, user_pic, user_id, is_moderator, badges, meta, symbol')
            .gte('time', range.start)
            .lte('time', range.end)
            .order('time', { ascending: true })
          
          if (error) {
            console.error('[NewspaperSidebar] Error fetching chatters:', error)
            continue
          }

          // Aggregate user data and collect messages
          for (const msg of messages || []) {
            const existing = userMap.get(msg.username)
            if (existing) {
              existing.count++
              if (!existing.avatar && msg.user_pic) {
                existing.avatar = msg.user_pic
              }
            } else {
              userMap.set(msg.username, {
                avatar: msg.user_pic || undefined,
                count: 1
              })
            }
            
            // Add to messages array for hover cards
            fetchedMessages.push({
              id: msg.id,
              username: msg.username,
              text: msg.text,
              time: msg.time,
              user_pic: msg.user_pic || undefined,
              user_id: msg.user_id || undefined,
              is_moderator: msg.is_moderator || false,
              badges: msg.badges || [],
              meta: msg.meta || undefined,
              symbol: msg.symbol || undefined
            })
          }
        }

        // Convert to array, sort by count (no limit - we'll slice in render)
        const chatters: ActiveChatter[] = Array.from(userMap.entries())
          .map(([username, data]) => ({
            username,
            avatar: data.avatar,
            messageCount: data.count
          }))
          .sort((a, b) => b.messageCount - a.messageCount)

        setAllChatters(chatters)
        setAllMessages(fetchedMessages)
      } catch (err) {
        console.error('[NewspaperSidebar] Error:', err)
      } finally {
        setIsLoadingChatters(false)
      }
    }

    fetchChatters()
  }, [selectedDate, selectedDates])

  // Build avatar lookup from allChatters to enrich topContributors
  const chatterAvatarMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const chatter of allChatters) {
      if (chatter.avatar) {
        map.set(chatter.username, chatter.avatar)
      }
    }
    return map
  }, [allChatters])

  // Enrich topContributors with avatars from activeChatters if not already set
  const enrichedContributors = useMemo(() => {
    if (!data?.topContributors) return undefined
    return data.topContributors.map(contributor => ({
      ...contributor,
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
                  userMessages={messagesByUser.get(contributor.username) || []}
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

        {/* Active Chatters Section - By message count (fetched from Supabase) */}
        <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mt-8 mb-4 pb-2 border-b border-foreground/20">
          Aktive Chatter
          {allChatters.length > 0 && (
            <span className="ml-2 text-[10px] font-normal text-muted-foreground/60">
              ({allChatters.length})
            </span>
          )}
        </h3>
        <ul className="space-y-2 font-body text-sm">
          {!isLoadingChatters && activeChatters.length > 0 ? (
            <>
              {activeChatters.map((chatter, idx) => {
                const isClicked = clickedUser === chatter.username
                return (
                  <UserHoverCard
                    key={idx}
                    username={chatter.username}
                    userMessages={messagesByUser.get(chatter.username) || []}
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
              {hasMoreChatters && (
                <li>
                  <button
                    onClick={() => setShowAllChatters(!showAllChatters)}
                    className="text-xs text-primary hover:underline cursor-pointer w-full text-left py-1"
                  >
                    {showAllChatters 
                      ? '↑ Weniger anzeigen' 
                      : `↓ ${allChatters.length - INITIAL_CHATTERS_COUNT} weitere anzeigen`
                    }
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

