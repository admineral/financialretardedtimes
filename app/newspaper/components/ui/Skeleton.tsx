/**
 * Skeleton.tsx
 * 
 * Loading state UI components for the newspaper module.
 * 
 * LOCAL: Provides visual placeholders while content is loading.
 * Uses fixed min-heights to prevent layout shifts during streaming.
 * 
 * GLOBAL: Used throughout the newspaper components to show loading states
 * during AI content generation. Provides consistent loading UX.
 * 
 * EXPORTS:
 * - Skeleton: Animated placeholder for text/content
 * - StreamingText: Text that streams in smoothly without layout shifts
 * - StreamingContainer: Container with fixed min-height for streaming content
 */

'use client'

/**
 * Skeleton Component
 * 
 * Animated placeholder that mimics content shape during loading.
 * Uses Tailwind's animate-pulse for subtle animation.
 * 
 * @param className - Additional CSS classes for sizing (e.g., "h-4 w-32")
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className}`} />
}

/**
 * StreamingText Component
 * 
 * Displays text that streams in character by character.
 * Shows a subtle placeholder when empty, then smoothly reveals text.
 * Prevents layout shifts by using consistent line-heights and min-heights.
 * 
 * @param text - The text to display (can be partial during streaming)
 * @param placeholder - Show animated placeholder when no text
 * @param className - CSS classes for the text element
 * @param as - HTML element type to render
 * @param minLines - Minimum number of lines to reserve space for
 */
export function StreamingText({ 
  text, 
  placeholder = true,
  className = '',
  as: Component = 'span',
  minLines = 1
}: { 
  text: string | undefined | null
  placeholder?: boolean
  className?: string
  as?: 'span' | 'p' | 'h3' | 'h4' | 'div'
  minLines?: number
}) {
  const hasText = text && text.length > 0
  
  // Calculate min-height based on line-height (approximately 1.5em per line)
  const minHeightStyle = minLines > 1 ? { minHeight: `${minLines * 1.5}em` } : undefined
  
  if (!hasText && placeholder) {
    return (
      <Component 
        className={`${className} block`} 
        style={minHeightStyle}
      >
        <span className="inline-block animate-pulse bg-muted rounded h-[1em] w-3/4" />
      </Component>
    )
  }
  
  return (
    <Component 
      className={`${className} transition-all duration-150`}
      style={minHeightStyle}
    >
      {text || ''}
    </Component>
  )
}

/**
 * StreamingContainer Component
 * 
 * A container that reserves space for streaming content.
 * Prevents layout shifts by maintaining a minimum height.
 * Smoothly expands if content exceeds the reserved space.
 * 
 * @param children - The content to render
 * @param minHeight - Minimum height in pixels or CSS value
 * @param className - Additional CSS classes
 * @param isLoading - Whether content is still loading
 */
export function StreamingContainer({ 
  children,
  minHeight = 'auto',
  className = '',
  isLoading = false
}: { 
  children: React.ReactNode
  minHeight?: string | number
  className?: string
  isLoading?: boolean
}) {
  const heightValue = typeof minHeight === 'number' ? `${minHeight}px` : minHeight
  
  return (
    <div 
      className={`transition-all duration-300 ease-out ${className}`}
      style={{ minHeight: heightValue }}
    >
      {children}
      {isLoading && (
        <span className="inline-block w-1 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  )
}

/**
 * TextOrSkeleton Component (Legacy - kept for compatibility)
 * 
 * Conditionally renders text or a skeleton placeholder.
 * Useful for streaming content that arrives piece by piece.
 * 
 * @param text - The text to display (shows skeleton if undefined/null)
 * @param skeletonClass - CSS classes for the skeleton size
 * @param className - CSS classes for the text element
 * @param as - HTML element type to render ('span', 'p', 'h3', 'h4', 'div')
 */
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
