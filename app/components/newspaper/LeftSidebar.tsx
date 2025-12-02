'use client'

import { type ReporterData } from './types'
import { Skeleton } from './shared'

interface LeftSidebarProps {
  reporterData: Partial<ReporterData> | undefined
  isLoading: boolean
}

export function LeftSidebar({ reporterData, isLoading }: LeftSidebarProps) {
  const reporter = reporterData

  return (
    <aside className="lg:col-span-2 hidden lg:block">
      <div className="sticky top-20">
        <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-4 pb-2 border-b border-foreground/20">
          Top Trader
        </h3>
        <ul className="space-y-3 font-body text-sm">
          {reporter?.topTraders && reporter.topTraders.length > 0 ? (
            reporter.topTraders.map((trader, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                  {trader.initial || '?'}
                </span>
                {trader.username || <Skeleton className="h-4 w-24" />}
              </li>
            ))
          ) : (
            <>
              <li className="flex items-center gap-2"><Skeleton className="w-6 h-6 rounded-full" /><Skeleton className="h-4 w-28" /></li>
              <li className="flex items-center gap-2"><Skeleton className="w-6 h-6 rounded-full" /><Skeleton className="h-4 w-24" /></li>
              <li className="flex items-center gap-2"><Skeleton className="w-6 h-6 rounded-full" /><Skeleton className="h-4 w-20" /></li>
            </>
          )}
        </ul>

        <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mt-8 mb-4 pb-2 border-b border-foreground/20">
          Trending Themen
        </h3>
        <ul className="space-y-2 font-body text-sm">
          {reporter?.trendingTopics && reporter.trendingTopics.length > 0 ? (
            reporter.trendingTopics.map((topic, idx) => (
              <li key={idx} className="text-primary hover:underline cursor-pointer">
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

        <div className="mt-8 pt-4 border-t border-foreground/20">
          <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-3">
            Community Highlights
          </h3>
          <p className="text-xs text-muted-foreground font-body leading-relaxed">
            Top Beitragender diese Woche
          </p>
          {reporter?.communityHighlight?.username ? (
            <>
              <p className="font-headline font-semibold text-sm mt-1">{reporter.communityHighlight.username}</p>
              <p className="text-xs text-muted-foreground">
                {reporter.communityHighlight.contributionCount} {reporter.communityHighlight.label}
              </p>
            </>
          ) : (
            <>
              <Skeleton className="h-4 w-32 mt-1" />
              <Skeleton className="h-3 w-24 mt-1" />
            </>
          )}
        </div>
      </div>
    </aside>
  )
}

