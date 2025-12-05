/**
 * helpers.ts
 * 
 * REDESIGNED: Style helpers for premium dark theme
 * 
 * Provides consistent styling for categories and event types
 * with gold accents and dark mode optimized colors.
 */

/**
 * Get CSS classes for article category badges.
 * Optimized for dark premium theme with vibrant accents.
 */
export function getCategoryStyle(category: string | undefined): string {
  if (!category) return 'bg-muted/50 text-muted-foreground border-muted/30'
  
  const styles: Record<string, string> = {
    // Primary categories - dark theme optimized
    'DISKUSSION': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    'ANALYSE': 'bg-primary/15 text-primary border-primary/40',
    'MEINUNG': 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    'HIGHLIGHT': 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    'COMMUNITY': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    // Extended categories
    'KULTUR': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    'MARKTSTRUKTUR': 'bg-purple-500/20 text-purple-400 border-purple-500/40',
    'ALTCOINS': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    'BREAKING': 'bg-red-500/25 text-red-400 border-red-500/50',
    'BITCOIN': 'bg-amber-500/25 text-amber-300 border-amber-500/50',
    'TRADING': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    'NEWS': 'bg-gray-500/20 text-gray-300 border-gray-500/40',
  }
  
  return styles[category] || 'bg-muted/50 text-muted-foreground border-muted/30'
}

/**
 * Get CSS classes for event type badges.
 * Vibrant colors for dark backgrounds.
 */
export function getEventStyle(type: string | undefined): string {
  if (!type) return 'bg-muted/50 text-muted-foreground'
  
  const styles: Record<string, string> = {
    // Primary event types
    'discussion': 'bg-blue-500/25 text-blue-400',
    'debate': 'bg-orange-500/25 text-orange-400',
    'insight': 'bg-emerald-500/25 text-emerald-400',
    'humor': 'bg-pink-500/25 text-pink-400',
    'milestone': 'bg-purple-500/25 text-purple-400',
    // Extended event types
    'conflict': 'bg-red-500/25 text-red-400',
    'drama': 'bg-orange-500/25 text-orange-400',
    'discovery': 'bg-blue-500/25 text-blue-400',
    'meme': 'bg-pink-500/25 text-pink-400',
    'celebration': 'bg-amber-500/25 text-amber-400',
    'question': 'bg-cyan-500/25 text-cyan-400',
  }
  
  return styles[type] || 'bg-muted/50 text-muted-foreground'
}
