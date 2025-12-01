'use server'

import { ChatMessage } from './types'

const TRADINGVIEW_ORIGIN = 'https://de.tradingview.com'

export async function fetchChatHistory(roomId: string): Promise<ChatMessage[]> {
  try {
    const httpUrl = `${TRADINGVIEW_ORIGIN}/conversation-status/?_rand=${Math.random()}&offset=0&room_id=${roomId}&stat_interval=&stat_symbol=&is_private=`
    
    const response = await fetch(httpUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': TRADINGVIEW_ORIGIN,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data.messages || []
  } catch (error) {
    console.error('Error fetching chat history:', error)
    return []
  }
}

export async function sendChatMessage(roomId: string, message: string): Promise<boolean> {
  try {
    // This would typically require authentication and proper session handling
    // For demo purposes, we'll simulate sending a message
    console.log(`Sending message to room ${roomId}: ${message}`)
    return true
  } catch (error) {
    console.error('Error sending message:', error)
    return false
  }
}
