'use client'

// Enhanced WebSocket service for Next.js 15 compatibility

// Type definitions for better type safety
type EventCallback = (data?: unknown) => void
type WebSocketData = string | object | number | boolean | null

interface WebSocketOptions {
  onOpen?: () => void
  onMessage?: (data: WebSocketData) => void
  onClose?: (event: CloseEvent) => void
  onError?: (error: Event) => void
  reconnectDelay?: number
}

export class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimeout: NodeJS.Timeout | null = null
  private isConnecting = false
  private listeners: Map<string, Set<EventCallback>> = new Map()

  constructor(
    private url: string,
    private options: WebSocketOptions = {}
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'))
        return
      }

      this.isConnecting = true
      this.cleanup()

      try {
        console.log('Connecting to WebSocket:', this.url)
        this.ws = new WebSocket(this.url)

        const connectionTimeout = setTimeout(() => {
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            this.ws.close()
            this.isConnecting = false
            reject(new Error('WebSocket connection timeout'))
          }
        }, 15000)

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this.reconnectAttempts = 0
          console.log('WebSocket connected successfully')
          this.options.onOpen?.()
          this.emit('open')
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.options.onMessage?.(data)
            this.emit('message', data)
          } catch (error) {
            console.warn('Failed to parse WebSocket message:', error)
          }
        }

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          console.log('WebSocket closed:', { code: event.code, reason: event.reason })
          
          this.options.onClose?.(event)
          this.emit('close', event)

          // Auto-reconnect logic
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
          }
        }

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          console.error('WebSocket error:', error)
          this.options.onError?.(error)
          this.emit('error', error)
          
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            reject(error)
          }
        }

      } catch (error) {
        this.isConnecting = false
        console.error('Failed to create WebSocket:', error)
        reject(error)
      }
    })
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.reconnectAttempts++
    const delay = Math.min(
      (this.options.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1),
      30000
    )

    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`)

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error)
      })
    }, delay)
  }

  send(data: WebSocketData): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data)
        this.ws.send(message)
        return true
      } catch (error) {
        console.error('Failed to send WebSocket message:', error)
        return false
      }
    }
    return false
  }

  close(code = 1000, reason = 'Normal closure') {
    this.cleanup()
    if (this.ws) {
      this.ws.close(code, reason)
      this.ws = null
    }
  }

  private cleanup() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
  }

  // Event emitter functionality
  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: EventCallback) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.delete(callback)
    }
  }

  private emit(event: string, data?: unknown) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error('Error in event listener:', error)
        }
      })
    }
  }

  get readyState() {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
