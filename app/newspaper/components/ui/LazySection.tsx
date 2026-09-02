'use client'

/**
 * LazySection.tsx
 *
 * Mounts its children only once the section scrolls near the viewport.
 * Below-the-fold blocks that own their own data fetching (market widgets,
 * archive timeline) must not compete with the edition request on first
 * paint; wrapping them here defers both their JS and their API calls.
 *
 * `minHeight` reserves space so the page does not jump when the content
 * arrives. `rootMargin` controls how early the mount happens.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

export function LazySection({
  children,
  fallback = null,
  minHeight = 320,
  rootMargin = '600px 0px',
  className
}: {
  children: ReactNode
  fallback?: ReactNode
  minHeight?: number
  rootMargin?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [isNear, setIsNear] = useState(false)

  useEffect(() => {
    if (isNear) return
    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      setIsNear(true)
      return
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setIsNear(true)
        observer.disconnect()
      }
    }, { rootMargin })

    observer.observe(node)
    return () => observer.disconnect()
  }, [isNear, rootMargin])

  return (
    <div ref={ref} className={className} style={isNear ? undefined : { minHeight }}>
      {isNear ? children : fallback}
    </div>
  )
}
