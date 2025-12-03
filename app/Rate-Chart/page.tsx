'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TrophyIcon, TrendingUpIcon, UserIcon, CalendarIcon, RefreshCwIcon } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { ChatMessage } from '../Test/types'

interface PriceGuess {
  username: string
  avatar?: string
  price: number
  originalText: string
  timestamp: string
  messageId: string
  timeBonus: number // Bonus multiplier based on time of day
  isLateGuess: boolean // After 12:00 noon Vienna time
}

interface LeaderboardEntry {
  username: string
  avatar?: string
  guesses: PriceGuess[]
  latestGuess: number
  earliestTimestamp: string
  guessCount: number
}

export default function RateChartPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState('Initializing...')
  const [loadedCount, setLoadedCount] = useState(0)
  const [currentBitcoinPrice, setCurrentBitcoinPrice] = useState(120000) // Current Bitcoin price
  const [isPriceLoading, setIsPriceLoading] = useState(true)
  const [midnightPrice, setMidnightPrice] = useState<number | null>(null) // Yesterday's midnight price for winners
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [timeUntilMidnight, setTimeUntilMidnight] = useState('')
  const [isPastMidnight, setIsPastMidnight] = useState(false)
  const [resetInfo, setResetInfo] = useState<{ timestamp: string; active: boolean } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fetchMessages, setFetchMessages] = useState<((force?: boolean) => Promise<void>) | null>(null)
  const [nextRefreshTime, setNextRefreshTime] = useState<number>(0)
  const [timeUntilRefresh, setTimeUntilRefresh] = useState('')
  const [isMounted, setIsMounted] = useState(false)

  // Mark as mounted on client side
  useEffect(() => {
    setIsMounted(true)
    setNextRefreshTime(Date.now() + 5 * 60 * 1000)
  }, [])

  // Fetch current Bitcoin price with 1-hour cache
  useEffect(() => {
    const CACHE_KEY = 'btc_price_cache'
    const CACHE_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds
    
    const fetchBitcoinPrice = async (forceRefresh = false) => {
      try {
        // Check cache first
        if (!forceRefresh && typeof window !== 'undefined') {
          const cached = localStorage.getItem(CACHE_KEY)
          if (cached) {
            const { price, timestamp } = JSON.parse(cached)
            const age = Date.now() - timestamp
            
            if (age < CACHE_DURATION) {
              setCurrentBitcoinPrice(price)
              setIsPriceLoading(false)
              console.log(`💰 [RATE CHART] Using cached BTC price: $${price.toLocaleString()} (${Math.round(age / 1000 / 60)}min old)`)
              return
            }
          }
        }
        
        setIsPriceLoading(true)
        console.log('💰 [RATE CHART] Fetching current Bitcoin price from API...')
        
        // Using CoinGecko API (no API key required)
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        const data = await response.json()
        
        if (data.bitcoin && data.bitcoin.usd) {
          const price = Math.round(data.bitcoin.usd)
          setCurrentBitcoinPrice(price)
          
          // Cache the price
          if (typeof window !== 'undefined') {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              price,
              timestamp: Date.now()
            }))
          }
          
          console.log(`💰 [RATE CHART] Current BTC price: $${price.toLocaleString()} (cached for 1 hour)`)
        }
      } catch (error) {
        console.error('Error fetching Bitcoin price:', error)
        // Keep the default price if fetch fails
      } finally {
        setIsPriceLoading(false)
      }
    }

    fetchBitcoinPrice()
    
    // Refresh price every 60 seconds (will use cache if still valid)
    const priceInterval = setInterval(() => fetchBitcoinPrice(false), 60000)
    
    return () => clearInterval(priceInterval)
  }, [])

  // Fetch midnight price for yesterday (only during Winners Period)
  useEffect(() => {
    const fetchMidnightPrice = async () => {
      const now = new Date()
      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      const currentHour = viennaTime.getHours()
      
      // Only fetch midnight price during Winners Period (00:00-08:00)
      if (currentHour >= 8) {
        return
      }
      
      try {
        console.log('💰 [MIDNIGHT PRICE] Fetching yesterday\'s daily close price...')
        
        // Use market_chart API with daily interval to get yesterday's close
        // The API returns daily snapshots at midnight UTC
        const response = await fetch(
          `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=2&interval=daily`
        )
        const data = await response.json()
        
        if (data.prices && data.prices.length >= 2) {
          // The second-to-last entry is yesterday's close (the last is today)
          const yesterdayPrice = data.prices[data.prices.length - 2]
          const price = Math.round(yesterdayPrice[1])
          
          const priceDate = new Date(yesterdayPrice[0])
          setMidnightPrice(price)
          console.log(`💰 [MIDNIGHT PRICE] Yesterday's close price (${priceDate.toUTCString()}): $${price.toLocaleString()}`)
        } else {
          console.warn('💰 [MIDNIGHT PRICE] No price data available, using current price as fallback')
          setMidnightPrice(currentBitcoinPrice)
        }
      } catch (error) {
        console.error('Error fetching midnight price:', error)
        // Fallback to current price
        setMidnightPrice(currentBitcoinPrice)
      }
    }
    
    fetchMidnightPrice()
  }, [currentBitcoinPrice])

  // Countdown to midnight Vienna time
  // Winners shown from 00:00 - 08:00, then new day starts
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date()
      
      // Convert to Vienna time (CET/CEST)
      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      const currentHour = viennaTime.getHours()
      
      // Winners shown from 00:00 - 08:00
      const isWinnerPeriod = currentHour >= 0 && currentHour < 8
      
      if (isWinnerPeriod) {
        // We're in the winner display period (00:00 - 08:00)
        setIsPastMidnight(true)
        
        // Show countdown until new day starts at 8 AM
        const newDayTime = new Date(viennaTime)
        newDayTime.setHours(8, 0, 0, 0)
        const diff = newDayTime.getTime() - viennaTime.getTime()
        
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        
        setTimeUntilMidnight(`New round starts in ${hours}h ${minutes}m ${seconds}s`)
        return
      }
      
      // Normal countdown mode (08:00 - 23:59)
      setIsPastMidnight(false)
      
      // Countdown to midnight
      const targetTime = new Date(viennaTime)
      targetTime.setHours(24, 0, 0, 0)
      
      const diff = targetTime.getTime() - viennaTime.getTime()
      
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      
      setTimeUntilMidnight(`${hours}h ${minutes}m ${seconds}s`)
    }
    
    updateCountdown()
    const countdownInterval = setInterval(updateCountdown, 1000)
    
    return () => clearInterval(countdownInterval)
  }, [])

  // Countdown to next auto-refresh
  useEffect(() => {
    const updateRefreshCountdown = () => {
      const now = Date.now()
      const diff = nextRefreshTime - now
      
      if (diff <= 0) {
        // If we're past the refresh time and not currently refreshing, show 0
        if (!isRefreshing) {
          setTimeUntilRefresh('0m 0s')
        } else {
          setTimeUntilRefresh('Refreshing...')
        }
        return
      }
      
      const minutes = Math.floor(diff / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      
      setTimeUntilRefresh(`${minutes}m ${seconds}s`)
    }
    
    updateRefreshCountdown()
    const interval = setInterval(updateRefreshCountdown, 1000)
    
    return () => clearInterval(interval)
  }, [nextRefreshTime, isRefreshing])

  useEffect(() => {
    const CACHE_KEY = 'rate_chart_messages_cache'
    const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in milliseconds
    
    const fetchAllMessages = async (forceRefresh = false) => {
      try {
        // Check cache first
        if (!forceRefresh && typeof window !== 'undefined') {
          const cached = localStorage.getItem(CACHE_KEY)
          if (cached) {
            const { messages: cachedMessages, timestamp } = JSON.parse(cached)
            const age = Date.now() - timestamp
            
            if (age < CACHE_DURATION) {
              console.log(`💾 [RATE CHART] Using cached messages: ${cachedMessages.length} messages (${Math.round(age / 1000)}s old)`)
              setMessages(cachedMessages)
              setLoadedCount(cachedMessages.length)
              setIsLoading(false)
              setLoadingStatus('Complete!')
              // Update next refresh time based on cache age
              setNextRefreshTime(timestamp + CACHE_DURATION)
              return
            } else {
              console.log(`⏰ [RATE CHART] Cache expired (${Math.round(age / 1000)}s old), refreshing...`)
            }
          }
        }
        
        setIsLoading(true)
        setLoadingStatus('Loading chat messages...')
        console.log('📚 [RATE CHART] Loading all messages...')
        
        const allMessages: ChatMessage[] = []
        const seenIds = new Set<string>()
        let offset = 0
        const batchSize = 100
        const maxIterations = 50 // Safety limit to prevent infinite loops
        let iterations = 0
        
        // Load messages in batches until we get no more new data
        while (iterations < maxIterations) {
          iterations++
          setLoadingStatus(`Loading messages... (${allMessages.length} loaded)`)
          
          const response = await fetch(`/Test/api/chat?roomId=bitcoin_de_DE&offset=${offset}`)
          const data = await response.json()
          
          if (!data.success || !data.messages || data.messages.length === 0) {
            console.log(`📚 [RATE CHART] No more messages. Total: ${allMessages.length}`)
            break
          }
          
          // Deduplicate messages by ID to prevent counting same messages
          let newMessagesCount = 0
          for (const msg of data.messages) {
            const msgId = msg.id || `${msg.username}-${msg.time}-${msg.text}`
            if (!seenIds.has(msgId)) {
              seenIds.add(msgId)
              allMessages.push(msg)
              newMessagesCount++
            }
          }
          
          setLoadedCount(allMessages.length)
          console.log(`📚 [RATE CHART] Loaded batch at offset ${offset}: ${data.messages.length} messages, ${newMessagesCount} new (Total unique: ${allMessages.length})`)
          
          // If we got no new messages, we've reached the end
          if (newMessagesCount === 0) {
            console.log(`📚 [RATE CHART] No new messages in batch, stopping. Total: ${allMessages.length}`)
            break
          }
          
          // If we got fewer messages than the batch size, we've likely reached the end
          if (data.messages.length < batchSize) {
            console.log(`📚 [RATE CHART] Received fewer messages than batch size (${data.messages.length} < ${batchSize}), likely at end. Total: ${allMessages.length}`)
            break
          }
          
          offset += batchSize
        }
        
        if (iterations >= maxIterations) {
          console.warn(`📚 [RATE CHART] Reached max iterations (${maxIterations}), stopping to prevent infinite loop`)
        }
        
        setLoadingStatus('Filtering for price predictions...')
        await new Promise(resolve => setTimeout(resolve, 500)) // Brief pause to show filtering status
        
        // Cache the messages
        if (typeof window !== 'undefined') {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            messages: allMessages,
            timestamp: Date.now()
          }))
          console.log(`💾 [RATE CHART] Cached ${allMessages.length} messages for 5 minutes`)
        }
        
        // Update next refresh time
        setNextRefreshTime(Date.now() + CACHE_DURATION)
        
        setMessages(allMessages)
        setLoadingStatus('Complete!')
      } catch (error) {
        console.error('Error fetching messages:', error)
        setLoadingStatus('Error loading messages')
      } finally {
        setIsLoading(false)
      }
    }

    fetchAllMessages()
    
    // Store the function so we can call it from the refresh button
    setFetchMessages(() => fetchAllMessages)
    
    // Auto-refresh every 5 minutes (will use cache if still valid)
    const refreshInterval = setInterval(() => fetchAllMessages(false), 5 * 60 * 1000)
    
    return () => clearInterval(refreshInterval)
  }, [])

  // Detect reset command from BigBangTheory
  const resetTimestamp = useMemo<Date | null>(() => {
    // Don't compute during SSR
    if (!isMounted) return null
    
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const currentHour = viennaTime.getHours()
    
    // Define game day same as in priceGuesses
    let gameDayStart: Date
    let gameDayEnd: Date
    
    if (currentHour < 8) {
      const yesterdayVienna = new Date(viennaTime)
      yesterdayVienna.setDate(yesterdayVienna.getDate() - 1)
      yesterdayVienna.setHours(8, 0, 0, 0)
      
      const midnightToday = new Date(viennaTime)
      midnightToday.setHours(0, 0, 0, 0)
      
      gameDayStart = yesterdayVienna
      gameDayEnd = midnightToday
    } else {
      const todayVienna8AM = new Date(viennaTime)
      todayVienna8AM.setHours(8, 0, 0, 0)
      
      const midnightTomorrow = new Date(viennaTime)
      midnightTomorrow.setDate(midnightTomorrow.getDate() + 1)
      midnightTomorrow.setHours(0, 0, 0, 0)
      
      gameDayStart = todayVienna8AM
      gameDayEnd = midnightTomorrow
    }
    
    let reset: Date | null = null
    messages.forEach((message) => {
      const messageDate = new Date(message.time)
      const messageViennaTime = new Date(messageDate.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      
      if (messageViennaTime >= gameDayStart && messageViennaTime < gameDayEnd) {
        if (message.username === 'BigBangTheory' && message.text.includes('//reset')) {
          if (!reset || messageDate > reset) {
            reset = messageDate
            console.log(`🔄 [RATE CHART] Reset command found at ${reset.toISOString()}`)
          }
        }
      }
    })
    
    return reset
  }, [messages, isMounted])

  // Update reset info when reset timestamp changes
  useEffect(() => {
    if (resetTimestamp) {
      setResetInfo({ timestamp: resetTimestamp.toISOString(), active: true })
    } else {
      setResetInfo(null)
    }
  }, [resetTimestamp])

  // Extract price guesses from messages (only today's guesses in Vienna timezone)
  const priceGuesses = useMemo(() => {
    // Don't compute during SSR
    if (!isMounted) return []
    
    const guesses: PriceGuess[] = []
    
    // Get current time in Vienna timezone
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const currentHour = viennaTime.getHours()
    
    // Define the "game day" based on time:
    // - If 00:00-07:59: Show YESTERDAY's predictions (8 AM yesterday → midnight today) FOR WINNERS
    // - If 08:00-23:59: Show TODAY's predictions (8 AM today → midnight tomorrow)
    let gameDayStart: Date
    let gameDayEnd: Date
    
    if (currentHour < 8) {
      // Winners period - show yesterday's game (8 AM yesterday to midnight today)
      const yesterdayVienna = new Date(viennaTime)
      yesterdayVienna.setDate(yesterdayVienna.getDate() - 1)
      yesterdayVienna.setHours(8, 0, 0, 0)
      
      const midnightToday = new Date(viennaTime)
      midnightToday.setHours(0, 0, 0, 0)
      
      gameDayStart = yesterdayVienna
      gameDayEnd = midnightToday
      console.log(`📅 [RATE CHART] Winners Period - Showing YESTERDAY's game: ${gameDayStart.toLocaleString()} → ${gameDayEnd.toLocaleString()}`)
    } else {
      // Active game period - show today's game (midnight today to midnight tomorrow)
      // This includes early bird predictions made between 00:00-08:00!
      const midnightToday = new Date(viennaTime)
      midnightToday.setHours(0, 0, 0, 0)
      
      const midnightTomorrow = new Date(viennaTime)
      midnightTomorrow.setDate(midnightTomorrow.getDate() + 1)
      midnightTomorrow.setHours(0, 0, 0, 0)
      
      gameDayStart = midnightToday
      gameDayEnd = midnightTomorrow
      console.log(`📅 [RATE CHART] Active Game - Showing TODAY's game: ${gameDayStart.toLocaleString()} → ${gameDayEnd.toLocaleString()}`)
    }
    
    // Regex to match //price patterns
    // Matches: //100k, //105454, //105.454, //253,545, //105 k, //105.6k, //105,6k
    const priceRegex = /\/\/(\d+(?:[.,]\d+)*)\s*(k|K)?/g
    
    messages.forEach((message) => {
      // Convert message timestamp to Vienna time
      const messageDate = new Date(message.time)
      const messageViennaTime = new Date(messageDate.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      
      // Only include messages from the current game day
      if (messageViennaTime >= gameDayStart && messageViennaTime < gameDayEnd) {
        // If there's a reset, only include predictions AFTER the reset
        if (resetTimestamp && messageDate <= resetTimestamp) {
          return // Skip predictions before reset
        }
        
        // Remove quoted content before searching for predictions
        // This prevents counting predictions that are just quotes of other users
        // Format: [quote="username"]content[/quote]
        const textWithoutQuotes = message.text.replace(/\[quote[^\]]*\][\s\S]*?\[\/quote\]/gi, '')
        
        const matches = [...textWithoutQuotes.matchAll(priceRegex)]
        
        matches.forEach((match) => {
          // Handle both European (20.000 or 20,5) and US (20,000 or 20.5) number formats
          // European: . is thousands separator, , is decimal
          // US: , is thousands separator, . is decimal
          let cleanedNumber = match[1]
          
          // Check if it's European format: dot followed by exactly 3 digits (thousands separator)
          // e.g., 20.000 or 100.000 or 95.500
          cleanedNumber = cleanedNumber.replace(/\./g, (m, offset, str) => {
            const afterDot = str.substring(offset + 1)
            // If dot is followed by exactly 3 digits (and then end or another separator), it's a thousands separator
            if (/^\d{3}(?:[.,]|$)/.test(afterDot)) {
              return '' // Remove thousands separator
            }
            // Otherwise it's a decimal point
            return '.'
          })
          
          // Handle commas: could be thousands separator or decimal
          cleanedNumber = cleanedNumber.replace(/,/g, (m, offset, str) => {
            const afterComma = str.substring(offset + 1)
            // If comma is followed by exactly 3 digits (and then end or another separator), it's a thousands separator
            if (/^\d{3}(?:[.,]|$)/.test(afterComma)) {
              return '' // Remove thousands separator
            }
            // Otherwise it's a decimal separator (European style)
            return '.' // Convert to decimal point
          })
          
          const numericValue = parseFloat(cleanedNumber)
          const hasK = match[2]?.toLowerCase() === 'k'
          
          // Convert to actual price
          let price = numericValue
          if (hasK) {
            price = numericValue * 1000
          }
          
          // Auto-detect k for typical Bitcoin range (50-200 without k means 50k-200k)
          if (!hasK && numericValue >= 50 && numericValue <= 200) {
            price = numericValue * 1000
            console.log(`🔄 [RATE CHART] Auto-converting ${numericValue} to ${price} (assumed k)`)
          }
          
          // Only include realistic Bitcoin prices (between $1k and $1M)
          if (price >= 1000 && price <= 1000000) {
            // Calculate time bonus
            const hour = messageViennaTime.getHours()
            const isLateGuess = hour >= 12 // After noon
            
            // Time bonus: 100% before 8 AM, 75% 8-12, 50% 12-18, 25% after 18
            let timeBonus = 1.0
            if (hour < 8) {
              timeBonus = 1.0 // 100% - Early bird!
            } else if (hour < 12) {
              timeBonus = 0.75 // 75% - Morning
            } else if (hour < 18) {
              timeBonus = 0.5 // 50% - Afternoon (red zone starts)
            } else {
              timeBonus = 0.25 // 25% - Evening (deep red)
            }
            
            guesses.push({
              username: message.username,
              avatar: message.user_pic || message.avatar,
              price,
              originalText: match[0],
              timestamp: message.time,
              messageId: message.id || `${message.username}-${message.time}`,
              timeBonus,
              isLateGuess
            })
          }
        })
      }
    })
    
    console.log(`💡 [RATE CHART] Extracted ${guesses.length} price guesses from current game day`)
    return guesses
  }, [messages, resetTimestamp])

  // Next round predictions (only during Winners Period 00:00-08:00)
  const nextRoundGuesses = useMemo(() => {
    // Don't compute during SSR
    if (!isMounted) return []
    
    const guesses: PriceGuess[] = []
    
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const currentHour = viennaTime.getHours()
    
    // Only collect next round guesses during Winners Period (00:00-08:00)
    if (currentHour >= 8) {
      return [] // Not in winners period
    }
    
    // Collect predictions from midnight today onwards (for next round)
    const midnightToday = new Date(viennaTime)
    midnightToday.setHours(0, 0, 0, 0)
    
    const priceRegex = /\/\/(\d+(?:[.,]\d+)*)\s*(k|K)?/g
    
    messages.forEach((message) => {
      const messageDate = new Date(message.time)
      const messageViennaTime = new Date(messageDate.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      
      // Only messages after midnight today
      if (messageViennaTime >= midnightToday) {
        // Remove quoted content before searching for predictions
        const textWithoutQuotes = message.text.replace(/\[quote[^\]]*\][\s\S]*?\[\/quote\]/gi, '')
        
        const matches = [...textWithoutQuotes.matchAll(priceRegex)]
        
        matches.forEach((match) => {
          // Handle European number format (dot as thousands separator)
          let cleanedNumber = match[1]
          cleanedNumber = cleanedNumber.replace(/\./g, (m, offset, str) => {
            const afterDot = str.substring(offset + 1)
            if (/^\d{3}(?:[.,]|$)/.test(afterDot)) {
              return ''
            }
            return '.'
          })
          cleanedNumber = cleanedNumber.replace(/,/g, (m, offset, str) => {
            const afterComma = str.substring(offset + 1)
            if (/^\d{3}(?:[.,]|$)/.test(afterComma)) {
              return ''
            }
            return '.'
          })
          
          const numericValue = parseFloat(cleanedNumber)
          const hasK = match[2]?.toLowerCase() === 'k'
          
          let price = numericValue
          if (hasK) {
            price = numericValue * 1000
          }
          
          if (!hasK && numericValue >= 50 && numericValue <= 200) {
            price = numericValue * 1000
          }
          
          if (price >= 1000 && price <= 1000000) {
            const hour = messageViennaTime.getHours()
            
            let timeBonus = 1.0
            if (hour < 8) {
              timeBonus = 1.0
            } else if (hour < 12) {
              timeBonus = 0.75
            } else if (hour < 18) {
              timeBonus = 0.5
            } else {
              timeBonus = 0.25
            }
            
            guesses.push({
              username: message.username,
              avatar: message.user_pic || message.avatar,
              price,
              originalText: match[0],
              timestamp: message.time,
              messageId: message.id || `${message.username}-${message.time}`,
              timeBonus,
              isLateGuess: hour >= 12
            })
          }
        })
      }
    })
    
    console.log(`💡 [RATE CHART] Extracted ${guesses.length} next round guesses (after midnight)`)
    return guesses
  }, [messages, isMounted])

  // Group by username and create leaderboard
  const leaderboard = useMemo(() => {
    // Don't compute during SSR
    if (!isMounted) return []
    
    const userMap = new Map<string, LeaderboardEntry>()
    
    // First, collect all guesses for each user
    priceGuesses.forEach((guess) => {
      if (!userMap.has(guess.username)) {
        userMap.set(guess.username, {
          username: guess.username,
          avatar: guess.avatar,
          guesses: [guess],
          latestGuess: guess.price,
          earliestTimestamp: guess.timestamp,
          guessCount: 1
        })
      } else {
        const entry = userMap.get(guess.username)!
        entry.guesses.push(guess)
        entry.guessCount++
      }
    })
    
    // For each user, find the LATEST guess (newest timestamp) - that's the one that counts!
    userMap.forEach((entry) => {
      // Sort by timestamp descending (newest first)
      entry.guesses.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      // The first one is the newest/latest
      entry.latestGuess = entry.guesses[0].price
      entry.earliestTimestamp = entry.guesses[0].timestamp
      
      console.log(`👤 [LEADERBOARD] ${entry.username}: Latest guess is ${entry.latestGuess} at ${entry.guesses[0].timestamp}`)
    })
    
    // Use midnight price for Winners Period, current price for live game
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const currentHour = viennaTime.getHours()
    const isWinnersPeriod = currentHour >= 0 && currentHour < 8
    
    // During Winners Period, use midnight price if available, otherwise current price
    const referencePrice = isWinnersPeriod && midnightPrice !== null ? midnightPrice : currentBitcoinPrice
    
    // Convert to array and sort by the guess that counts (closest to reference price first)
    return Array.from(userMap.values()).sort((a, b) => {
      const aDiff = Math.abs(a.latestGuess - referencePrice)
      const bDiff = Math.abs(b.latestGuess - referencePrice)
      return aDiff - bDiff
    })
  }, [priceGuesses, currentBitcoinPrice, midnightPrice, isMounted])

  // Get all unique guesses sorted by price
  const allGuessesSorted = useMemo(() => {
    return [...priceGuesses].sort((a, b) => a.price - b.price)
  }, [priceGuesses])

  // Next round leaderboard (during Winners Period)
  const nextRoundLeaderboard = useMemo(() => {
    if (nextRoundGuesses.length === 0) return []
    
    const userMap = new Map<string, LeaderboardEntry>()
    
    nextRoundGuesses.forEach((guess) => {
      if (!userMap.has(guess.username)) {
        userMap.set(guess.username, {
          username: guess.username,
          avatar: guess.avatar,
          guesses: [guess],
          latestGuess: guess.price,
          earliestTimestamp: guess.timestamp,
          guessCount: 1
        })
      } else {
        const entry = userMap.get(guess.username)!
        entry.guesses.push(guess)
        entry.guessCount++
      }
    })
    
    userMap.forEach((entry) => {
      entry.guesses.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      entry.latestGuess = entry.guesses[0].price
      entry.earliestTimestamp = entry.guesses[0].timestamp
    })
    
    return Array.from(userMap.values()).sort((a, b) => {
      const aDiff = Math.abs(a.latestGuess - currentBitcoinPrice)
      const bDiff = Math.abs(b.latestGuess - currentBitcoinPrice)
      return aDiff - bDiff
    })
  }, [nextRoundGuesses, currentBitcoinPrice])

  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return `$${(price / 1000).toFixed(1)}k`
    }
    return `$${price.toLocaleString()}`
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return {
      relative: formatDistanceToNow(date, { addSuffix: true }),
      exact: format(date, 'HH:mm:ss')
    }
  }

  const getPriceDiffBadge = (price: number) => {
    const diff = price - currentBitcoinPrice
    const percentage = ((diff / currentBitcoinPrice) * 100).toFixed(1)
    
    if (Math.abs(diff) < 1000) {
      return <Badge variant="default" className="bg-green-600">🎯 Very Close!</Badge>
    } else if (diff > 0) {
      return <Badge variant="outline">📈 +{percentage}%</Badge>
    } else {
      return <Badge variant="outline">📉 {percentage}%</Badge>
    }
  }

  const getTimeBonusBadge = (timeBonus: number) => {
    const bonusPercent = Math.round(timeBonus * 100)
    
    if (timeBonus >= 1.0) {
      return <Badge variant="default" className="bg-green-600 text-white">🌅 {bonusPercent}% Early Bird</Badge>
    } else if (timeBonus >= 0.75) {
      return <Badge variant="default" className="bg-yellow-600 text-white">☀️ {bonusPercent}% Morning</Badge>
    } else if (timeBonus >= 0.5) {
      return <Badge variant="default" className="bg-orange-600 text-white">🌤️ {bonusPercent}% Afternoon</Badge>
    } else {
      return <Badge variant="destructive">🌙 {bonusPercent}% Late</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-3">
                <TrendingUpIcon className="h-8 w-8 text-yellow-500" />
                <h1 className="text-4xl font-bold">Bitcoin Price Prediction Board</h1>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-16 space-y-6">
                {/* Animated Spinner */}
                <div className="relative">
                  <div className="w-24 h-24 border-8 border-blue-200 dark:border-blue-900 rounded-full"></div>
                  <div className="w-24 h-24 border-8 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                </div>
                
                {/* Status Text */}
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-semibold">{loadingStatus}</h3>
                  {loadedCount > 0 && loadingStatus.includes('Loading') && (
                    <p className="text-sm text-muted-foreground">
                      📊 Scanning messages for Bitcoin price predictions...
                    </p>
                  )}
                  {loadingStatus.includes('Filtering') && (
                    <p className="text-sm text-muted-foreground">
                      🔍 Analyzing {loadedCount.toLocaleString()} messages...
                    </p>
                  )}
                </div>

                {/* Progress Indicators */}
                <div className="flex gap-4 text-sm">
                  <div className={`flex items-center gap-2 ${loadingStatus.includes('Loading') ? 'text-blue-600 font-semibold' : 'text-muted-foreground'}`}>
                    {loadingStatus.includes('Loading') ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <div className="w-4 h-4 text-green-600">✓</div>
                    )}
                    <span>Loading Messages</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${loadingStatus.includes('Filtering') ? 'text-blue-600 font-semibold' : 'text-muted-foreground'}`}>
                    {loadingStatus.includes('Filtering') ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : loadingStatus.includes('Complete') ? (
                      <div className="w-4 h-4 text-green-600">✓</div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    <span>Filtering Predictions</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <TrendingUpIcon className="h-8 w-8 text-yellow-500" />
              <h1 className="text-4xl font-bold">Bitcoin Price Prediction Board</h1>
              
              {/* Refresh Button with Countdown */}
              <div className="flex items-center gap-2">
                <Button
                  onClick={async () => {
                    if (fetchMessages && !isRefreshing) {
                      setIsRefreshing(true)
                      // Clear cache
                      if (typeof window !== 'undefined') {
                        localStorage.removeItem('rate_chart_messages_cache')
                      }
                      await fetchMessages(true)
                      setIsRefreshing(false)
                    }
                  }}
                  disabled={isRefreshing}
                  variant="ghost"
                  size="icon"
                  title="Refresh now"
                >
                  <RefreshCwIcon className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
                <span className="text-xs text-muted-foreground font-mono tabular-nums min-w-[80px]">
                  {isRefreshing ? 'Refreshing...' : timeUntilRefresh}
                </span>
              </div>
            </div>
            
            {/* Countdown to Midnight */}
            <Card className={`${isPastMidnight ? 'bg-yellow-500/20 border-yellow-500' : 'bg-blue-500/10 border-blue-500/30'}`}>
              <CardContent className="py-3 px-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">
                    {isPastMidnight ? '👑 Winners Period (until 8 AM)' : '⏰ Drawing at Midnight (Vienna)'}
                  </div>
                  <div className={`text-2xl font-bold tabular-nums ${isPastMidnight ? 'text-yellow-600' : 'text-blue-600'}`}>
                    {timeUntilMidnight}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-muted-foreground">
              Today&apos;s predictions from chat messages (format: //price) • Winners shown 00:00-08:00 Vienna time 🇦🇹
            </p>
            {resetInfo && (
              <Badge variant="default" className="bg-orange-600 animate-pulse">
                🔄 Reset active - predictions before {formatDistanceToNow(new Date(resetInfo.timestamp), { addSuffix: true })} ignored
              </Badge>
            )}
          </div>
        </div>

        {/* Explanation Box */}
        <Card className="mb-6 border-blue-500/30 bg-blue-500/5">
          <CardContent className="py-4">
            <div className="space-y-2 text-sm">
              <h3 className="font-semibold text-blue-600 flex items-center gap-2">
                📖 So funktioniert&apos;s:
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground mb-1">🎯 Vorhersage abgeben:</p>
                  <p>Schreibe im Chat <code className="bg-muted px-1.5 py-0.5 rounded text-xs">//Preis</code> z.B. <code className="bg-muted px-1.5 py-0.5 rounded text-xs">//95k</code> oder <code className="bg-muted px-1.5 py-0.5 rounded text-xs">//95.000</code></p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">⏰ Zeitraum:</p>
                  <p>Täglich von <strong>08:00 bis 00:00 Uhr</strong> (Wien). Um Mitternacht wird der Gewinner ermittelt!</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">📜 Verlauf sichtbar:</p>
                  <p>Alle Vorhersagen werden gespeichert! Klick auf einen User um seinen <strong>kompletten Verlauf</strong> zu sehen.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">🏆 Gewinner:</p>
                  <p>Wer am nächsten am <strong>Mitternachtspreis</strong> liegt, gewinnt! Nur die <strong>letzte</strong> Vorhersage zählt.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Price & Stats - Compact */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className={`grid grid-cols-2 ${isPastMidnight && midnightPrice !== null ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-6`}>
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUpIcon className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {isPastMidnight ? 'Live Price' : 'Current Price'}
                    {!isPriceLoading && <span className="text-green-600">🔴</span>}
                  </div>
                  <div className="text-lg font-bold text-green-600 font-mono">
                    ${currentBitcoinPrice.toLocaleString()}
                  </div>
                </div>
              </div>
              
              {/* Midnight Price (only during Winners Period) */}
              {isPastMidnight && midnightPrice !== null && (
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                    <TrophyIcon className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      Midnight Close
                      <span className="text-yellow-600">🏆</span>
                    </div>
                    <div className="text-lg font-bold text-yellow-600 font-mono">
                      ${midnightPrice.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold">
                  {priceGuesses.length}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Predictions</div>
                  <div className="text-xl font-bold text-blue-600">
                    {priceGuesses.length} total
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <UserIcon className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Participants</div>
                  <div className="text-xl font-bold text-purple-600">
                    {leaderboard.length}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 font-bold text-xs">
                  ↕
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Range</div>
                  <div className="text-sm font-bold text-orange-600">
                    {allGuessesSorted.length > 0 ? (
                      <>
                        {formatPrice(allGuessesSorted[0].price)} - {formatPrice(allGuessesSorted[allGuessesSorted.length - 1].price)}
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Time Bonus System Explanation */}
        <div className="mb-4 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
          <div className="flex items-center justify-center gap-6 text-xs">
            <span className="font-medium text-muted-foreground">⏰ Time Bonus:</span>
            <div className="flex items-center gap-1">
              <span className="text-green-600 font-semibold">🌅 &lt;8AM: 100%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-yellow-600 font-semibold">☀️ 8-12: 75%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-orange-600 font-semibold">🌤️ 12-18: 50%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-red-600 font-semibold">🌙 &gt;18: 25%</span>
            </div>
          </div>
        </div>

        {/* Winners Podium (shown after midnight) */}
        {isPastMidnight && leaderboard.length >= 3 && (
          <Card className="mb-6 border-4 border-yellow-500 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <TrophyIcon className="h-8 w-8 text-yellow-500" />
                🎉 Today&apos;s Winners! 🎉
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 2nd Place */}
                {leaderboard[1] && (
                  <div className="order-2 md:order-1">
                    <div className="text-center p-6 bg-gray-100 dark:bg-gray-800 rounded-lg border-4 border-gray-400">
                      <div className="text-6xl mb-2">🥈</div>
                      <div className="text-xl font-bold mb-2">2nd Place</div>
                      <Avatar className="h-16 w-16 mx-auto mb-2 border-4 border-gray-400">
                        <AvatarImage src={leaderboard[1].avatar} alt={leaderboard[1].username} />
                        <AvatarFallback>{leaderboard[1].username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="font-semibold">{leaderboard[1].username}</div>
                      <div className="text-2xl font-bold text-blue-600 mt-2">{formatPrice(leaderboard[1].latestGuess)}</div>
                      <div className="text-sm text-muted-foreground">
                        Off by {formatPrice(Math.abs(leaderboard[1].latestGuess - currentBitcoinPrice))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 1st Place - Winner! */}
                {leaderboard[0] && (
                  <div className="order-1 md:order-2">
                    <div className="text-center p-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg border-4 border-yellow-500 transform md:scale-110">
                      <div className="text-8xl mb-2 animate-bounce">👑</div>
                      <div className="text-2xl font-bold mb-2">WINNER! 🎉</div>
                      <Avatar className="h-20 w-20 mx-auto mb-2 border-4 border-yellow-500 ring-4 ring-yellow-300">
                        <AvatarImage src={leaderboard[0].avatar} alt={leaderboard[0].username} />
                        <AvatarFallback>{leaderboard[0].username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="font-bold text-xl">{leaderboard[0].username}</div>
                      <div className="text-3xl font-bold text-green-600 mt-2">{formatPrice(leaderboard[0].latestGuess)}</div>
                      <div className="text-sm text-muted-foreground">
                        Off by {formatPrice(Math.abs(leaderboard[0].latestGuess - currentBitcoinPrice))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3rd Place */}
                {leaderboard[2] && (
                  <div className="order-3">
                    <div className="text-center p-6 bg-orange-100 dark:bg-orange-900/30 rounded-lg border-4 border-orange-400">
                      <div className="text-6xl mb-2">🥉</div>
                      <div className="text-xl font-bold mb-2">3rd Place</div>
                      <Avatar className="h-16 w-16 mx-auto mb-2 border-4 border-orange-400">
                        <AvatarImage src={leaderboard[2].avatar} alt={leaderboard[2].username} />
                        <AvatarFallback>{leaderboard[2].username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="font-semibold">{leaderboard[2].username}</div>
                      <div className="text-2xl font-bold text-blue-600 mt-2">{formatPrice(leaderboard[2].latestGuess)}</div>
                      <div className="text-sm text-muted-foreground">
                        Off by {formatPrice(Math.abs(leaderboard[2].latestGuess - currentBitcoinPrice))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Next Round Preview (shown during Winners Period if there are predictions) */}
        {isPastMidnight && nextRoundLeaderboard.length > 0 && (
          <Card className="mb-6 border-2 border-blue-500 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                🔮 Next Round Preview - Early Birds!
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                These predictions are for tomorrow&apos;s round (starts at 8 AM) • Currently {nextRoundLeaderboard.length} participants
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {nextRoundLeaderboard.slice(0, 5).map((entry) => (
                  <div
                    key={entry.username}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-gray-900/50 border"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={entry.avatar} alt={entry.username} />
                      <AvatarFallback>
                        {entry.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-semibold">{entry.username}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.earliestTimestamp), { addSuffix: true })} (latest)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-600">
                        {formatPrice(entry.latestGuess)}
                      </div>
                    </div>
                  </div>
                ))}
                {nextRoundLeaderboard.length > 5 && (
                  <div className="text-center text-sm text-muted-foreground py-2">
                    ... and {nextRoundLeaderboard.length - 5} more early birds!
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrophyIcon className="h-5 w-5 text-yellow-500" />
              {isPastMidnight ? (
                <>
                  Final Results - {(() => {
                    const now = new Date()
                    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
                    const yesterday = new Date(viennaTime)
                    yesterday.setDate(yesterday.getDate() - 1)
                    return yesterday.toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric',
                      timeZone: 'Europe/Vienna'
                    })
                  })()}
                </>
              ) : (
                <>Live Leaderboard (Closest to ${currentBitcoinPrice.toLocaleString()})</>
              )}
            </CardTitle>
            {isPastMidnight && midnightPrice !== null && (
              <p className="text-sm text-muted-foreground mt-2">
                Midnight closing price: ${midnightPrice.toLocaleString()}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No predictions found. Users can make predictions using format: //price (e.g., //100k, //67500)
              </div>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((entry, index) => (
                  <div key={entry.username}>
                    <div
                      className={`flex items-center gap-4 p-4 rounded-lg border ${
                        index === 0 ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-300' :
                        index === 1 ? 'bg-gray-50 dark:bg-gray-800/20 border-gray-300' :
                        index === 2 ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-300' :
                        'bg-muted/30'
                      }`}
                    >
                      {/* Rank */}
                      <div className="flex-shrink-0 w-12 text-center">
                        {index === 0 && <div className="text-3xl">🥇</div>}
                        {index === 1 && <div className="text-3xl">🥈</div>}
                        {index === 2 && <div className="text-3xl">🥉</div>}
                        {index > 2 && (
                          <div className="text-xl font-bold text-muted-foreground">
                            #{index + 1}
                          </div>
                        )}
                      </div>

                      {/* Avatar & Username */}
                      <Avatar className="h-12 w-12 border-2 border-primary/30">
                        <AvatarImage src={entry.avatar} alt={entry.username} />
                        <AvatarFallback className="bg-muted/50">
                          {entry.avatar ? (
                            entry.username.slice(0, 2).toUpperCase()
                          ) : (
                            <UserIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => setSelectedUser(selectedUser === entry.username ? null : entry.username)}
                          className="font-semibold truncate hover:text-primary transition-colors cursor-pointer text-left"
                        >
                          {entry.username}
                          {entry.guessCount > 1 && (
                            <span className="ml-2 text-xs text-orange-600 font-normal">
                              ⚠️ {entry.guessCount - 1}x geändert - click to {selectedUser === entry.username ? 'hide' : 'show'} history
                            </span>
                          )}
                        </button>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                        {entry.guessCount > 1 && (
                          <>
                            <span className="text-orange-600 font-medium">{entry.guessCount} Vorhersagen (nur letzte zählt!)</span>
                            <span>•</span>
                          </>
                        )}
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          {formatDistanceToNow(new Date(entry.earliestTimestamp), { addSuffix: true })} (letzte)
                        </span>
                      </div>
                      </div>

                      {/* Latest Guess */}
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">
                          {formatPrice(entry.latestGuess)}
                        </div>
                        <div className="mt-1">
                          {getPriceDiffBadge(entry.latestGuess)}
                        </div>
                      </div>
                    </div>

                    {/* Show history when user is selected */}
                    {entry.guesses.length > 1 && selectedUser === entry.username && (
                      <div className="mt-2 ml-16 mr-4 mb-4 p-4 border-2 border-orange-300 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                        <h4 className="text-sm font-semibold mb-3 text-orange-600 flex items-center gap-2">
                          📜 Verlauf von {entry.username} - {entry.guesses.length} Vorhersagen (nur ✅ letzte zählt!):
                        </h4>
                        <div className="space-y-2">
                          {entry.guesses.map((guess, gIndex) => (
                            <div
                              key={`${guess.messageId}-${gIndex}`}
                              className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                                gIndex === 0 
                                  ? 'bg-green-100 dark:bg-green-950/30 border-2 border-green-500' 
                                  : 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 opacity-60'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`text-xs font-semibold ${
                                  gIndex === 0 ? 'text-green-600' : 'text-red-500'
                                }`}>
                                  {gIndex === 0 ? '✅ ZÄHLT' : `❌ Überschrieben`}
                                </div>
                                  <div>
                                    <div className="text-sm font-medium">
                                      {formatPrice(guess.price)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatTimestamp(guess.timestamp).relative}
                                      <span className="ml-2 font-mono text-[10px] opacity-70">
                                        {formatTimestamp(guess.timestamp).exact}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                <code className="text-xs bg-muted px-2 py-1 rounded">
                                  {guess.originalText}
                                </code>
                                {getTimeBonusBadge(guess.timeBonus)}
                                {getPriceDiffBadge(guess.price)}
                              </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* All Predictions Timeline - Minimized */}
        <details className="group mt-8">
          <summary className="cursor-pointer list-none">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between">
                  <span>All Predictions (Sorted by Price)</span>
                  <Badge variant="outline" className="group-open:hidden">
                    Click to expand {allGuessesSorted.length} predictions
                  </Badge>
                  <Badge variant="outline" className="hidden group-open:inline-flex">
                    Click to collapse
                  </Badge>
                </CardTitle>
              </CardHeader>
            </Card>
          </summary>
          <Card className="mt-2">
            <CardContent className="pt-4">
              <div className="space-y-2">
                {allGuessesSorted.map((guess, index) => (
                  <div
                    key={`${guess.messageId}-${index}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={guess.avatar} alt={guess.username} />
                        <AvatarFallback className="text-[10px]">
                          {guess.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-xs">{guess.username}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(guess.timestamp), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                        {guess.originalText}
                      </code>
                      <div className="text-xs font-bold text-blue-600">
                        {formatPrice(guess.price)}
                      </div>
                      {getTimeBonusBadge(guess.timeBonus)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </details>
      </div>
    </div>
  )
}

