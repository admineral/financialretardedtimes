'use client'

import { ThemeSwitcher } from '@/components/theme-switcher'
import { FearGreedWidget } from './components'

/**
 * Fear & Greed Test Page
 * 
 * Simple test page for the FearGreedWidget component.
 */
export default function FearGreedTestPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="w-full border-b border-foreground/10 py-3">
        <div className="max-w-4xl mx-auto px-4 flex justify-between items-center">
          <h1 className="font-headline text-lg font-bold tracking-wide">
            Fear & Greed Index Test
          </h1>
          <ThemeSwitcher />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-8">
        <p className="text-muted-foreground text-center text-sm mb-6">
          Analysiert die Stimmung im TradingView Bitcoin-Chat
        </p>
        
        {/* The Widget - just drop it in! */}
        <FearGreedWidget />
      </div>

      {/* Usage Info */}
      <div className="max-w-md mx-auto px-4 py-8 border-t border-border">
        <h2 className="text-sm font-semibold mb-3">Einbinden in andere Seiten:</h2>
        <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto">
{`import { FearGreedWidget } from '@/app/test-fg/components'

// Basic usage:
<FearGreedWidget />

// Auto-start on mount:
<FearGreedWidget autoStart />

// With custom className:
<FearGreedWidget className="my-4" />`}
        </pre>
      </div>
    </main>
  )
}
