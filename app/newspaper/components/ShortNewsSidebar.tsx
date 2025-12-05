/**
 * ShortNewsSidebar.tsx
 * 
 * REDESIGNED: Premium dark edition short news cards
 * 
 * Features:
 * - Compact news cards with gold accents
 * - Elegant typography
 * - Smooth loading animations
 */

'use client'

import { Newspaper } from 'lucide-react'
import type { UnifiedNewspaperData } from '../lib/types'

interface ShortNewsSidebarProps {
  data: Partial<UnifiedNewspaperData> | undefined
  isLoading: boolean
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-primary/10 rounded ${className}`} />
}

export function ShortNewsSidebar({ data, isLoading }: ShortNewsSidebarProps) {
  return (
    <div className="glass-card p-5 rounded-sm hidden lg:block">
      {/* Section Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-primary/20">
        <Newspaper className="w-4 h-4 text-primary/70" />
        <h3 className="font-headline text-sm font-bold uppercase tracking-wider gold-text">
          Kurzmeldungen
        </h3>
      </div>
      
      {/* News Items */}
      <div className="space-y-4">
        {[0, 1, 2].map((slotIdx) => {
          const news = data?.shortNews?.[slotIdx]
          
          if (!news && !isLoading) return null
          
          return (
            <article 
              key={slotIdx} 
              className={`
                stagger-item pb-4 border-b border-primary/10 last:border-0 last:pb-0
                ${!news && !isLoading ? 'hidden' : ''}
              `}
              style={{ animationDelay: `${slotIdx * 100}ms` }}
            >
              {/* Author */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] text-primary/70 font-mono">
                  {news?.author ? `@${news.author}` : <Skeleton className="w-16 h-3" />}
                </span>
              </div>
              
              {/* Headline */}
              <h4 className="font-headline text-sm font-semibold leading-snug text-foreground hover:text-primary/90 cursor-pointer transition-colors">
                {news?.headline || <Skeleton className="w-full h-4" />}
              </h4>
              
              {/* Teaser */}
              <div className="text-xs text-muted-foreground font-body mt-1.5 leading-relaxed line-clamp-2">
                {news?.teaser || (
                  <>
                    <Skeleton className="w-full h-3 mb-1" />
                    <Skeleton className="w-3/4 h-3" />
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
