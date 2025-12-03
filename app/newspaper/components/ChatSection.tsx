/**
 * ChatSection.tsx
 * 
 * Live chat widget for real-time community interaction.
 * 
 * LOCAL: Renders a memoized chat container with:
 * - Header showing "Live-Ticker" with LIVE indicator
 * - GuestbookChat component for actual chat functionality
 * 
 * GLOBAL: Embedded in the right sidebar of the newspaper page.
 * Memoized to prevent re-renders during AI content streaming.
 * 
 * EXPORTS: ChatSection (React component)
 * 
 * NOTE: This component is memoized using React.memo to prevent
 * unnecessary re-renders when parent state changes (e.g., during
 * AI content streaming). The chat should remain stable while
 * other content updates.
 */

'use client'

import { memo } from 'react'
import { GuestbookChat } from '@/components/guestbook-chat'

/**
 * Memoized chat section component.
 * Prevents re-renders during AI streaming to maintain chat stability.
 */
export const ChatSection = memo(function ChatSection() {
  return (
    <div className="border-2 border-foreground/30 bg-card">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b-2 border-foreground/30 bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
              Live-Ticker
            </h3>
            <p className="text-[10px] text-muted-foreground font-body">
              Echtzeit Community Chat
            </p>
          </div>
          {/* Live Indicator */}
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            LIVE
          </span>
        </div>
      </div>
      
      {/* Chat Content */}
      <GuestbookChat />
    </div>
  )
})

