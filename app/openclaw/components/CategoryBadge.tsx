/**
 * Category Badge Component
 * 
 * Displays a colored badge for commit categories.
 */

import { Sparkles, Code2, RefreshCw, TrendingUp, Zap, FileText, TestTube, Settings } from 'lucide-react'

const CATEGORY_STYLES: Record<string, string> = {
  Feature: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Bugfix: 'bg-red-500/20 text-red-400 border-red-500/30',
  Refactor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Documentation: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Performance: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Security: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  Testing: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  Infrastructure: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Feature: <Sparkles className="w-3 h-3" />,
  Bugfix: <Code2 className="w-3 h-3" />,
  Refactor: <RefreshCw className="w-3 h-3" />,
  Documentation: <FileText className="w-3 h-3" />,
  Performance: <TrendingUp className="w-3 h-3" />,
  Security: <Zap className="w-3 h-3" />,
  Testing: <TestTube className="w-3 h-3" />,
  Infrastructure: <Settings className="w-3 h-3" />,
}

interface CategoryBadgeProps {
  category: string
  showIcon?: boolean
  size?: 'sm' | 'md'
}

export function CategoryBadge({ category, showIcon = true, size = 'sm' }: CategoryBadgeProps) {
  const style = CATEGORY_STYLES[category] || 'bg-muted/40 text-muted-foreground border-muted'
  const icon = CATEGORY_ICONS[category] || <Code2 className="w-3 h-3" />
  
  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-[10px]' 
    : 'px-3 py-1 text-xs'
  
  return (
    <span className={`inline-flex items-center gap-1 font-semibold rounded-sm border ${style} ${sizeClasses}`}>
      {showIcon && icon}
      {category}
    </span>
  )
}

export function getCategoryStyle(category: string): string {
  return CATEGORY_STYLES[category] || 'bg-muted/40 text-muted-foreground border-muted'
}
