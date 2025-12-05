/**
 * ChatSection.tsx
 * 
 * REDESIGNED: Premium dark edition live chat widget
 * 
 * Features:
 * - Glassmorphism container with gold accents
 * - Animated live indicator
 * - Memoized for performance
 */

'use client'

import { memo } from 'react'
import { Radio } from 'lucide-react'
import { GuestbookChat } from '@/components/guestbook-chat'

export const ChatSection = memo(function ChatSection() {
  return (
    <div className="glass-card overflow-hidden rounded-sm">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b border-primary/20 bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-headline text-sm font-bold uppercase tracking-wider gold-text">
                Live-Ticker
              </h3>
              <p className="text-[10px] text-muted-foreground/60 font-body">
                Echtzeit Community Chat
              </p>
            </div>
          </div>
          {/* Live Indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-wider">
              Live
            </span>
          </div>
        </div>
      </div>
      
      {/* Chat Content */}
      <GuestbookChat />
    </div>
  )
})
