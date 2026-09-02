'use client'

import type { FormEvent, ReactNode } from 'react'
import { ArrowRightIcon, AtSignIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ROOM_OPTIONS } from '@/lib/tv-chat/types'

/**
 * Username + room form shared by export and people. Always starts empty:
 * the visitor decides whose public chat history is looked at.
 *
 * `variant="hero"` is the large centred version for empty pages,
 * `variant="bar"` the compact one that stays above results.
 */
export function LookupForm({
  username,
  room,
  onUsernameChange,
  onRoomChange,
  onSubmit,
  loading,
  submitLabel,
  variant = 'bar',
  children
}: {
  username: string
  room: string
  onUsernameChange: (value: string) => void
  onRoomChange: (value: string) => void
  onSubmit: () => void
  loading: boolean
  submitLabel: string
  variant?: 'hero' | 'bar'
  children?: ReactNode
}) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  const hero = variant === 'hero'
  const controlHeight = hero ? 'h-12' : 'h-10'

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'glass-grain relative rounded-sm border',
        hero ? 'glass-card-gold border-primary/25 p-3 sm:p-4' : 'glass-card border-primary/15 p-3'
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <label className="relative flex-1">
          <AtSignIcon
            className={cn(
              'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/60',
              hero ? 'h-4.5 w-4.5' : 'h-4 w-4'
            )}
          />
          <input
            value={username}
            onChange={event => onUsernameChange(event.target.value)}
            placeholder="TradingView-Benutzername"
            autoComplete="off"
            spellCheck={false}
            aria-label="TradingView-Benutzername"
            className={cn(
              controlHeight,
              'w-full rounded-sm border border-primary/20 bg-background/60 pl-10 pr-3 font-body text-foreground',
              'placeholder:text-muted-foreground/60 outline-none transition-[border-color,box-shadow]',
              'focus:border-primary/60 focus:ring-[3px] focus:ring-primary/15',
              hero ? 'text-base' : 'text-sm'
            )}
          />
        </label>

        <Select value={room} onValueChange={onRoomChange}>
          <SelectTrigger
            aria-label="Chatraum"
            className={cn(
              controlHeight,
              'w-full rounded-sm border-primary/20 bg-background/60 font-body shadow-none sm:w-[180px]',
              'focus-visible:border-primary/60 focus-visible:ring-primary/15',
              hero ? 'data-[size=default]:h-12 text-base' : 'data-[size=default]:h-10 text-sm'
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-sm border-primary/20">
            {ROOM_OPTIONS.map(option => (
              <SelectItem key={option.id} value={option.id} className="font-body">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="submit"
          disabled={!username.trim() || loading}
          className={cn(
            controlHeight,
            'rounded-sm font-headline uppercase tracking-wide shadow-[0_0_24px_hsl(var(--primary)/0.18)]',
            hero ? 'px-6 text-sm' : 'px-4 text-xs'
          )}
        >
          {loading ? <Loader2Icon className="animate-spin" /> : null}
          {submitLabel}
          {!loading && <ArrowRightIcon className="opacity-70" />}
        </Button>
      </div>
      {children && <div className={cn('flex flex-wrap items-center gap-2', hero ? 'mt-3' : 'mt-2.5')}>{children}</div>}
    </form>
  )
}
