/**
 * index.ts
 * 
 * Public exports for the newspaper components module.
 * 
 * LOCAL: Barrel file that re-exports all public components from the module.
 * Provides a clean import interface for consumers.
 * 
 * GLOBAL: Single entry point for importing newspaper components.
 * Usage: import { NewspaperContent, DateTimeline } from '@/app/newspaper/components'
 * 
 * EXPORTS:
 * - NewspaperContent: Main content area with articles and events
 * - NewspaperSidebar: Left sidebar with contributors and topics
 * - ShortNewsSidebar: Right sidebar with brief news updates
 * - DateTimeline: Date picker for selecting archive dates
 * - ChatSection: Live chat widget (memoized)
 * - UI Components: Skeleton, StreamingText, StreamingContainer, TextOrSkeleton
 * - Helpers: getCategoryStyle, getEventStyle
 */

// Main Components
export { NewspaperContent } from './NewspaperContent'
export type { CacheInfo } from './NewspaperContent'
export { NewspaperSidebar } from './NewspaperSidebar'
export { ShortNewsSidebar } from './ShortNewsSidebar'
export { DateTimeline } from './DateTimeline'
export type { DayRange } from './DateTimeline'
export { ChatSection } from './ChatSection'
export { ContributorAvatar, prefetchAvatars } from './ContributorAvatar'
export { NewspaperTimeline } from './NewspaperTimeline'
export { AvatarProvider, useAvatarContext } from './AvatarContext'

// UI Components
export { Skeleton, StreamingText, StreamingContainer, TextOrSkeleton } from './ui/Skeleton'

// Style Helpers
export { getCategoryStyle, getEventStyle } from './ui/helpers'

