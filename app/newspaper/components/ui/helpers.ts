/**
 * helpers.ts
 * 
 * Style helper functions for the newspaper module.
 * 
 * LOCAL: Provides consistent styling for categories and event types.
 * Maps category/event names to Tailwind CSS class strings.
 * 
 * GLOBAL: Used by article and event components to apply consistent
 * color coding based on content type. Ensures visual consistency
 * across the newspaper layout.
 * 
 * EXPORTS:
 * - getCategoryStyle: Returns CSS classes for article categories
 * - getEventStyle: Returns CSS classes for event types
 */

/**
 * Get CSS classes for article category badges.
 * 
 * Maps category names to appropriate background, text, and border colors.
 * Supports both new categories (DISKUSSION, etc.) and legacy ones.
 * 
 * @param category - The article category (e.g., 'ANALYSE', 'DISKUSSION')
 * @returns Tailwind CSS class string for styling the category badge
 * 
 * @example
 * getCategoryStyle('ANALYSE') // Returns 'bg-primary/10 text-primary border-primary/30'
 */
export function getCategoryStyle(category: string | undefined): string {
  if (!category) return 'bg-muted text-muted-foreground'
  
  const styles: Record<string, string> = {
    // Primary categories
    'DISKUSSION': 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
    'ANALYSE': 'bg-primary/10 text-primary border-primary/30',
    'MEINUNG': 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
    'HIGHLIGHT': 'bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-500/30',
    'COMMUNITY': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    // Legacy categories (for backward compatibility)
    'KULTUR': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    'MARKTSTRUKTUR': 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
    'ALTCOINS': 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
    'BREAKING': 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
  }
  
  return styles[category] || 'bg-muted text-muted-foreground border-muted'
}

/**
 * Get CSS classes for event type badges.
 * 
 * Maps event types to appropriate background and text colors.
 * Supports new event types (discussion, debate, etc.) and legacy ones.
 * 
 * @param type - The event type (e.g., 'discussion', 'debate', 'humor')
 * @returns Tailwind CSS class string for styling the event badge
 * 
 * @example
 * getEventStyle('debate') // Returns 'bg-orange-500/20 text-orange-700 dark:text-orange-400'
 */
export function getEventStyle(type: string | undefined): string {
  if (!type) return 'bg-muted text-muted-foreground'
  
  const styles: Record<string, string> = {
    // Primary event types
    'discussion': 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    'debate': 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
    'insight': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
    'humor': 'bg-pink-500/20 text-pink-700 dark:text-pink-400',
    'milestone': 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
    // Legacy event types (for backward compatibility)
    'conflict': 'bg-red-500/20 text-red-700 dark:text-red-400',
    'drama': 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
    'discovery': 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    'meme': 'bg-pink-500/20 text-pink-700 dark:text-pink-400',
  }
  
  return styles[type] || 'bg-muted text-muted-foreground'
}

