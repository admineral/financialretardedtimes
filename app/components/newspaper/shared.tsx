'use client'

import { useState } from 'react'

// Skeleton component
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className}`} />
}

// Text or Skeleton - shows skeleton if no text
export function TextOrSkeleton({ 
  text, 
  skeletonClass = 'h-4 w-32',
  className = '',
  as: Component = 'span'
}: { 
  text: string | undefined | null
  skeletonClass?: string
  className?: string
  as?: 'span' | 'p' | 'h3' | 'h4' | 'div'
}) {
  if (!text) {
    return <Skeleton className={skeletonClass} />
  }
  return <Component className={className}>{text}</Component>
}

// Expandable text component
export function ExpandableText({ 
  teaser, 
  fullText,
  className = ''
}: { 
  teaser: string | undefined
  fullText: string | undefined
  className?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (!teaser) return <Skeleton className="h-4 w-3/4" />
  
  const hasMore = fullText && fullText.length > teaser.length
  
  return (
    <div className={className}>
      <p className="text-xs sm:text-sm text-muted-foreground font-body">
        {isExpanded && fullText ? fullText : teaser}
      </p>
      {hasMore && (
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[10px] text-primary hover:underline mt-1 font-headline uppercase tracking-wider"
        >
          {isExpanded ? '← Weniger' : 'Mehr lesen →'}
        </button>
      )}
    </div>
  )
}

// Category style helper
export function getCategoryStyle(category: string | undefined) {
  if (!category) return 'bg-muted text-muted-foreground'
  const styles: Record<string, string> = {
    'ANALYSE': 'bg-primary/10 text-primary border-primary/30',
    'MEINUNG': 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
    'KULTUR': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    'MARKTSTRUKTUR': 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
    'ALTCOINS': 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
    'BREAKING': 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
  }
  return styles[category] || 'bg-muted text-muted-foreground'
}

// Event style helper
export function getEventStyle(type: string | undefined) {
  if (!type) return 'bg-muted text-muted-foreground'
  const styles: Record<string, string> = {
    'conflict': 'bg-red-500/20 text-red-700 dark:text-red-400',
    'milestone': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
    'drama': 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
    'discovery': 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    'meme': 'bg-pink-500/20 text-pink-700 dark:text-pink-400',
  }
  return styles[type] || 'bg-muted text-muted-foreground'
}

// Loading indicator for sections
export function SectionLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-amber-600 mb-2">
      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      <span className="font-headline uppercase tracking-wider">{label} lädt...</span>
    </div>
  )
}

