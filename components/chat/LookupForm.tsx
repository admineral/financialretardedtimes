'use client'

import type { FormEvent, ReactNode } from 'react'
import { Loader2Icon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROOM_OPTIONS } from '@/lib/tv-chat/types'

/**
 * Username + room form shared by export and people. Always starts empty:
 * the visitor decides whose public chat history is looked at.
 */
export function LookupForm({
  username,
  room,
  onUsernameChange,
  onRoomChange,
  onSubmit,
  loading,
  submitLabel,
  children
}: {
  username: string
  room: string
  onUsernameChange: (value: string) => void
  onRoomChange: (value: string) => void
  onSubmit: () => void
  loading: boolean
  submitLabel: string
  children?: ReactNode
}) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card glass-grain rounded-sm border border-primary/15 p-4 sm:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative sm:flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={username}
            onChange={event => onUsernameChange(event.target.value)}
            placeholder="TradingView-Benutzername"
            className="h-10 pl-9 font-body"
            autoComplete="off"
            spellCheck={false}
            aria-label="TradingView-Benutzername"
          />
        </div>
        <select
          value={room}
          onChange={event => onRoomChange(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-body"
          aria-label="Chatraum"
        >
          {ROOM_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="submit" className="h-10 font-headline uppercase tracking-wide" disabled={!username.trim() || loading}>
          {loading && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
      {children}
    </form>
  )
}
