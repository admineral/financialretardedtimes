'use client'

/**
 * ToolHeader.tsx
 *
 * Compact masthead for newspaper side tools (export, people). Same type
 * family and gold rule as the paper, one line high, with a way back.
 */

import Link from 'next/link'
import { ArrowLeft, Newspaper } from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'

export function ToolHeader({
  section,
  subtitle,
  actions
}: {
  section: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-primary/20 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/newspaper"
          className="inline-flex items-center gap-1.5 text-xs font-headline uppercase tracking-wide text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Zur Ausgabe</span>
        </Link>
        <div className="h-5 w-px bg-primary/20" />
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <Link href="/newspaper" className="inline-flex items-center gap-2 shrink-0">
            <Newspaper className="h-4 w-4 text-primary/70" />
            <span className="font-masthead gold-text text-lg leading-none tracking-wide hidden md:inline">
              Financial Retarded Times
            </span>
          </Link>
          <span className="text-primary/40 hidden md:inline">·</span>
          <h1 className="font-headline text-sm uppercase tracking-[0.18em] text-foreground truncate">{section}</h1>
          {subtitle && (
            <span className="hidden lg:inline text-xs text-muted-foreground font-body truncate">{subtitle}</span>
          )}
        </div>
        {actions}
        <ThemeSwitcher />
      </div>
      <div className="newspaper-rule-gold" />
    </header>
  )
}
