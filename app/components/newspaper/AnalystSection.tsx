'use client'

import { useEffect, useRef } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { AnalystSchema, type AnalystData, type HighlightType } from './types'
import { Skeleton, SectionLoading } from './shared'

interface AnalystSectionProps {
  selectedDate: string | null
  onLoadingChange?: (isLoading: boolean) => void
  onHighlightsChange?: (highlights: HighlightType[]) => void
}

export function AnalystSection({ selectedDate, onLoadingChange, onHighlightsChange }: AnalystSectionProps) {
  // Track which date we last generated for to prevent duplicate calls
  const lastGeneratedDateRef = useRef<string | null>(null)
  
  const { 
    object: analystData, 
    submit: submitAnalyst, 
    isLoading,
    error
  } = useObject({
    api: '/Test/admin/api/summarize-v6',
    schema: AnalystSchema,
  })

  const analyst = analystData as Partial<AnalystData> | undefined

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(isLoading)
  }, [isLoading, onLoadingChange])

  // Notify parent of highlights for combining
  useEffect(() => {
    if (analyst?.highlights && Array.isArray(analyst.highlights)) {
      onHighlightsChange?.(analyst.highlights as HighlightType[])
    }
  }, [analyst?.highlights, onHighlightsChange])

  // Generate when date changes - only if it's a NEW date
  useEffect(() => {
    if (selectedDate && selectedDate !== lastGeneratedDateRef.current) {
      lastGeneratedDateRef.current = selectedDate
      submitAnalyst({ selectedDates: [selectedDate], promptId: 'deep-analyst' })
    }
  }, [selectedDate, submitAnalyst])

  const handleRegenerate = () => {
    if (selectedDate) {
      submitAnalyst({ selectedDates: [selectedDate], promptId: 'deep-analyst' })
    }
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
        Analyst Error: {error.message}
        <button onClick={handleRegenerate} className="ml-2 underline">Retry</button>
      </div>
    )
  }

  const highlights = analyst?.highlights || []

  return (
    <div className="mt-6 sm:mt-8">
      {isLoading && <SectionLoading label="Deep-Analyst" />}
      
      <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-foreground/40">
        <h3 className="font-headline text-base sm:text-lg font-bold uppercase tracking-wider flex items-center gap-2">
          <span className="text-rose-500">📰</span> Chat-Highlights
          {highlights.length > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground">({highlights.length})</span>
          )}
        </h3>
        <span className="text-[10px] text-muted-foreground font-headline uppercase tracking-wider">
          Story-Format
        </span>
      </div>
      
      {highlights.length > 0 ? (
        <div className="space-y-6">
          {highlights.map((highlight, idx) => (
            <div key={idx} className="border-2 border-foreground/20 bg-card">
              {/* Highlight Header */}
              <div className="p-4 border-b border-foreground/20 bg-muted/30">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {highlight.highlightLevel && (
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                      highlight.highlightLevel === 'high' ? 'bg-rose-500/20 text-rose-700 dark:text-rose-400' :
                      highlight.highlightLevel === 'medium' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                      'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                    }`}>
                      {highlight.highlightLevel === 'high' ? '🔥 HOT' : 
                       highlight.highlightLevel === 'medium' ? '⭐ FEATURED' : '📌 NOTABLE'}
                    </span>
                  )}
                  {highlight.tags?.map((tag, tIdx) => (
                    <span key={tIdx} className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded">
                      {tag}
                    </span>
                  ))}
                </div>
                {highlight.title ? (
                  <h4 className="font-headline text-lg sm:text-xl font-bold leading-tight">
                    {highlight.title}
                  </h4>
                ) : (
                  <Skeleton className="h-6 w-full" />
                )}
                {highlight.summary && (
                  <p className="text-sm text-muted-foreground font-body mt-2">
                    {highlight.summary}
                  </p>
                )}
                {highlight.participants && highlight.participants.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {highlight.participants.map((p, pIdx) => (
                      <span key={pIdx} className="px-1.5 py-0.5 bg-background text-[10px] font-body rounded border border-foreground/10">
                        @{p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Sections */}
              {highlight.sections && highlight.sections.length > 0 && (
                <div className="divide-y divide-foreground/10">
                  {highlight.sections.map((section, sIdx) => (
                    <div key={sIdx} className="p-4">
                      {section.title && (
                        <h5 className="font-headline text-sm font-semibold mb-2 flex items-center gap-2">
                          <span className="text-muted-foreground">{sIdx + 1}.</span>
                          {section.title}
                        </h5>
                      )}
                      {section.context && (
                        <p className="text-xs text-muted-foreground font-body mb-3 italic">
                          {section.context}
                        </p>
                      )}
                      {/* Quotes */}
                      {section.quotes && section.quotes.length > 0 && (
                        <div className="space-y-2 mb-3 pl-3 border-l-2 border-primary/30">
                          {section.quotes.map((quote, qIdx) => (
                            <div key={qIdx} className="text-sm">
                              <span className="font-semibold text-primary">@{quote.from}:</span>
                              <span className="text-foreground ml-1">„{quote.text}"</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {section.analysis && (
                        <p className="text-xs text-muted-foreground font-body bg-muted/50 p-2 rounded">
                          💡 {section.analysis}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="border-2 border-foreground/20 bg-card">
          <div className="p-4 border-b border-foreground/20 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
            </div>
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="p-4">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-3 w-full mb-3" />
            <div className="space-y-2 mb-3 pl-3 border-l-2 border-primary/30">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <Skeleton className="h-10 w-full rounded" />
          </div>
        </div>
      )}
    </div>
  )
}
