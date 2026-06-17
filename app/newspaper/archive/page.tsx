/**
 * Archive Page
 * 
 * Shows all chat messages from the database, grouped by date.
 * Useful for debugging and viewing the complete message history.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  CalendarIcon, 
  MessageSquareIcon, 
  UsersIcon, 
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowLeftIcon,
  RefreshCwIcon
} from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'

interface Message {
  id: string
  username: string
  text: string
  time: string
  user_pic?: string
  is_moderator?: boolean
}

interface DayGroup {
  date: string
  displayDate: string
  messageCount: number
  uniqueUsers: number
  messages: Message[]
  isExpanded: boolean
}

export default function ArchivePage() {
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalMessages, setTotalMessages] = useState(0)
  const [totalDays, setTotalDays] = useState(0)

  const fetchArchive = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/newspaper/archive/api')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      setDayGroups(data.dayGroups || [])
      setTotalMessages(data.totalMessages || 0)
      setTotalDays(data.totalDays || 0)
    } catch (err) {
      console.error('Failed to fetch archive:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchArchive()
  }, [])

  const toggleDay = (date: string) => {
    setDayGroups(prev => prev.map(group => 
      group.date === date 
        ? { ...group, isExpanded: !group.isExpanded }
        : group
    ))
  }

  const expandAll = () => {
    setDayGroups(prev => prev.map(group => ({ ...group, isExpanded: true })))
  }

  const collapseAll = () => {
    setDayGroups(prev => prev.map(group => ({ ...group, isExpanded: false })))
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-foreground/10">
        <div className="w-full px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/newspaper" 
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                <span className="text-sm">Zurück</span>
              </Link>
              <div className="h-4 w-px bg-foreground/20" />
              <h1 className="font-masthead text-xl md:text-2xl">Chat-Archiv</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchArchive}
                disabled={isLoading}
                className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCwIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="w-full px-4 md:px-8 py-3 bg-muted/30 border-b border-foreground/10">
        <div className="flex flex-wrap items-center gap-4 md:gap-8 text-sm">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span className="font-medium">{totalDays}</span>
            <span className="text-muted-foreground">Tage</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquareIcon className="h-4 w-4 text-primary" />
            <span className="font-medium">{totalMessages.toLocaleString('de-DE')}</span>
            <span className="text-muted-foreground">Nachrichten</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
            >
              Alle öffnen
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
            >
              Alle schließen
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full px-4 md:px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-muted-foreground">
              <RefreshCwIcon className="h-5 w-5 animate-spin" />
              <span>Lade Archiv...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="text-red-500 text-center">
              <p className="font-medium">Fehler beim Laden</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
            <button
              onClick={fetchArchive}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Erneut versuchen
            </button>
          </div>
        ) : dayGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageSquareIcon className="h-12 w-12 mb-4 opacity-50" />
            <p>Keine Nachrichten in der Datenbank gefunden.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dayGroups.map((group) => (
              <div 
                key={group.date}
                className="border border-foreground/10 rounded-lg overflow-hidden bg-card"
              >
                {/* Day Header */}
                <button
                  onClick={() => toggleDay(group.date)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      <span className="font-headline font-semibold">{group.displayDate}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageSquareIcon className="h-3.5 w-3.5" />
                        {group.messageCount.toLocaleString('de-DE')}
                      </span>
                      <span className="flex items-center gap-1">
                        <UsersIcon className="h-3.5 w-3.5" />
                        {group.uniqueUsers}
                      </span>
                    </div>
                  </div>
                  {group.isExpanded ? (
                    <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {/* Messages */}
                {group.isExpanded && (
                  <div className="border-t border-foreground/10 max-h-[500px] overflow-y-auto">
                    {group.messages.map((msg, idx) => (
                      <div 
                        key={msg.id || idx}
                        className="px-4 py-2 border-b border-foreground/5 last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                            {msg.user_pic ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element -- TradingView avatar URLs are already proxied/validated elsewhere in this legacy archive view. */}
                                <img 
                                  src={msg.user_pic} 
                                  alt={msg.username}
                                  className="w-full h-full object-cover"
                                />
                              </>
                            ) : (
                              <span className="text-xs font-medium text-muted-foreground">
                                {msg.username.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`font-medium text-sm ${msg.is_moderator ? 'text-amber-500' : ''}`}>
                                {msg.username}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(msg.time).toLocaleTimeString('de-DE', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/90 break-words">
                              {msg.text}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

