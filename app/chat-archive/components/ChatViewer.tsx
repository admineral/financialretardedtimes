'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SimplePagination, PaginationInfo as PaginationInfoComponent } from '@/components/ui/pagination'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MessageCircleIcon, RefreshCwIcon, ExternalLinkIcon, QuoteIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { format, addDays, subDays, isToday, isYesterday } from 'date-fns'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface TradingViewChatMessage {
  id: string
  username: string
  text: string
  time: string
  avatar?: string
  permalink?: string
  userProfileUrl?: string
}

interface PaginationInfo {
  currentPage: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
  pageLinks: Array<{
    page: number
    url: string
    isCurrent: boolean
  }>
}

interface ChatArchiveData {
  messages: TradingViewChatMessage[]
  room: string
  date: string
  username: string
  totalMessages: number
  totalPages: number
  pagesProcessed: number
  paginationInfo?: PaginationInfo
}


interface ChatViewerProps {
  room: string
  date: string
  username: string
  tradingViewUrl: string
  onAutoLoad?: boolean
  onDataFetched?: () => void // Callback when new data is successfully fetched
  onDateChange?: (newDate: string) => void // Callback when date is changed
  onUrlChange?: (newUrl: string) => void // Callback when URL should be updated
}

export function ChatViewer({ room, date, username, tradingViewUrl, onAutoLoad = true, onDataFetched, onDateChange, onUrlChange }: ChatViewerProps) {
  const [archiveData, setArchiveData] = useState<ChatArchiveData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Streaming state
  const [streamingMessages, setStreamingMessages] = useState<TradingViewChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingProgress, setStreamingProgress] = useState({ current: 0, total: 0 })
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [loadSinglePage, setLoadSinglePage] = useState(false)
  
  // Date navigation state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(date))
  const [calendarOpen, setCalendarOpen] = useState(false)
  

  // Complete TradingView emoji mapping based on their emoji picker
  const emojiMap: { [key: string]: string } = {
    // Hand gestures - Row 1
    ':thumbsup:': '👍',
    ':+1:': '👍',
    ':thumbsdown:': '👎',
    ':-1:': '👎',
    ':ok_hand:': '👌',
    ':ok:': '👌',
    ':v:': '✌️',
    ':hand:': '✋',
    ':raised_hand:': '✋',
    ':clap:': '👏',
    ':pray:': '🙏',
    
    // Faces - Row 2
    ':smiley:': '😃',
    ':smile:': '😊',
    ':laughing:': '😆',
    ':satisfied:': '😆',
    ':joy:': '😂',
    ':sweat_smile:': '😅',
    ':grin:': '😁',
    ':wink:': '😉',
    
    // More faces - Row 3
    ':neutral_face:': '😐',
    ':expressionless:': '😑',
    ':confused:': '😕',
    ':slight_smile:': '🙂',
    ':upside_down:': '🙃',
    ':worried:': '😟',
    ':disappointed:': '😞',
    ':cry:': '😢',
    ':sob:': '😭',
    
    // Emotional faces - Row 4
    ':scream:': '😱',
    ':angry:': '😡',
    ':rage:': '😠',
    ':triumph:': '😤',
    ':sunglasses:': '😎',
    ':cool:': '😎',
    ':nerd:': '🤓',
    ':thinking:': '🤔',
    ':zipper_mouth:': '🤐',
    
    // Special faces - Row 5
    ':face_with_head_bandage:': '🤕',
    ':mask:': '😷',
    ':sleeping:': '😴',
    ':zzz:': '💤',
    ':imp:': '👿',
    ':smiling_imp:': '😈',
    ':alien:': '👽',
    ':robot:': '🤖',
    ':poop:': '💩',
    ':pile_of_poo:': '💩',
    
    // Symbols - Row 6
    ':moneybag:': '💰',
    ':money_with_wings:': '💸',
    ':chart_with_upwards_trend:': '📈',
    ':chart:': '📈',
    ':stonks:': '📈',
    ':chart_with_downwards_trend:': '📉',
    ':notStonks:': '📉',
    ':bear:': '🐻',
    ':footprints:': '👣',
    ':bull:': '🐂',
    ':dollar:': '💵',
    ':euro:': '💶',
    
    // Crypto & Money - Row 7
    ':currency_exchange:': '💱',
    ':pound:': '💷',
    ':yen:': '💴',
    ':bitcoin:': '₿',
    ':leftwards_arrow_with_hook:': '↩️',
    ':moneybag2:': '💰',
    ':cookie:': '🍪',
    ':full_moon:': '🌕',
    
    // Food & Objects - Row 8
    ':coffee:': '☕',
    ':birthday:': '🎂',
    ':cake:': '🍰',
    ':popcorn:': '🍿',
    ':cocktail:': '🍸',
    ':fire:': '🔥',
    ':poop2:': '💩',
    ':heart:': '❤️',
    ':broken_heart:': '💔',
    
    // Weather & Nature - Row 9
    ':sunny:': '☀️',
    ':sun:': '☀️',
    ':new_moon:': '🌑',
    ':first_quarter_moon:': '🌓',
    ':sunflower:': '🌻',
    ':star:': '⭐',
    ':star2:': '🌟',
    ':partly_sunny:': '⛅',
    ':cloud:': '☁️',
    
    // Actions & Symbols - Row 10
    ':zap:': '⚡',
    ':lightning:': '⚡',
    ':hammer:': '🔨',
    ':bulb:': '💡',
    ':slot_machine:': '🎰',
    ':dart:': '🎯',
    ':rocket:': '🚀',
    ':rocket2:': '🚀',
    
    // Misc - Row 11
    ':checkered_flag:': '🏁',
    ':alarm_clock:': '⏰',
    ':rip:': '🪦',
    ':ghost:': '👻',
    ':up:': '🆙',
    ':cool2:': '🆒',
    ':free:': '🆓',
    
    // Bottom Row
    ':sos:': '🆘',
    ':100:': '💯',
    ':no_entry:': '⛔',
    
    // Additional common emojis
    ':eyes:': '👀',
    ':facepalm:': '🤦',
    ':shrug:': '🤷',
    ':diamond:': '💎',
    ':gem:': '💎',
    ':hands:': '🙌',
    ':flushed:': '😳',
    ':panic:': '😱',
    ':wait:': '☝️',
    ':hourglass:': '⏳',
    ':check:': '✅',
    ':white_check_mark:': '✅',
    ':x:': '❌',
    ':cross:': '❌',
    ':warning:': '⚠️',
    ':question:': '❓',
    ':grey_question:': '❓',
    ':exclamation:': '❗',
    ':grey_exclamation:': '❗',
    ':muscle:': '💪',
    ':brain:': '🧠',
    ':bomb:': '💣',
    ':boom:': '💥',
    ':collision:': '💥',
    ':snowflake:': '❄️',
    ':rainbow:': '🌈',
    ':moon:': '🌙',
    ':crescent_moon:': '🌙',
    ':skull:': '💀',
    ':wave:': '👋',
    ':point_up:': '☝️',
    ':point_down:': '👇',
    ':point_left:': '👈',
    ':point_right:': '👉',
    ':raised_hands:': '🙌',
    ':trophy:': '🏆',
    ':gift:': '🎁',
    ':tada:': '🎉',
    ':party:': '🎉',
    ':confetti_ball:': '🎊',
    ':balloon:': '🎈',
    ':beers:': '🍻',
    ':wine_glass:': '🍷'
  }

  // Format time for display
  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(parseFloat(timeStr) * 1000)
      return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return timeStr
    }
  }

  // Function to convert emoji codes to actual emojis
  const renderEmojis = (text: string): string => {
    let result = text
    Object.entries(emojiMap).forEach(([code, emoji]) => {
      const regex = new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      result = result.replace(regex, emoji)
    })
    return result
  }

  // Helper function to check if URL is a TradingView image
  const isTradingViewImage = (url: string): boolean => {
    return url.includes('s3.tradingview.com/snapshots/') && (url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg'))
  }

  // Helper function to check if URL is a TradingView idea/chart
  const isTradingViewIdea = (url: string): boolean => {
    return url.includes('tradingview.com/chart/') && url.includes('/')
  }

  // Helper function to check if URL is a TradingView snapshot (x/ URLs)
  const isTradingViewSnapshot = (url: string): boolean => {
    return url.includes('tradingview.com/x/') && url.includes('/')
  }

  // Helper function to extract chart ID and symbol from TradingView idea URL
  const extractChartInfo = (url: string): { chartId: string; symbol: string } | null => {
    const match = url.match(/\/chart\/([^/]+)\/([^/]+)\/?/)
    return match ? { symbol: match[1], chartId: match[2] } : null
  }

  // Helper function to generate S3 image URL from TradingView idea chart ID
  const getIdeaImageUrl = (chartId: string): string => {
    // TradingView stores idea images as: s3.tradingview.com/{firstLetter}/{chartId}_mid.webp
    const firstLetter = chartId.charAt(0).toLowerCase()
    return `https://s3.tradingview.com/${firstLetter}/${chartId}_mid.webp`
  }

  // Helper function to extract chart ID from TradingView snapshot URL
  const extractSnapshotId = (url: string): string | null => {
    const match = url.match(/\/x\/([^/]+)\/?/)
    return match ? match[1] : null
  }

  // Helper function to generate S3 image URL from snapshot ID
  const getSnapshotImageUrl = (snapshotId: string): string => {
    // TradingView snapshots are stored as: s3.tradingview.com/snapshots/{firstLetter}/{snapshotId}.png
    const firstLetter = snapshotId.charAt(0).toLowerCase()
    return `https://s3.tradingview.com/snapshots/${firstLetter}/${snapshotId}.png`
  }

  // Helper function to format symbol for display
  // Note: Not currently used - kept for potential future use
  // const formatSymbol = (symbol: string): string => {
  //   // Convert symbols like BTCUSD to BTC/USD
  //   if (symbol.length > 3 && !symbol.includes(':')) {
  //     const base = symbol.slice(0, 3)
  //     const quote = symbol.slice(3)
  //     return `${base}/${quote}`
  //   }
  //   return symbol.replace(':', ' ')
  // }

  // Helper function to render text with clickable links, mentions, and image previews
  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const mentionRegex = /@(\w+)/g
    
    // Split by both URLs and mentions
    const combinedRegex = /(https?:\/\/[^\s]+|@\w+)/g
    const parts = text.split(combinedRegex)
    const elements: React.ReactNode[] = []
    
    parts.forEach((part, index) => {
      if (urlRegex.test(part)) {
        // Debug: Log URL detection
        if (part.includes('tradingview.com')) {
          console.log('🔍 Detected TradingView URL:', part, {
            isS3Image: isTradingViewImage(part),
            isSnapshot: isTradingViewSnapshot(part),
            isIdea: isTradingViewIdea(part)
          })
        }
        
        // Check if it's a TradingView image
        if (isTradingViewImage(part)) {
          // Add the image preview without showing the link
          // Use image proxy to avoid CORS issues on Vercel
          const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(part)}`
          
          elements.push(
            <div key={index} className="my-2">
              <div className="max-w-md">
                <Image
                  src={proxyUrl}
                  alt="TradingView Chart"
                  width={400}
                  height={300}
                  unoptimized
                  className="rounded-lg border shadow-sm max-w-full h-auto cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.open(part, '_blank')}
                  onError={() => {
                    // Handle error silently
                  }}
                />
              </div>
            </div>
          )
        } else if (isTradingViewSnapshot(part)) {
          // TradingView snapshot link (x/ URLs)
          // Generate S3 URL from snapshot ID (same pattern as ideas)
          const snapshotId = extractSnapshotId(part)
          if (snapshotId) {
            const snapshotImageUrl = getSnapshotImageUrl(snapshotId)
            const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(snapshotImageUrl)}`
            
            // Render like screenshots - simple image with badge
            elements.push(
              <div key={index} className="my-2">
                <div className="max-w-md relative">
                  <Image
                    src={proxyUrl}
                    alt="TradingView Chart Snapshot"
                    width={400}
                    height={300}
                    unoptimized
                    className="rounded-lg border shadow-sm max-w-full h-auto cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => window.open(part, '_blank')}
                    onError={() => {
                      // Handle error silently
                    }}
                  />
                  <div className="absolute top-2 left-2">
                    <Badge variant="default" className="text-xs bg-green-600">
                      📊 Chart
                    </Badge>
                  </div>
                </div>
              </div>
            )
          } else {
            // Fallback to link if can't extract ID
            elements.push(
              <a
                key={index}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 underline break-all"
              >
                {part}
              </a>
            )
          }
        } else if (isTradingViewIdea(part)) {
          // TradingView idea/chart link - use direct S3 image URL instead of Puppeteer
          const chartInfo = extractChartInfo(part)
          if (chartInfo) {
            // Generate S3 image URL from chart ID
            const ideaImageUrl = getIdeaImageUrl(chartInfo.chartId)
            const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(ideaImageUrl)}`
            
            // Render like screenshots - simple image with badge
            elements.push(
              <div key={index} className="my-2">
                <div className="max-w-md relative">
                  <Image
                    src={proxyUrl}
                    alt="TradingView Idea"
                    width={400}
                    height={300}
                    unoptimized
                    className="rounded-lg border shadow-sm max-w-full h-auto cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => window.open(part, '_blank')}
                    onError={() => {
                      // Handle error silently
                    }}
                  />
                  <div className="absolute top-2 left-2">
                    <Badge variant="default" className="text-xs bg-blue-600">
                      💡 Idea
                    </Badge>
                  </div>
                </div>
              </div>
            )
          } else {
            // Fallback to regular link if we can't extract chart info
            elements.push(
              <a
                key={index}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 underline break-all"
              >
                {part}
              </a>
            )
          }
        } else {
          // Regular link
          elements.push(
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 underline break-all"
            >
              {part}
            </a>
          )
        }
      } else if (mentionRegex.test(part)) {
        // Handle @ mentions
        elements.push(
          <span key={index} className="text-blue-500 hover:text-blue-600 cursor-pointer font-medium">
            {part}
          </span>
        )
      } else if (part.trim()) {
        // Only add non-empty text parts, with emoji rendering
        elements.push(<span key={index}>{renderEmojis(part)}</span>)
      }
    })
    
    return elements
  }

  // Parse and render message text with quotes
  const renderMessageText = (text: string) => {
    // Parse quotes using regex (using global and multiline flags)
    const quoteRegex = /\[quote="([^"]+)"\]([\s\S]*?)\[\/quote\]/g
    const parts = []
    let lastIndex = 0
    let match
    
    while ((match = quoteRegex.exec(text)) !== null) {
      // Add text before quote
      if (match.index > lastIndex) {
        const beforeText = text.slice(lastIndex, match.index).trim()
        if (beforeText) {
          parts.push({ type: 'text', content: beforeText })
        }
      }
      
      // Add quote
      parts.push({
        type: 'quote',
        username: match[1],
        content: match[2].trim()
      })
      
      lastIndex = match.index + match[0].length
    }
    
    // Add remaining text after last quote
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex).trim()
      if (remainingText) {
        parts.push({ type: 'text', content: remainingText })
      }
    }
    
    // If no quotes found, return original text with links
    if (parts.length === 0) {
      return <div>{renderTextWithLinks(text)}</div>
    }
    
    return (
      <div className="space-y-2">
        {parts.map((part, index) => {
          if (part.type === 'quote') {
            return (
              <div key={index} className="border-l-4 border-blue-400/50 pl-3 py-2 bg-blue-50/50 dark:bg-blue-950/20 rounded-r-md">
                <div className="flex items-center gap-1 mb-1">
                  <QuoteIcon className="h-3 w-3 text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    {part.username}:
                  </span>
                </div>
                <div className="text-sm text-muted-foreground italic">
                  {renderTextWithLinks(renderEmojis(part.content))}
                </div>
              </div>
            )
          } else {
            return (
              <div key={index}>
                {renderTextWithLinks(part.content)}
              </div>
            )
          }
        })}
      </div>
    )
  }

  // Clean message text (remove HTML tags and decode entities) - now with rich rendering
  const cleanMessageText = (text: string) => {
    // First clean HTML entities
    const cleanedText = text
      .replace(/<br\s*\/?>/gi, '\n') // Replace <br> with newlines
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .trim()
    
    // Then render with rich formatting
    return renderMessageText(cleanedText)
  }

  // Helper function to get a reliable avatar URL
  const getAvatarUrl = (message: TradingViewChatMessage) => {
    // If we have an avatar URL, use it
    if (message.avatar && message.avatar.trim()) {
      return message.avatar
    }
    
    // Always provide a fallback avatar URL based on username
    // This ensures cached data with undefined avatars still shows profile pictures
    return `https://s3.tradingview.com/userpics/${message.username.toLowerCase()}_50.png`
  }

  // Date navigation functions
  const generateUrlForDate = (dateObj: Date, roomParam?: string, usernameParam?: string) => {
    const dateStr = format(dateObj, 'yyyy-MM-dd')
    const roomToUse = roomParam || room
    const usernameToUse = usernameParam || username
    
    return `https://de.tradingview.com/chat/history/?room=${roomToUse}&date=${dateStr}&tzoffset=-120&usernames=${usernameToUse}`
  }

  const updateDateInUrl = (newDate: Date) => {
    setSelectedDate(newDate)
    const newDateStr = format(newDate, 'yyyy-MM-dd')
    const newUrl = generateUrlForDate(newDate)
    
    // Notify parent components about the changes
    onDateChange?.(newDateStr)
    onUrlChange?.(newUrl)
  }

  const goToPreviousDay = () => {
    const prevDay = subDays(selectedDate, 1)
    updateDateInUrl(prevDay)
  }

  const goToNextDay = () => {
    const nextDay = addDays(selectedDate, 1)
    updateDateInUrl(nextDay)
  }

  const goToToday = () => {
    updateDateInUrl(new Date())
  }

  const goToYesterday = () => {
    updateDateInUrl(subDays(new Date(), 1))
  }

  // Format date for display
  const getDateDisplayText = (dateObj: Date) => {
    if (isToday(dateObj)) return 'Today'
    if (isYesterday(dateObj)) return 'Yesterday'
    return format(dateObj, 'PPP') // e.g., "September 27, 2025"
  }


  // Fetch chat archive data (all pages or single page) with streaming support
  const fetchChatArchive = async (specificPage?: number) => {
    if (!room || !date || !username) {
      setError('Please provide valid room, date, and username parameters')
      return
    }

    setIsLoading(true)
    setError(null)
    setStreamingMessages([])
    setIsStreaming(true)
    setStreamingProgress({ current: 0, total: 0 })

    try {
      const response = await fetch('/api/chat-archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room: room,
          date: date,
          username: username,
          // If loading a specific page, limit to just that page
          maxPages: specificPage ? 1 : 10,
          startPage: specificPage || 1,
          stream: !specificPage // Enable streaming for multi-page requests
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch chat archive: ${response.statusText}`)
      }

      // Check if response supports streaming
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        // Regular JSON response (single page or cached data)
        const data = await response.json()
        setArchiveData(data)
        setStreamingMessages([])
        // Notify parent that data was fetched (even if from cache)
        onDataFetched?.()
      } else {
        // Streaming response
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentMessages: TradingViewChatMessage[] = []

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.trim() === '') continue
              
              try {
                const chunk = JSON.parse(line)
                
                if (chunk.type === 'progress') {
                  setStreamingProgress({ current: chunk.current, total: chunk.total })
                } else if (chunk.type === 'messages') {
                  // Add new messages to streaming display
                  currentMessages = [...currentMessages, ...chunk.messages]
                  setStreamingMessages([...currentMessages])
                } else if (chunk.type === 'complete') {
                  // Final data received
                  setArchiveData(chunk.data)
                  setStreamingMessages([])
                  // Notify parent that new data was fetched
                  onDataFetched?.()
                }
              } catch {
                console.warn('Failed to parse streaming chunk:', line)
              }
            }
          }
        }
      }
      
      // Update current page if loading a specific page
      if (specificPage) {
        setCurrentPage(specificPage)
        setLoadSinglePage(true)
      } else {
        setCurrentPage(1)
        setLoadSinglePage(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch chat archive')
      setStreamingMessages([])
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      setStreamingProgress({ current: 0, total: 0 })
    }
  }

  // Handle pagination page change
  const handlePageChange = (page: number) => {
    fetchChatArchive(page)
  }

  // Update selected date when date prop changes
  useEffect(() => {
    if (date) {
      try {
        const dateObj = new Date(date)
        if (!isNaN(dateObj.getTime())) {
          setSelectedDate(dateObj)
        }
      } catch {
        // Invalid date, keep current selection
      }
    }
  }, [date])

  // Keyboard shortcuts for date navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when not typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.key === 'ArrowLeft' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        goToPreviousDay()
      } else if (event.key === 'ArrowRight' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        goToNextDay()
      } else if (event.key === 't' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        goToToday()
      } else if (event.key === 'y' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        goToYesterday()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load when parameters change
  useEffect(() => {
    if (onAutoLoad && room && username && date) {
      // Only auto-load if we have all required parameters and archiveData doesn't match current date
      if (!archiveData || archiveData.date !== date) {
        fetchChatArchive()
      }
    }
  }, [date, room, username, archiveData, onAutoLoad]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Error Display */}
      {error && (
        <Card className="mb-8 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <span className="font-medium">Error:</span>
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State with Streaming */}
      {(isLoading || isStreaming) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCwIcon className="h-5 w-5 animate-spin" />
              {isStreaming ? 'Streaming Messages...' : 'Loading Chat Archive...'}
            </CardTitle>
            <CardDescription>
              {isStreaming && streamingProgress.total > 0 ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress: {streamingProgress.current} / {streamingProgress.total} pages</span>
                    <span>{Math.round((streamingProgress.current / streamingProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(streamingProgress.current / streamingProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                'Fetching messages from TradingView...'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Show streaming messages as they arrive */}
            {streamingMessages.length > 0 ? (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                <div className="text-sm text-muted-foreground mb-2">
                  📡 Live: {streamingMessages.length} messages loaded...
                </div>
                {streamingMessages.slice(-10).map((message, index) => (
                  <div
                    key={`streaming-${message.id}-${index}`}
                    className="flex gap-3 p-2 bg-blue-50/50 dark:bg-blue-950/20 rounded border-l-2 border-blue-400 animate-in slide-in-from-bottom-2 duration-300"
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage 
                        src={getAvatarUrl(message)} 
                        alt={message.username}
                      />
                      <AvatarFallback className="text-xs">
                        {message.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{message.username}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(message.time)}
                        </span>
                      </div>
                      <div className="text-sm text-foreground break-words line-clamp-2">
                        {message.text.substring(0, 100)}{message.text.length > 100 ? '...' : ''}
                      </div>
                    </div>
                  </div>
                ))}
                {streamingMessages.length > 10 && (
                  <div className="text-xs text-muted-foreground text-center py-2">
                    ... and {streamingMessages.length - 10} more messages
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-3 p-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chat Archive Display */}
      {archiveData && !isLoading && (
        <Card>
          <CardHeader>
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2 mb-2">
                  <MessageCircleIcon className="h-5 w-5" />
                  Chat Archive: {archiveData.room}
                </CardTitle>
                <CardDescription>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>📅 {archiveData.date}</span>
                    <span>👤 {archiveData.username}</span>
                    <span>💬 {archiveData.totalMessages} messages</span>
                    {archiveData.totalPages > 1 && (
                      <span>📄 {archiveData.pagesProcessed}/{archiveData.totalPages} pages loaded</span>
                    )}
                  </div>
                </CardDescription>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 lg:items-start">
                {/* Date Navigation Controls */}
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Quick Date Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToToday}
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToYesterday}
                    >
                      Yesterday
                    </Button>
                  </div>

                  {/* Date Navigation Controls */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToPreviousDay}
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                    </Button>

                    {/* Calendar Popover */}
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "justify-start text-left font-normal min-w-[140px]",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? getDateDisplayText(selectedDate) : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(dateObj) => {
                            if (dateObj) {
                              updateDateInUrl(dateObj)
                              setCalendarOpen(false)
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToNextDay}
                    >
                      <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* TradingView Link */}
                <a
                  href={tradingViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 self-start"
                >
                  View on TradingView
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Pagination Info Banner */}
            {archiveData.totalPages > 1 && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/40">
                    📄 Multi-page
                  </Badge>
                  <span className="text-blue-700 dark:text-blue-300">
                    Loaded {archiveData.pagesProcessed} of {archiveData.totalPages} pages
                    {archiveData.pagesProcessed < archiveData.totalPages && (
                      <span className="text-blue-600 dark:text-blue-400 ml-1">
                        (Some messages may be missing - TradingView has more pages)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Pagination Controls (Top) */}
            {archiveData.paginationInfo && archiveData.paginationInfo.totalPages > 1 && (
              <div className="mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <PaginationInfoComponent
                    currentPage={loadSinglePage ? currentPage : 1}
                    totalPages={archiveData.paginationInfo.totalPages}
                    totalItems={archiveData.totalMessages}
                  />
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchChatArchive()}
                      disabled={isLoading}
                    >
                      Load All Pages
                    </Button>
                  </div>
                </div>
                
                {loadSinglePage && (
                  <SimplePagination
                    currentPage={currentPage}
                    totalPages={archiveData.paginationInfo.totalPages}
                    onPageChange={handlePageChange}
                    className="justify-center"
                  />
                )}
              </div>
            )}

            {archiveData.messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageCircleIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No messages found for this user on this date.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {archiveData.messages.map((message, index) => (
                  <div
                    key={`${message.id}-${index}`}
                    className="flex gap-3 p-3 hover:bg-muted/30 rounded-lg transition-colors"
                  >
                    {/* Avatar */}
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarImage 
                        src={getAvatarUrl(message)} 
                        alt={message.username}
                      />
                      <AvatarFallback className="text-xs">
                        {message.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    {/* Message Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {/* Username */}
                        {message.userProfileUrl ? (
                          <a
                            href={`https://de.tradingview.com${message.userProfileUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sm hover:text-primary hover:underline"
                          >
                            {message.username}
                          </a>
                        ) : (
                          <span className="font-medium text-sm">
                            {message.username}
                          </span>
                        )}

                        {/* Time */}
                        <span className="text-xs text-muted-foreground">
                          {formatTime(message.time)}
                        </span>

                        {/* Permalink */}
                        {message.permalink && (
                          <a
                            href={`https://de.tradingview.com${message.permalink}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLinkIcon className="h-3 w-3" />
                          </a>
                        )}
                      </div>

                      {/* Message Text */}
                      <div className="text-sm text-foreground break-words">
                        {cleanMessageText(message.text)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual Load Button */}
      {!archiveData && !isLoading && !error && (
        <Card>
          <CardHeader>
            <CardTitle>Load Chat Archive</CardTitle>
            <CardDescription>
              Click the button below to load messages for {username} in {room} on {date}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => fetchChatArchive()}
              disabled={isLoading || !room || !date || !username}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <MessageCircleIcon className="h-4 w-4 mr-2" />
                  Load Messages
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}
