'use client'

import { RealtimeChat } from '@/components/realtime-chat'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Users, Sparkles, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/hooks/use-realtime-chat'

const GUEST_NAME_KEY = 'guestbook_username'
const ROOM_NAME = 'financial-retarded-times-guestbook'

// Fun random name generator for anonymous guests
const generateGuestName = () => {
  const adjectives = ['Happy', 'Clever', 'Swift', 'Brave', 'Calm', 'Witty', 'Bold', 'Kind', 'Wise', 'Cool']
  const animals = ['Panda', 'Fox', 'Owl', 'Wolf', 'Bear', 'Tiger', 'Eagle', 'Dolphin', 'Lion', 'Hawk']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const animal = animals[Math.floor(Math.random() * animals.length)]
  const num = Math.floor(Math.random() * 99) + 1
  return `${adj}${animal}${num}`
}

export function GuestbookChat() {
  const [username, setUsername] = useState<string | null>(null)
  const [inputName, setInputName] = useState('')
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const savedMessageIds = useRef<Set<string>>(new Set())

  // Load initial messages from database
  useEffect(() => {
    async function loadMessages() {
      setIsLoading(true)
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('guestbook_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100)
      
      if (error) {
        // Table might not exist yet - that's okay, just start with empty messages
        console.warn('Could not load messages (table may not exist yet):', error.message || error.code || error)
        setIsLoading(false)
        return
      }
      
      if (data) {
        // Convert database format to ChatMessage format
        const messages: ChatMessage[] = data.map(msg => {
          savedMessageIds.current.add(msg.id)
          return {
            id: msg.id,
            content: msg.content,
            user: { name: msg.username },
            createdAt: msg.created_at
          }
        })
        setInitialMessages(messages)
      }
      setIsLoading(false)
    }
    
    loadMessages()
  }, [])

  // Load username from localStorage
  useEffect(() => {
    const storedName = localStorage.getItem(GUEST_NAME_KEY)
    if (storedName) {
      setUsername(storedName)
    }
  }, [])

  // Handle new messages - save to database
  const handleMessage = useCallback(async (messages: ChatMessage[]) => {
    const supabase = createClient()
    
    // Find messages that haven't been saved yet
    const newMessages = messages.filter(msg => !savedMessageIds.current.has(msg.id))
    
    for (const msg of newMessages) {
      const { error } = await supabase
        .from('guestbook_messages')
        .insert({
          id: msg.id,
          content: msg.content,
          username: msg.user.name,
          created_at: msg.createdAt
        })
      
      if (!error) {
        savedMessageIds.current.add(msg.id)
      } else if (error.code !== '23505') { // Ignore duplicate key errors
        console.error('Error saving message:', error)
      }
    }
  }, [])

  const handleJoin = (name?: string) => {
    const finalName = name || inputName.trim() || generateGuestName()
    localStorage.setItem(GUEST_NAME_KEY, finalName)
    setUsername(finalName)
  }

  const handleQuickJoin = () => {
    const randomName = generateGuestName()
    handleJoin(randomName)
  }

  if (!username) {
    return (
      <div className="p-4">
        {/* Join Form - Newspaper Style */}
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="text-center space-y-2">
            <Users className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground font-body">
              Wählen Sie einen Namen um mitzudiskutieren
            </p>
          </div>

          <div className="w-full space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Ihr Name..."
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                className="text-sm font-body bg-background border-foreground/20 focus:border-primary/50"
              />
              <Button 
                onClick={() => handleJoin()} 
                disabled={!inputName.trim()}
                size="sm"
                className="px-4 font-headline text-xs tracking-wide"
              >
                Beitreten
              </Button>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-foreground/20" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                <span className="bg-card px-2 text-muted-foreground">oder</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              onClick={handleQuickJoin}
              size="sm"
              className="w-full gap-2 font-body text-xs border-foreground/20"
            >
              <Sparkles className="w-3 h-3" />
              Zufälliger Name
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* User Info Bar */}
      <div className="px-3 py-2 border-b border-foreground/20 bg-muted/30 flex items-center justify-between">
        <span className="text-xs font-body text-muted-foreground">
          Angemeldet als <span className="font-semibold text-foreground">{username}</span>
        </span>
        <button 
          className="text-[10px] text-muted-foreground hover:text-foreground font-headline uppercase tracking-wider"
          onClick={() => {
            localStorage.removeItem(GUEST_NAME_KEY)
            setUsername(null)
            setInputName('')
          }}
        >
          Ändern
        </button>
      </div>

      {/* Chat */}
      <div className="h-[280px]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <RealtimeChat 
            roomName={ROOM_NAME}
            username={username}
            messages={initialMessages}
            onMessage={handleMessage}
          />
        )}
      </div>
    </div>
  )
}
