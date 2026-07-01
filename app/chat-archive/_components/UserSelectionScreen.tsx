'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HistoryIcon, SearchIcon, UserIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEFAULT_ROOM, ROOMS, roomLabel } from '../_lib/rooms'
import { getRecentUsers, removeRecentUser, saveRecentUser } from '../_lib/recent-users'
import { formatTimeAgo } from '../_lib/format'
import type { RecentUser } from '../_lib/types'

export function UserSelectionScreen() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [room, setRoom] = useState(DEFAULT_ROOM)
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    setRecentUsers(getRecentUsers())
  }, [])

  const go = (name: string, roomValue: string) => {
    saveRecentUser(name, roomValue)
    router.push(
      `/chat-archive?username=${encodeURIComponent(name)}&room=${encodeURIComponent(roomValue)}`
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = username.trim()
    if (!name) return
    setIsSearching(true)
    go(name, room)
  }

  const handleRemove = (e: React.MouseEvent, user: RecentUser) => {
    e.stopPropagation()
    removeRecentUser(user.username, user.room)
    setRecentUsers(getRecentUsers())
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold">Chat Archive</h1>
          <p className="text-muted-foreground">
            Search for a TradingView user to explore their chat activity and ideas.
          </p>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">TradingView username</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    placeholder="Enter username…"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="room">Chat room</Label>
                <Select value={room} onValueChange={setRoom}>
                  <SelectTrigger id="room" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOMS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={!username.trim() || isSearching}>
                <SearchIcon className="h-4 w-4" />
                {isSearching ? 'Loading…' : 'View activity'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {recentUsers.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HistoryIcon className="h-4 w-4" />
              <span>Recent searches</span>
            </div>

            <div className="grid gap-2">
              {recentUsers.map((user, index) => (
                <Card
                  key={`${user.username}-${user.room}-${index}`}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => go(user.username, user.room)}
                >
                  <CardContent className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <UserIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{user.username}</div>
                        <div className="text-xs text-muted-foreground">{roomLabel(user.room)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(user.lastVisited)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => handleRemove(e, user)}
                        aria-label={`Remove ${user.username}`}
                      >
                        <XIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
