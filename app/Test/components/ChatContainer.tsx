'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  RefreshCwIcon, 
  WifiOffIcon, 
  WifiIcon, 
  XIcon,
  MessageCircleIcon 
} from 'lucide-react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { PollingControls } from './PollingControls'
import { useChat } from '../hooks/use-chat-improved'

interface ChatContainerProps {
  roomId?: string
  className?: string
}

export function ChatContainer({ 
  roomId = 'bitcoin_de_DE', 
  className = '' 
}: ChatContainerProps) {
  // Polling configuration state with localStorage persistence
  // Use consistent defaults for SSR/client to avoid hydration mismatch
  const [pollingEnabled, setPollingEnabled] = useState(true)
  const [pollingInterval, setPollingInterval] = useState(10000) // 10 seconds default
  
  // Hydrate state from localStorage after mount
  useEffect(() => {
    const savedEnabled = localStorage.getItem('tradingview-chat-polling-enabled')
    if (savedEnabled !== null) {
      setPollingEnabled(JSON.parse(savedEnabled))
    }
    
    const savedInterval = localStorage.getItem('tradingview-chat-polling-interval')
    if (savedInterval !== null) {
      setPollingInterval(parseInt(savedInterval, 10))
    }
  }, [])

  const {
    messages,
    isConnected,
    isLoading,
    error,
    sendMessage,
    reconnect,
    clearError,
    refresh,
    loadMoreMessages,
    isLoadingMore,
    hasMoreMessages
  } = useChat({ 
    roomId, 
    pollingEnabled, 
    pollingInterval 
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [highlightedUser, setHighlightedUser] = useState<string | null>(null)

  // Persist polling settings to localStorage
  useEffect(() => {
      localStorage.setItem('tradingview-chat-polling-enabled', JSON.stringify(pollingEnabled))
  }, [pollingEnabled])

  useEffect(() => {
      localStorage.setItem('tradingview-chat-polling-interval', pollingInterval.toString())
  }, [pollingInterval])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const renderConnectionStatus = () => (
    <div className="flex items-center justify-between p-3 border-b bg-muted/30">
      <div className="flex items-center gap-2">
        <MessageCircleIcon className="h-4 w-4" />
        <span className="font-medium text-sm">TradingView Chat</span>
        <Badge variant="outline" className="text-xs">
          {roomId}
        </Badge>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {isConnected ? (
            <>
              <WifiIcon className="h-3 w-3 text-green-500" />
              <span className="text-xs text-green-600">Connected</span>
            </>
          ) : (
            <>
              <WifiOffIcon className="h-3 w-3 text-red-500" />
              <span className="text-xs text-red-600">Disconnected</span>
            </>
          )}
        </div>
        
        <PollingControls
          isEnabled={pollingEnabled}
          interval={pollingInterval}
          onToggle={setPollingEnabled}
          onIntervalChange={setPollingInterval}
        />
        
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={isLoading}
          className="h-6 w-6 p-0"
        >
          <RefreshCwIcon className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  )

  const renderError = () => error && (
    <Alert className="m-3 border-destructive/50 bg-destructive/10">
      <AlertDescription className="flex items-center justify-between">
        <span className="text-sm">{error}</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reconnect}
            className="h-6 text-xs"
          >
            Retry
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearError}
            className="h-6 w-6 p-0"
          >
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )

  const renderMessages = () => {
    if (isLoading && messages.length === 0) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground">
          <MessageCircleIcon className="h-8 w-8 mb-2" />
          <p className="text-sm">No messages yet</p>
          <p className="text-xs">Be the first to start the conversation!</p>
        </div>
      )
    }

    return (
      <div className="space-y-1">
        {hasMoreMessages && (
          <div className="flex justify-center py-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              className="text-xs"
            >
              {isLoadingMore ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-2" />
                  Loading...
                </>
              ) : (
                'Load More Messages'
              )}
            </Button>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessage 
            key={message.id || `${message.username}-${message.time}`} 
            message={message} 
            allMessages={messages}
            highlightedUser={highlightedUser}
            onUserClick={setHighlightedUser}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full border rounded-lg bg-background ${className}`}>
      {renderConnectionStatus()}
      {renderError()}
      
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          {renderMessages()}
        </div>
      </ScrollArea>
      
      <ChatInput
        onSendMessage={sendMessage}
        disabled={!isConnected}
        placeholder={isConnected ? "Type a message..." : "Connecting..."}
      />
    </div>
  )
}
