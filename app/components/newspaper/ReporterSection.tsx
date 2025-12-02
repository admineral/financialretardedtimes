'use client'

import { useEffect, useRef } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import Link from 'next/link'
import { ReporterSchema, type ReporterData } from './types'
import { Skeleton, getCategoryStyle, SectionLoading } from './shared'

interface ReporterSectionProps {
  selectedDate: string | null
  onLoadingChange?: (isLoading: boolean) => void
  onDataChange?: (data: Partial<ReporterData> | undefined) => void
}

export function ReporterSection({ selectedDate, onLoadingChange, onDataChange }: ReporterSectionProps) {
  // Track which date we last generated for to prevent duplicate calls
  const lastGeneratedDateRef = useRef<string | null>(null)
  
  const { 
    object: reporterData, 
    submit: submitReporter, 
    isLoading,
    error
  } = useObject({
    api: '/Test/admin/api/summarize-v6',
    schema: ReporterSchema,
  })

  const reporter = reporterData as Partial<ReporterData> | undefined

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(isLoading)
  }, [isLoading, onLoadingChange])

  // Notify parent of data changes (for sidebar)
  useEffect(() => {
    onDataChange?.(reporter)
  }, [reporter, onDataChange])

  // Generate when date changes - only if it's a NEW date
  useEffect(() => {
    if (selectedDate && selectedDate !== lastGeneratedDateRef.current) {
      lastGeneratedDateRef.current = selectedDate
      submitReporter({ selectedDates: [selectedDate], promptId: 'chat-reporter' })
    }
  }, [selectedDate, submitReporter])

  // Regenerate function
  const handleRegenerate = () => {
    if (selectedDate) {
      submitReporter({ selectedDates: [selectedDate], promptId: 'chat-reporter' })
    }
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
        Reporter Error: {error.message}
        <button onClick={handleRegenerate} className="ml-2 underline">Retry</button>
      </div>
    )
  }

  return (
    <>
      {isLoading && <SectionLoading label="Reporter" />}
      
      {/* Featured Article */}
      <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
        <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
          {reporter?.featuredArticle?.author ? (
            <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
              {reporter.featuredArticle.author}
            </span>
          ) : (
            <Skeleton className="h-3 w-20" />
          )}
          <span className="text-muted-foreground">•</span>
          {reporter?.featuredArticle?.date ? (
            <span className="text-[10px] sm:text-xs text-muted-foreground">{reporter.featuredArticle.date}</span>
          ) : (
            <Skeleton className="h-3 w-16" />
          )}
          {reporter?.featuredArticle?.category ? (
            <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(reporter.featuredArticle.category)}`}>
              {reporter.featuredArticle.category}
            </span>
          ) : (
            <Skeleton className="ml-auto h-5 w-16 rounded" />
          )}
        </div>
        {reporter?.featuredArticle?.headline ? (
          <h3 className="font-headline text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-3 sm:mb-4 hover:text-primary/80 cursor-pointer transition-colors">
            {reporter.featuredArticle.headline}
          </h3>
        ) : (
          <div className="mb-3 sm:mb-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        )}
        {reporter?.featuredArticle?.summary ? (
          <p className="font-body text-sm sm:text-base md:text-lg leading-relaxed text-muted-foreground mb-3 sm:mb-4">
            {reporter.featuredArticle.summary}
          </p>
        ) : (
          <div className="mb-3 sm:mb-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {/* QUOTE DISPLAY - Nur EINE Option wird angezeigt (Priorität: keyQuote > quotes > conversation) */}
        
        {/* Option 1: Single Key Quote (BEVORZUGT - schlicht) */}
        {reporter?.featuredArticle?.keyQuote && (
          <blockquote className="border-l-4 border-foreground/30 pl-3 sm:pl-4 py-2 my-3 sm:my-4 italic font-body text-muted-foreground text-sm sm:text-base">
            „{reporter.featuredArticle.keyQuote}"
          </blockquote>
        )}

        {/* Option 2: Quote Cards (max 2, nur wenn kein keyQuote) */}
        {!reporter?.featuredArticle?.keyQuote && 
         reporter?.featuredArticle?.quotes && 
         reporter.featuredArticle.quotes.length > 0 && (
          <div className="my-3 sm:my-4 space-y-2">
            {reporter.featuredArticle.quotes.slice(0, 2).map((quote, idx) => (
              <div 
                key={idx} 
                className="relative pl-4 py-2 border-l-2 border-foreground/20"
              >
                <p className="text-sm text-muted-foreground italic">
                  „{quote.text}" <span className="font-semibold not-italic">— @{quote.from}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Option 3: Mini-Conversation (max 3, nur wenn keine anderen Optionen) */}
        {!reporter?.featuredArticle?.keyQuote && 
         !reporter?.featuredArticle?.quotes?.length &&
         reporter?.featuredArticle?.conversation && 
         reporter.featuredArticle.conversation.messages?.length > 0 && (
          <div className="my-3 sm:my-4 bg-muted/20 rounded border border-foreground/10 p-3">
            {reporter.featuredArticle.conversation.title && (
              <p className="text-[10px] font-headline uppercase tracking-wider text-muted-foreground mb-2">
                💬 {reporter.featuredArticle.conversation.title}
              </p>
            )}
            <div className="space-y-1.5">
              {reporter.featuredArticle.conversation.messages.slice(0, 3).map((msg, idx) => (
                <p key={idx} className="text-sm">
                  <span className="font-semibold text-primary">@{msg.from}:</span>
                  <span className="text-muted-foreground ml-1">„{msg.text}"</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Contributors */}
        {reporter?.featuredArticle?.contributors && reporter.featuredArticle.contributors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            {reporter.featuredArticle.contributors.map((contributor, idx) => (
              <span key={idx} className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">
                @{contributor}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
          <Link href="/" className="text-primary font-headline hover:underline">Weiterlesen →</Link>
        </div>
      </article>

      {/* Secondary Article */}
      <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
        <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
          {reporter?.secondaryArticle?.author ? (
            <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
              {reporter.secondaryArticle.author}
            </span>
          ) : (
            <Skeleton className="h-3 w-24" />
          )}
          <span className="text-muted-foreground">•</span>
          {reporter?.secondaryArticle?.date ? (
            <span className="text-[10px] sm:text-xs text-muted-foreground">{reporter.secondaryArticle.date}</span>
          ) : (
            <Skeleton className="h-3 w-16" />
          )}
          {reporter?.secondaryArticle?.category ? (
            <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(reporter.secondaryArticle.category)}`}>
              {reporter.secondaryArticle.category}
            </span>
          ) : (
            <Skeleton className="ml-auto h-5 w-16 rounded" />
          )}
        </div>
        {reporter?.secondaryArticle?.headline ? (
          <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
            {reporter.secondaryArticle.headline}
          </h3>
        ) : (
          <div className="mb-2 sm:mb-3 space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        )}
        {reporter?.secondaryArticle?.summary ? (
          <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground mb-3 sm:mb-4">
            {reporter.secondaryArticle.summary}
          </p>
        ) : (
          <div className="mb-3 sm:mb-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
        {reporter?.secondaryArticle?.contributors && reporter.secondaryArticle.contributors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            {reporter.secondaryArticle.contributors.map((contributor, idx) => (
              <span key={idx} className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">
                @{contributor}
              </span>
            ))}
          </div>
        )}
      </article>
    </>
  )
}
