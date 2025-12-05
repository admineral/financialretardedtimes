'use client'

import { useState, useCallback } from 'react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { UserProfileHover } from './UserProfileHover'
import { ChatMessage } from '../types'

interface UserHoverCardProps {
  username: string
  userMessages: ChatMessage[]
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  onClick?: (e: React.MouseEvent) => void
}

/**
 * UserHoverCard - Shows user profile on hover
 * 
 * CRITICAL OPTIMIZATION: Only renders HoverCardContent AFTER first open
 * This prevents any child component mounting/hydration from triggering hooks
 */
export function UserHoverCard({ 
  username, 
  userMessages, 
  children, 
  side = 'right',
  align = 'start',
  onClick
}: UserHoverCardProps) {
  // Track if hover card has EVER been opened
  const [hasEverOpened, setHasEverOpened] = useState(false)

  const handleOpenChange = useCallback((open: boolean) => {
    if (open && !hasEverOpened) {
      setHasEverOpened(true)
    }
  }, [hasEverOpened])

  return (
    <HoverCard openDelay={300} closeDelay={100} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild onClick={onClick}>
        {children}
      </HoverCardTrigger>
      {/* CRITICAL: Don't render HoverCardContent at ALL until first open */}
      {/* This prevents Radix from evaluating/hydrating children on mount */}
      {hasEverOpened && (
        <HoverCardContent 
          side={side} 
          align={align}
          className="w-auto p-0 border-0 shadow-lg"
          sideOffset={8}
        >
          <UserProfileHover 
            username={username} 
            userMessages={userMessages}
          />
        </HoverCardContent>
      )}
    </HoverCard>
  )
}
