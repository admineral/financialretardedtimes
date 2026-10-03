'use client'

import { cn } from '@/lib/utils'

interface TerminalCardProps {
  title: string
  subtitle?: string
  badge?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  noPadding?: boolean
}

export function TerminalCard({
  title,
  subtitle,
  badge,
  action,
  children,
  className,
  contentClassName,
  noPadding
}: TerminalCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-primary/20 bg-card/80 backdrop-blur-sm overflow-hidden flex flex-col',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-primary/10 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-primary">
              {title}
            </h3>
            {badge && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary/80">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className={cn(!noPadding && 'p-4', contentClassName)}>{children}</div>
    </div>
  )
}

interface MetricTileProps {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | 'neutral'
}

export function MetricTile({ label, value, sub }: MetricTileProps) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background/50 px-3 py-2">
      <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground font-mono truncate">{label}</p>
      <p className="text-base sm:text-lg font-bold font-mono tabular-nums mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground/70 font-mono truncate">{sub}</p>}
    </div>
  )
}
