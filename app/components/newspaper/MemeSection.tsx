'use client'

import { useEffect, useRef } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { MemeSchema, type MemeData } from './types'
import { Skeleton, getCategoryStyle, ExpandableText, SectionLoading } from './shared'

interface MemeSectionProps {
  selectedDate: string | null
  onLoadingChange?: (isLoading: boolean) => void
  onDataChange?: (data: Partial<MemeData> | undefined) => void
}

// Short News component for the sidebar - receives data from parent
export function ShortNewsSection({ data, isLoading }: { data: Partial<MemeData> | undefined, isLoading: boolean }) {
  const meme = data

  return (
    <div className="hidden lg:block mb-6">
      {isLoading && <SectionLoading label="Meme-Kurator" />}
      
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-foreground/20">
        <h3 className="font-headline text-sm font-bold uppercase tracking-wider">Kurzmeldungen</h3>
      </div>
      
      {meme?.shortNews && meme.shortNews.length > 0 ? (
        meme.shortNews.map((news, idx) => (
          <article key={idx} className="mb-4 pb-4 border-b border-foreground/10">
            <div className="flex items-center gap-2 mb-1">
              {news.author ? (
                <span className="text-xs text-muted-foreground">{news.author}</span>
              ) : (
                <Skeleton className="h-3 w-20" />
              )}
              <span className="text-muted-foreground text-xs">•</span>
              {news.date ? (
                <span className="text-xs text-muted-foreground">{news.date}</span>
              ) : (
                <Skeleton className="h-3 w-16" />
              )}
              {news.category ? (
                <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-semibold rounded ${getCategoryStyle(news.category)}`}>
                  {news.category}
                </span>
              ) : (
                <Skeleton className="ml-auto h-4 w-14 rounded" />
              )}
            </div>
            {news.headline ? (
              <h4 className="font-headline text-sm font-semibold leading-snug hover:text-primary/80 cursor-pointer">
                {news.headline}
              </h4>
            ) : (
              <Skeleton className="h-4 w-full" />
            )}
            <ExpandableText 
              teaser={news.teaser} 
              fullText={news.fullText}
              className="mt-1"
            />
            {news.topics && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-muted-foreground">{news.topics}</span>
              </div>
            )}
          </article>
        ))
      ) : (
        <>
          {[1, 2, 3, 4].map((i) => (
            <article key={i} className="mb-4 pb-4 border-b border-foreground/10">
              <div className="flex items-center gap-2 mb-1">
                <Skeleton className="h-3 w-20" />
                <span className="text-muted-foreground text-xs">•</span>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="ml-auto h-4 w-14 rounded" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-full mt-1" />
              <Skeleton className="h-3 w-3/4 mt-1" />
            </article>
          ))}
        </>
      )}
    </div>
  )
}

// More Articles grid component - receives data from parent
export function MoreArticlesSection({ data, isLoading }: { data: Partial<MemeData> | undefined, isLoading: boolean }) {
  const meme = data

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
      {isLoading && (
        <div className="col-span-full">
          <SectionLoading label="Meme-Kurator" />
        </div>
      )}
      
      {meme?.moreArticles && meme.moreArticles.length > 0 ? (
        meme.moreArticles.map((article, idx) => (
          <article key={idx} className="pb-3 sm:pb-4 border-b border-foreground/10">
            {article.category ? (
              <span className="text-[10px] sm:text-xs text-muted-foreground font-headline uppercase tracking-wider">
                {article.category}
              </span>
            ) : (
              <Skeleton className="h-3 w-16" />
            )}
            {article.headline ? (
              <h4 className="font-headline text-sm sm:text-base font-semibold mt-1 hover:text-primary/80 cursor-pointer transition-colors">
                {article.headline}
              </h4>
            ) : (
              <Skeleton className="h-5 w-full mt-1" />
            )}
            <ExpandableText 
              teaser={article.teaser} 
              fullText={article.fullText}
              className="mt-1"
            />
          </article>
        ))
      ) : (
        <>
          {[1, 2, 3, 4].map((i) => (
            <article key={i} className="pb-3 sm:pb-4 border-b border-foreground/10">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-full mt-1" />
              <Skeleton className="h-4 w-3/4 mt-1" />
            </article>
          ))}
        </>
      )}
    </div>
  )
}

// Main MemeSection that manages its own data and passes it to children
export function MemeSection({ selectedDate, onLoadingChange, onDataChange }: MemeSectionProps) {
  // Track which date we last generated for to prevent duplicate calls
  const lastGeneratedDateRef = useRef<string | null>(null)
  
  const { 
    object: memeData, 
    submit: submitMeme, 
    isLoading,
    error
  } = useObject({
    api: '/Test/admin/api/summarize-v6',
    schema: MemeSchema,
  })

  const meme = memeData as Partial<MemeData> | undefined

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(isLoading)
  }, [isLoading, onLoadingChange])

  // Notify parent of data changes (for sidebar short news)
  useEffect(() => {
    onDataChange?.(meme)
  }, [meme, onDataChange])

  // Generate when date changes - only if it's a NEW date
  useEffect(() => {
    if (selectedDate && selectedDate !== lastGeneratedDateRef.current) {
      lastGeneratedDateRef.current = selectedDate
      submitMeme({ selectedDates: [selectedDate], promptId: 'meme-curator' })
    }
  }, [selectedDate, submitMeme])

  const handleRegenerate = () => {
    if (selectedDate) {
      submitMeme({ selectedDates: [selectedDate], promptId: 'meme-curator' })
    }
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
        Meme Error: {error.message}
        <button onClick={handleRegenerate} className="ml-2 underline">Retry</button>
      </div>
    )
  }

  // This component now only renders the MoreArticles grid
  // ShortNews is rendered separately in the sidebar using the same data via onDataChange
  return <MoreArticlesSection data={meme} isLoading={isLoading} />
}
