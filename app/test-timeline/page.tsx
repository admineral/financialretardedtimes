'use client'

import { ThemeSwitcher } from '@/components/theme-switcher'
import { ChatHistoryTimeline } from './components'

/**
 * Timeline Test Page
 * 
 * Test page for the Chat History Timeline component.
 */
export default function TimelineTestPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="w-full border-b border-foreground/10 py-3">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
          <h1 className="font-headline text-lg font-bold tracking-wide">
            Chat-Chronik
          </h1>
          <ThemeSwitcher />
        </div>
      </div>

      {/* Chat History Timeline */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-muted-foreground text-center text-sm mb-6">
          Wichtige Momente und Diskussionen aus dem TradingView-Chat
        </p>
        
        <div className="border border-foreground/10 rounded-lg p-6 bg-card">
          <ChatHistoryTimeline autoStart />
        </div>
      </div>

    </main>
  )
}

