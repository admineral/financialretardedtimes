'use client'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { UserProfileHover } from './UserProfileHover'
import { ChatMessage } from '../types'

interface UserHoverCardProps {
  username: string
  userMessages: ChatMessage[]
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

export function UserHoverCard({ 
  username, 
  userMessages, 
  children, 
  side = 'right',
  align = 'start'
}: UserHoverCardProps) {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
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
    </HoverCard>
  )
}



