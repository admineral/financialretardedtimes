'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ChatMessage as ChatMessageType } from '../types'
import { UserHoverCard } from './UserHoverCard'
import { formatDistanceToNow } from 'date-fns'
import { QuoteIcon, ImageIcon, UserIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ChatMessageProps {
  message: ChatMessageType
  allMessages?: ChatMessageType[] // For user analytics
  highlightedUser?: string | null
  onUserClick?: (username: string | null) => void
}

export function ChatMessage({ message, allMessages = [], highlightedUser, onUserClick }: ChatMessageProps) {
  const router = useRouter()
  
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

  // Function to convert emoji codes to actual emojis
  const renderEmojis = (text: string): string => {
    let result = text
    Object.entries(emojiMap).forEach(([code, emoji]) => {
      const regex = new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      result = result.replace(regex, emoji)
    })
    return result
  }

  // Safe date parsing with fallback
  const getTimeAgo = () => {
    try {
      const messageDate = new Date(message.time)
      if (isNaN(messageDate.getTime())) {
        return 'Unknown time'
      }
      return formatDistanceToNow(messageDate, { addSuffix: true })
    } catch {
      return 'Unknown time'
    }
  }
  
  const timeAgo = getTimeAgo()
  
  // Use the richer avatar data if available
  const avatarUrl = message.user_pic || message.avatar
  const isBot = message.isBot || false
  const isModerator = message.is_moderator || false
  
  // Extract charts from meta data (not used anymore - ideas rendered from URLs directly)
  // const charts = message.meta?.links?.charts
  // const chartData = charts?.data
  
  // Extract image data from meta (for chart snapshots)
  const metaImage = message.meta?.url || message.meta?.preview_url
  const isChartSnapshot = message.meta?.type === 'snapshot'
  
  // Get user messages for analytics
  const userMessages = allMessages.filter(msg => msg.username === message.username)
  
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
  // Note: Not currently used - snapshot URLs are skipped in favor of meta.url
  // const extractSnapshotId = (url: string): string | null => {
  //   const match = url.match(/\/x\/([^/]+)\/?/)
  //   return match ? match[1] : null
  // }



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

  // Helper function to clean text after TradingView idea URLs
  const cleanTextAfterIdea = (text: string): string => {
    // Remove the entire TradingView auto-generated block that appears after idea links
    let cleanedText = text
    
    // Remove the complete block pattern: "TradingView Chart" followed by title, symbol, and "View Chart"
    cleanedText = cleanedText.replace(/TradingView Chart\s*\n[\s\S]*?View Chart[^\n]*/g, '')
    
    // Remove individual components that might appear separately
    cleanedText = cleanedText.replace(/TradingView Chart\s*/g, '')
    cleanedText = cleanedText.replace(/TageBuch:.*?(?=\n|$)/g, '')
    cleanedText = cleanedText.replace(/INDEX:[A-Z]+\s*/g, '')
    cleanedText = cleanedText.replace(/View Chart\.*/g, '')
    
    // Clean up extra whitespace and empty lines
    cleanedText = cleanedText.replace(/\n\s*\n\s*\n+/g, '\n\n') // Multiple empty lines to double
    cleanedText = cleanedText.replace(/^\s*\n+/gm, '') // Empty lines at start
    cleanedText = cleanedText.replace(/\s+$/gm, '') // Trailing spaces
    
    return cleanedText.trim()
  }

  // Helper function to render text with clickable links, mentions, and image previews
  const renderTextWithLinks = (text: string) => {
    // Clean the text first
    const cleanedText = cleanTextAfterIdea(text)
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const mentionRegex = /@(\w+)/g
    
    // Split by both URLs and mentions
    const combinedRegex = /(https?:\/\/[^\s]+|@\w+)/g
    const parts = cleanedText.split(combinedRegex)
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proxyUrl}
                  alt="TradingView Chart"
                  width={400}
                  height={300}
                  className="rounded-lg border shadow-sm max-w-full h-auto cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.open(part, '_blank')}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            </div>
          )
        } else if (isTradingViewSnapshot(part)) {
          // TradingView snapshot link (x/ URLs)
          // Don't render here - TradingView provides pre-rendered S3 images in message.meta
          // which are displayed below. Puppeteer screenshots are unreliable on Vercel.
          console.log('📊 Skipping snapshot URL (using meta.url instead):', part)
          
          // Skip rendering - the image will be shown via message.meta below
          // This prevents duplicate rendering and avoids Puppeteer issues on Vercel
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proxyUrl}
                    alt="TradingView Idea"
                    width={400}
                    height={300}
                    className="rounded-lg border shadow-sm max-w-full h-auto cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => window.open(part, '_blank')}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
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
        const username = part.substring(1) // Remove the @ symbol
        const mentionedUserMessages = allMessages.filter(msg => msg.username === username)
        
        elements.push(
          <UserHoverCard key={index} username={username} userMessages={mentionedUserMessages}>
            <span className="text-blue-500 hover:text-blue-600 cursor-pointer font-medium">
              {part}
            </span>
          </UserHoverCard>
        )
      } else if (part.trim()) {
        // Only add non-empty text parts, with emoji rendering
        elements.push(<span key={index}>{renderEmojis(part)}</span>)
      }
    })
    
    return elements
  }
  
  // Parse and render message text with quotes
  const renderMessageText = () => {
    const text = message.text
    
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
      return <span>{renderTextWithLinks(text)}</span>
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
              <span key={index} className="block">
                {renderTextWithLinks(part.content)}
              </span>
            )
          }
        })}
      </div>
    )
  }
  
  // Check if this message should be highlighted
  const isHighlighted = highlightedUser === message.username
  
  // Handle message click to highlight user
  const handleMessageClick = () => {
    if (onUserClick) {
      // If clicking on the same user, toggle off the highlight
      if (highlightedUser === message.username) {
        onUserClick(null)
      } else {
        onUserClick(message.username)
      }
    }
  }

  // Handle username click to navigate to chat archive
  const handleUsernameClick = (event: React.MouseEvent) => {
    event.stopPropagation() // Prevent message highlighting
    router.push(`/chat-archive?username=${encodeURIComponent(message.username)}&room=bitcoin_de_DE`)
  }
  
  return (
    <div 
      className={`flex gap-3 p-3 transition-colors cursor-pointer ${
        isHighlighted 
          ? 'bg-orange-100 hover:bg-orange-200 border-l-4 border-l-orange-400' 
          : 'hover:bg-muted/30'
      }`}
      onClick={handleMessageClick}
    >
      <UserHoverCard username={message.username} userMessages={userMessages}>
        <Avatar className="h-8 w-8 flex-shrink-0 cursor-pointer border-2 border-primary/30 shadow-sm ring-1 ring-primary/20 hover:border-primary/50 hover:ring-2 hover:ring-primary/30 transition-all duration-200">
          <AvatarImage 
            src={avatarUrl} 
            alt={message.username}
            className="rounded-full object-cover"
          />
          <AvatarFallback className="text-xs bg-muted/50 rounded-full">
            {avatarUrl ? (
              message.username.slice(0, 2).toUpperCase()
            ) : (
              <UserIcon className="h-4 w-4 text-muted-foreground" />
            )}
          </AvatarFallback>
        </Avatar>
      </UserHoverCard>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <UserHoverCard username={message.username} userMessages={userMessages}>
            <span 
              className="font-medium text-sm truncate cursor-pointer hover:text-primary transition-colors hover:underline"
              onClick={handleUsernameClick}
            >
              {message.username}
            </span>
          </UserHoverCard>
          
          {/* Show user badges */}
          {message.badges?.map((badge) => (
            <Badge key={badge.name} variant="outline" className="text-xs px-1.5 py-0.5">
              {badge.verbose_name}
            </Badge>
          ))}
          
          {isModerator && (
            <Badge variant="default" className="text-xs px-1.5 py-0.5">
              MOD
            </Badge>
          )}
          
          {isBot && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
              BOT
            </Badge>
          )}
          
          <span className="text-xs text-muted-foreground">
            {timeAgo}
          </span>
        </div>
        
        <div className="text-sm text-foreground break-words mb-2">
          {renderMessageText()}
        </div>
        
        {/* Render meta image if it's a chart snapshot */}
        {isChartSnapshot && metaImage && (
          <div className="mt-2 max-w-md">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              <span>{message.meta?.text || 'Chart Snapshot'}</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={metaImage.includes('s3.tradingview.com') ? `/api/image-proxy?url=${encodeURIComponent(metaImage)}` : metaImage}
              alt="Chart Snapshot"
              width={400}
              height={300}
              className="rounded-lg border shadow-sm max-w-full h-auto cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => window.open(metaImage, '_blank')}
              onError={(e) => {
                // Hide the image on error
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        )}

      </div>
    </div>
  )
}
