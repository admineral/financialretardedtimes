/**
 * ShortNewsSidebar.tsx
 * 
 * Right sidebar section displaying brief news updates.
 * 
 * LOCAL: Renders a list of 3 short news items with:
 * - Author username
 * - Headline (clickable)
 * - Brief teaser text
 * Uses fixed-height slots to prevent layout shifts during streaming.
 * 
 * GLOBAL: Part of the right sidebar, receives data from the parent page.
 * Provides quick snippets for users who want a fast overview.
 * 
 * EXPORTS: ShortNewsSidebar (React component)
 * 
 * PROPS:
 * - data: Partial<UnifiedNewspaperData> | undefined - Shared newspaper data
 * - isLoading: boolean - Whether content is currently loading
 */

'use client'

import type { UnifiedNewspaperData } from '../lib/types'

interface ShortNewsSidebarProps {
  data: Partial<UnifiedNewspaperData> | undefined
  isLoading: boolean
}

/**
 * Inline skeleton that maintains the same height as text
 */
function InlineSkeleton({ width = 'w-24' }: { width?: string }) {
  return (
    <span className={`inline-block animate-pulse bg-muted/60 rounded h-[1em] ${width} align-middle`} />
  )
}

export function ShortNewsSidebar({ data, isLoading }: ShortNewsSidebarProps) {
  return (
    <div className="hidden lg:block mb-6">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-foreground/20">
        <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
          Kurzmeldungen
        </h3>
      </div>
      
      {/* Always render 3 fixed slots to prevent layout shifts */}
      {[0, 1, 2].map((slotIdx) => {
        const news = data?.shortNews?.[slotIdx]
        
        return (
          <article 
            key={slotIdx} 
            className={`mb-4 pb-4 border-b border-foreground/10 min-h-[80px] transition-opacity duration-300 ${
              !news && !isLoading ? 'opacity-0 h-0 min-h-0 pb-0 mb-0 border-0 overflow-hidden' : ''
            }`}
          >
            {/* Author */}
            <div className="flex items-center gap-2 mb-1 min-h-[16px]">
              <span className="text-xs text-muted-foreground">
                {news?.author ? `@${news.author}` : <InlineSkeleton width="w-20" />}
              </span>
            </div>
            
            {/* Headline */}
            <h4 className="font-headline text-sm font-semibold leading-snug hover:text-primary/80 cursor-pointer min-h-[1.4em]">
              {news?.headline || <InlineSkeleton width="w-full" />}
            </h4>
            
            {/* Teaser */}
            <p className="text-xs text-muted-foreground font-body mt-1 min-h-[2em]">
              {news?.teaser || <><InlineSkeleton width="w-full" /> <InlineSkeleton width="w-3/4" /></>}
            </p>
          </article>
        )
      })}
    </div>
  )
}
