'use client'

import { useEffect, useRef } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { DramaSchema, type DramaData, type EventType } from './types'
import { Skeleton, getCategoryStyle, getEventStyle, SectionLoading } from './shared'

interface DramaSectionProps {
  selectedDate: string | null
  onLoadingChange?: (isLoading: boolean) => void
  onEventsChange?: (events: EventType[]) => void
}

export function DramaSection({ selectedDate, onLoadingChange, onEventsChange }: DramaSectionProps) {
  // Track which date we last generated for to prevent duplicate calls
  const lastGeneratedDateRef = useRef<string | null>(null)
  
  const { 
    object: dramaData, 
    submit: submitDrama, 
    isLoading,
    error
  } = useObject({
    api: '/Test/admin/api/summarize-v6',
    schema: DramaSchema,
  })

  const drama = dramaData as Partial<DramaData> | undefined

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(isLoading)
  }, [isLoading, onLoadingChange])

  // Notify parent of events for combining
  useEffect(() => {
    if (drama?.events && Array.isArray(drama.events)) {
      onEventsChange?.(drama.events as EventType[])
    }
  }, [drama?.events, onEventsChange])

  // Generate when date changes - only if it's a NEW date
  useEffect(() => {
    if (selectedDate && selectedDate !== lastGeneratedDateRef.current) {
      lastGeneratedDateRef.current = selectedDate
      submitDrama({ selectedDates: [selectedDate], promptId: 'drama-hunter' })
    }
  }, [selectedDate, submitDrama])

  const handleRegenerate = () => {
    if (selectedDate) {
      submitDrama({ selectedDates: [selectedDate], promptId: 'drama-hunter' })
    }
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
        Drama Error: {error.message}
        <button onClick={handleRegenerate} className="ml-2 underline">Retry</button>
      </div>
    )
  }

  return (
    <>
      {isLoading && <SectionLoading label="Drama-Hunter" />}
      
      {/* Third Article */}
      {drama?.thirdArticle && (
        <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
          <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
            <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
              {drama.thirdArticle.author}
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground">{drama.thirdArticle.date}</span>
            <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(drama.thirdArticle.category)}`}>
              {drama.thirdArticle.category}
            </span>
          </div>
          <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
            {drama.thirdArticle.headline}
          </h3>
          <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground">
            {drama.thirdArticle.summary}
          </p>
        </article>
      )}

      {/* Events Section */}
      <div className="mt-6 sm:mt-8">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-foreground/20">
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <span className="text-amber-500">⚡</span> Chat-Events
            {drama?.events && drama.events.length > 0 && (
              <span className="text-[10px] font-normal text-muted-foreground">({drama.events.length})</span>
            )}
          </h3>
        </div>
        
        {drama?.events && drama.events.length > 0 ? (
          <div className="space-y-4">
            {drama.events.map((event, idx) => (
              <div key={idx} className="p-3 sm:p-4 border border-foreground/20 bg-muted/20 rounded-sm">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${getEventStyle(event.type)}`}>
                    {event.category?.toUpperCase() || event.type?.toUpperCase()}
                  </span>
                  {event.timeRange && (
                    <span className="text-[10px] text-muted-foreground">
                      🕐 {event.timeRange}
                    </span>
                  )}
                </div>
                {event.label ? (
                  <h4 className="font-headline text-sm sm:text-base font-semibold mb-2">
                    {event.label}
                  </h4>
                ) : (
                  <Skeleton className="h-5 w-full mb-2" />
                )}
                {event.summary ? (
                  <p className="text-xs sm:text-sm text-muted-foreground font-body mb-3">
                    {event.summary}
                  </p>
                ) : (
                  <div className="space-y-1 mb-3">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                )}
                {event.participants && event.participants.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {event.participants.map((participant, pIdx) => (
                      <span key={pIdx} className="px-1.5 py-0.5 bg-background text-[10px] font-body rounded border border-foreground/10">
                        @{participant}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 sm:p-4 border border-foreground/20 bg-muted/20 rounded-sm">
              <div className="flex items-center gap-2 mb-2">
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-full mb-2" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-3/4 mb-3" />
              <div className="flex gap-1.5">
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-14 rounded" />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
