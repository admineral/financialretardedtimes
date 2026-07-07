/**
 * index.ts
 * 
 * Public exports for the newspaper components module.
 * 
 * LOCAL: Barrel file that re-exports all public components from the module.
 * Provides a clean import interface for consumers.
 * 
 * GLOBAL: Single entry point for importing newspaper components.
 * Usage: import { DateTimeline, ChatSection } from '@/app/newspaper/components'
 * 
 * The edition v3 components (provider, blocks, charts, sidebar) live in
 * ./edition and are exported from there.
 */

// Main Components
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
