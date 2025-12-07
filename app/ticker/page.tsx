/**
 * Ticker Test Page
 * 
 * Demo page for the Chat Ticker component.
 * Shows the live scrolling ticker with chat events.
 */

'use client'

import { useState } from 'react'
import { ChatTicker } from '@/app/components/ChatTicker'
import { ThemeSwitcher } from '@/components/theme-switcher'
import Link from 'next/link'

export default function TickerPage() {
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal')
  
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-primary/20 bg-card/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/newspaper" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              ← Zurück
            </Link>
            <h1 className="font-headline text-xl font-bold gold-text">
              📺 Live Chat Ticker
            </h1>
          </div>
          <ThemeSwitcher />
        </div>
      </header>
      
      {/* Main Ticker */}
      <section className="border-b-2 border-primary/30">
        <ChatTicker speed={speed} autoStart />
      </section>
      
      {/* Controls */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="glass-card p-6 rounded-lg max-w-md">
          <h2 className="font-headline text-lg font-bold mb-4">⚙️ Einstellungen</h2>
          
          {/* Speed control */}
          <div className="mb-4">
            <label className="text-sm text-muted-foreground mb-2 block">Geschwindigkeit</label>
            <div className="flex gap-2">
              {(['slow', 'normal', 'fast'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-4 py-2 text-sm rounded-lg transition-all ${
                    speed === s 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {s === 'slow' ? '🐢 Langsam' : s === 'normal' ? '🚶 Normal' : '🏃 Schnell'}
                </button>
              ))}
            </div>
          </div>
          
          {/* Info */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Hover über den Ticker um zu pausieren</p>
            <p>• Klicke auf 🔄 um neue Events zu laden</p>
            <p>• Events der letzten 24 Stunden</p>
          </div>
        </div>
        
        {/* Event Type Legend */}
        <div className="glass-card p-6 rounded-lg max-w-2xl mt-6">
          <h2 className="font-headline text-lg font-bold mb-4">📊 Event-Typen</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500/50" />
              <span>🚀 Bullish</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/50" />
              <span>📉 Bearish</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500/50" />
              <span>😂 Funny</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500/50" />
              <span>🍿 Drama</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500/50" />
              <span>💡 Insight</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-cyan-500/50" />
              <span>📢 Call</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500/50" />
              <span>💀 Fail</span>
            </div>
          </div>
        </div>
        
        {/* Example usage */}
        <div className="glass-card p-6 rounded-lg max-w-2xl mt-6">
          <h2 className="font-headline text-lg font-bold mb-4">💻 Einbinden</h2>
          <pre className="bg-muted/50 p-4 rounded text-xs overflow-x-auto">
{`import { ChatTicker } from '@/app/components/ChatTicker'

// In deinem Layout oder Page:
<ChatTicker 
  speed="normal"  // 'slow' | 'normal' | 'fast'
  autoStart       // Automatisch laden
/>`}
          </pre>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="border-t border-primary/20 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-muted-foreground">
          Financial Retarded Times • Live Chat Ticker • Keine Finanzberatung
        </div>
      </footer>
    </main>
  )
}

