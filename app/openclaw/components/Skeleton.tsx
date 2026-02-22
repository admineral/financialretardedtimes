/**
 * Skeleton loading component
 */

interface SkeletonProps {
  className?: string
  inline?: boolean
}

export function Skeleton({ className = '', inline = false }: SkeletonProps) {
  const Component = inline ? 'span' : 'div'
  return (
    <Component 
      className={`${inline ? 'inline-block' : 'block'} animate-pulse bg-primary/10 rounded ${className}`} 
    />
  )
}
