'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UsersIcon, RefreshCwIcon } from 'lucide-react'
import { ChatContainer } from './components/ChatContainer'
import { ChattersList } from './components/ChattersList'

export default function TradingViewChatPage() {
  const [selectedRoom] = useState('bitcoin_de_DE')
  const chattersListRef = useRef<{ triggerRefresh: () => void } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsRefreshing(true)
    chattersListRef.current?.triggerRefresh()
  }

  return (
    <div className="h-screen flex">
      {/* Chatters Sidebar */}
      <div className="w-80 border-r bg-background">
        <Card className="h-full flex flex-col border-0 rounded-none">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UsersIcon className="h-4 w-4" />
                Chatters
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-7 w-7 p-0"
                title="Refresh activity data for all users"
              >
                <RefreshCwIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-4">
            <ChattersList 
              ref={chattersListRef}
              roomId={selectedRoom} 
              onRefreshStateChange={setIsRefreshing}
            />
          </CardContent>
        </Card>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1">
        <Card className="h-full flex flex-col border-0 rounded-none">
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ChatContainer 
              roomId={selectedRoom}
              className="h-full border-0 rounded-none"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
