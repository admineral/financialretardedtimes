import { NextRequest, NextResponse } from 'next/server'
import { ChatMessage } from '../../types'

const TRADINGVIEW_ORIGIN = 'https://de.tradingview.com'

// Enhanced CORS headers for Next.js 15
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId') || 'bitcoin_de_DE'
  const offset = searchParams.get('offset') || '0'

  console.log('🚀 [CHAT API] Starting request for room:', roomId, 'with offset:', offset)

  try {
    const queryString = new URLSearchParams({
      _rand: Math.random().toString(),
      offset: offset,
      room_id: roomId,
      stat_interval: '',
      stat_symbol: '',
      is_private: '',
      _: Date.now().toString()
    }).toString()
    
    const httpUrl = `${TRADINGVIEW_ORIGIN}/conversation-status/?${queryString}`
    console.log('📡 [CHAT API] Fetching URL:', httpUrl)

    const response = await fetch(httpUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': TRADINGVIEW_ORIGIN,
        'Cache-Control': 'no-cache'
      },
    })

    console.log('📊 [CHAT API] Response status:', response.status)
    console.log('📊 [CHAT API] Response headers:', Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      console.error('❌ [CHAT API] HTTP error! status:', response.status)
      const errorText = await response.text()
      console.error('❌ [CHAT API] Error response body:', errorText)
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    console.log('📦 [CHAT API] Raw response data:')
    console.log(JSON.stringify(data, null, 2))
    
    // Log the structure of the response
    console.log('🔍 [CHAT API] Response structure analysis:')
    console.log('- Type:', typeof data)
    console.log('- Keys:', Object.keys(data))
    console.log('- Has messages?', 'messages' in data)
    
    if (data.messages) {
      console.log('💬 [CHAT API] Messages array:')
      console.log('- Length:', data.messages.length)
      console.log('- First message sample:', data.messages[0])
      console.log('- Message keys:', data.messages[0] ? Object.keys(data.messages[0]) : 'No messages')
    }

    const messages: ChatMessage[] = data.messages || []
    console.log('✅ [CHAT API] Processed messages count:', messages.length)

    return NextResponse.json({ 
      success: true, 
      messages: messages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
      meta: {
        roomId,
        timestamp: new Date().toISOString(),
        count: messages.length
      }
    }, {
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('💥 [CHAT API] Error fetching chat history:', error)
    console.error('💥 [CHAT API] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch chat history', 
        messages: []
      },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { roomId, message } = await request.json()
    
    // This would typically require authentication and proper session handling
    // For demo purposes, we'll simulate sending a message
    console.log(`Sending message to room ${roomId}: ${message}`)
    
    return NextResponse.json({ success: true }, {
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send message' },
      { status: 500, headers: corsHeaders }
    )
  }
}
