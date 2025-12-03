/**
 * NewspaperSidebar.tsx
 * 
 * Left sidebar displaying top contributors and trending topics.
 * 
 * LOCAL: Renders a sticky sidebar with two sections:
 * 1. Top Contributors - Shows 3 most active/interesting users with avatars
 * 2. Trending Topics - Lists 3-5 discussion topics as clickable hashtags
 * 
 * GLOBAL: Receives data from the parent page component (shared with NewspaperContent).
 * Provides quick overview of who's active and what's being discussed.
 * 
 * EXPORTS: NewspaperSidebar (React component)
 * 
 * PROPS:
 * - data: Partial<UnifiedNewspaperData> | undefined - Shared newspaper data
 * - isLoading: boolean - Whether content is currently loading
 */

'use client'

import { Skeleton } from './ui/Skeleton'
import type { UnifiedNewspaperData } from '../lib/types'

interface NewspaperSidebarProps {
  data: Partial<UnifiedNewspaperData> | undefined
  isLoading: boolean
}

export function NewspaperSidebar({ data, isLoading }: NewspaperSidebarProps) {
  return (
    <aside className="lg:col-span-2 hidden lg:block">
      <div className="sticky top-20">
        {/* Top Contributors Section */}
        <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-4 pb-2 border-b border-foreground/20">
          Top Beitragende
        </h3>
        <ul className="space-y-3 font-body text-sm">
          {data?.topContributors && data.topContributors.length > 0 ? (
            data.topContributors.map((contributor, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                  {contributor.initial || '?'}
                </span>
                {contributor.username || <Skeleton className="h-4 w-24" />}
              </li>
            ))
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
      </div>
    </aside>
  )
}

