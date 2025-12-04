'use client'

import { useState, useEffect, useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatDistanceToNow, format } from 'date-fns'
import { ChatMessage } from '../Test/types'

interface PriceGuess {
  username: string
  avatar?: string
  price: number
  originalText: string
  timestamp: string
  messageId: string
  timeBonus: number
  isLateGuess: boolean
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
  const [currentBitcoinPrice, setCurrentBitcoinPrice] = useState(120000)
  const [isPriceLoading, setIsPriceLoading] = useState(true)
  const [midnightPrice, setMidnightPrice] = useState<number | null>(null)
  const [midnightPriceTime, setMidnightPriceTime] = useState<Date | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [timeUntilMidnight, setTimeUntilMidnight] = useState('')
  const [isPastMidnight, setIsPastMidnight] = useState(false)
  const [resetInfo, setResetInfo] = useState<{ timestamp: string; active: boolean } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fetchMessages, setFetchMessages] = useState<((force?: boolean) => Promise<void>) | null>(null)
  const [nextRefreshTime, setNextRefreshTime] = useState<number>(0)
  const [timeUntilRefresh, setTimeUntilRefresh] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [isRevealed, setIsRevealed] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  
  // All-time leaderboard state
  const [allTimeLeaderboard, setAllTimeLeaderboard] = useState<{
    username: string
    avatar: string | null
    total_points: number
    first_place_count: number
    second_place_count: number
    third_place_count: number
  }[]>([])
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true)

  // Mark as mounted on client side
  useEffect(() => {
    setIsMounted(true)
    setNextRefreshTime(Date.now() + 5 * 60 * 1000)
    setCurrentTime(new Date())
    
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    
    return () => clearInterval(timeInterval)
  }, [])

  // Check if predictions should be revealed (after 23:00 Vienna time OR during Winners Period)
  useEffect(() => {
    const checkRevealStatus = () => {
      const now = new Date()
      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      const currentHour = viennaTime.getHours()
      const shouldReveal = currentHour >= 23 || currentHour < 8
      setIsRevealed(shouldReveal)
    }
    
    checkRevealStatus()
    const interval = setInterval(checkRevealStatus, 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch all-time leaderboard
  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch('/Rate-Chart/api/leaderboard?limit=10')
        if (response.ok) {
          const data = await response.json()
          setAllTimeLeaderboard(data.leaderboard || [])
        }
      } catch (error) {
        console.error('[RATE-CHART] Failed to fetch leaderboard:', error)
      } finally {
        setIsLeaderboardLoading(false)
      }
    }
    
    fetchLeaderboard()
  }, [])

  // Fetch current Bitcoin price with 1-hour cache
  useEffect(() => {
    const CACHE_KEY = 'btc_price_cache'
    const CACHE_DURATION = 60 * 60 * 1000
    
    const fetchBitcoinPrice = async (forceRefresh = false) => {
      try {
        if (!forceRefresh && typeof window !== 'undefined') {
          const cached = localStorage.getItem(CACHE_KEY)
          if (cached) {
            const { price, timestamp } = JSON.parse(cached)
            const age = Date.now() - timestamp
            
            if (age < CACHE_DURATION) {
              setCurrentBitcoinPrice(price)
              setIsPriceLoading(false)
              return
            }
          }
        }
        
        setIsPriceLoading(true)
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        const data = await response.json()
        
        if (data.bitcoin && data.bitcoin.usd) {
          const price = Math.round(data.bitcoin.usd)
          setCurrentBitcoinPrice(price)
          
          if (typeof window !== 'undefined') {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              price,
              timestamp: Date.now()
            }))
          }
        }
      } catch (error) {
        console.error('Error fetching Bitcoin price:', error)
      } finally {
        setIsPriceLoading(false)
      }
    }

    fetchBitcoinPrice()
    const priceInterval = setInterval(() => fetchBitcoinPrice(false), 60000)
    return () => clearInterval(priceInterval)
  }, [])

  // Fetch midnight price for yesterday (only during Winners Period)
  // Midnight Vienna = 23:00 UTC (winter) or 22:00 UTC (summer)
  useEffect(() => {
    const fetchMidnightPrice = async () => {
      const now = new Date()
      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      const currentHour = viennaTime.getHours()
      
      // Only fetch during Winners Period (00:00-08:00 Vienna)
      if (currentHour >= 8) return
      
      try {
        console.log('[RATE-CHART] 🕛 Fetching midnight close price...')
        
        // Get hourly data for the last 48 hours to find exact midnight Vienna time
        const response = await fetch(
          `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=2`
        )
        const data = await response.json()
        
        if (data.prices && data.prices.length > 0) {
          // Find the price closest to midnight Vienna time (00:00 today Vienna)
          const midnightVienna = new Date(viennaTime)
          midnightVienna.setHours(0, 0, 0, 0)
          const midnightUTC = midnightVienna.getTime()
          
          console.log(`[RATE-CHART] 🕛 Looking for price at: ${midnightVienna.toISOString()} (Vienna midnight)`)
          console.log(`[RATE-CHART] 🕛 Available data points: ${data.prices.length}`)
          
          // Find the closest price to midnight Vienna
          let closestPrice = data.prices[0]
          let closestDiff = Math.abs(data.prices[0][0] - midnightUTC)
          
          for (const pricePoint of data.prices) {
            const diff = Math.abs(pricePoint[0] - midnightUTC)
            if (diff < closestDiff) {
              closestDiff = diff
              closestPrice = pricePoint
            }
          }
          
          const priceTime = new Date(closestPrice[0])
          const price = Math.round(closestPrice[1])
          
          console.log(`[RATE-CHART] 🕛 Closest price found:`)
          console.log(`[RATE-CHART]    Time: ${priceTime.toISOString()} (${priceTime.toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })} Vienna)`)
          console.log(`[RATE-CHART]    Price: $${price.toLocaleString()}`)
          console.log(`[RATE-CHART]    Diff from midnight: ${Math.round(closestDiff / 60000)} minutes`)
          
          setMidnightPrice(price)
          setMidnightPriceTime(priceTime)
        } else {
          console.log('[RATE-CHART] ⚠️ No price data, using current price')
          setMidnightPrice(currentBitcoinPrice)
        }
      } catch (error) {
        console.error('[RATE-CHART] ❌ Error fetching midnight price:', error)
        setMidnightPrice(currentBitcoinPrice)
      }
    }
    
    fetchMidnightPrice()
  }, [currentBitcoinPrice])

  // Countdown to midnight Vienna time
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date()
      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      const currentHour = viennaTime.getHours()
      const isWinnerPeriod = currentHour >= 0 && currentHour < 8
      
      if (isWinnerPeriod) {
        setIsPastMidnight(true)
        const newDayTime = new Date(viennaTime)
        newDayTime.setHours(8, 0, 0, 0)
        const diff = newDayTime.getTime() - viennaTime.getTime()
        
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        
        setTimeUntilMidnight(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
        return
      }
      
      setIsPastMidnight(false)
      const targetTime = new Date(viennaTime)
      targetTime.setHours(24, 0, 0, 0)
      
      const diff = targetTime.getTime() - viennaTime.getTime()
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      
      setTimeUntilMidnight(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
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
        setTimeUntilRefresh(isRefreshing ? 'SYNCING...' : '00:00')
        return
      }
      
      const minutes = Math.floor(diff / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeUntilRefresh(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
    }
    
    updateRefreshCountdown()
    const interval = setInterval(updateRefreshCountdown, 1000)
    return () => clearInterval(interval)
  }, [nextRefreshTime, isRefreshing])

  useEffect(() => {
    const CACHE_DURATION = 5 * 60 * 1000
    
    const getGameDate = () => {
      const now = new Date()
      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      const currentHour = viennaTime.getHours()
      
      console.log(`[RATE-CHART] 🗓️ getGameDate() called`)
      console.log(`[RATE-CHART]    Vienna time: ${viennaTime.toLocaleString('de-AT')}`)
      console.log(`[RATE-CHART]    Current hour: ${currentHour}`)
      
      if (currentHour < 8) {
        console.log(`[RATE-CHART]    Hour < 8 → Using YESTERDAY's date`)
        viennaTime.setDate(viennaTime.getDate() - 1)
      } else {
        console.log(`[RATE-CHART]    Hour >= 8 → Using TODAY's date`)
      }
      
      const gameDate = viennaTime.toISOString().split('T')[0]
      console.log(`[RATE-CHART]    Game date: ${gameDate}`)
      
      return gameDate
    }
    
    const fetchAllMessages = async (forceRefresh = false) => {
      try {
        const gameDate = getGameDate()
        
        console.log(`[RATE-CHART] 🚀 fetchAllMessages called with forceRefresh=${forceRefresh}`)
        
        // Cache-busting timestamp for force refresh
        const cacheBuster = forceRefresh ? `&_t=${Date.now()}` : ''
        
        if (!forceRefresh) {
          setLoadingStatus('Checking cache...')
          console.log(`[RATE-CHART] 📦 Checking cache for date: ${gameDate}`)
          const cacheResponse = await fetch(`/Rate-Chart/api/cache?date=${gameDate}`)
          const cacheData = await cacheResponse.json()
          
          console.log(`[RATE-CHART] 📦 Cache response:`, {
            found: cacheData.found,
            valid: cacheData.valid,
            messageCount: cacheData.messageCount,
            cacheAge: cacheData.cacheAge ? `${Math.round(cacheData.cacheAge / 1000)}s` : 'N/A'
          })
          
          if (cacheData.found && cacheData.valid) {
            console.log(`[RATE-CHART] ✅ Using cached data: ${cacheData.messageCount} messages`)
            setMessages(cacheData.messages)
            setLoadedCount(cacheData.messageCount)
            setIsLoading(false)
            setLoadingStatus('Complete!')
            setNextRefreshTime(Date.now() + (CACHE_DURATION - cacheData.cacheAge))
            return
          }
          console.log(`[RATE-CHART] ❌ Cache miss or expired, fetching fresh data...`)
        } else {
          console.log(`[RATE-CHART] 🔄 Force refresh - skipping cache check`)
        }
        
        setIsLoading(true)
        setLoadingStatus('Loading chat messages from database...')
        
        // Fetch messages directly from database (not TradingView API)
        // This ensures we get ALL messages, not just recent ones
        console.log(`[RATE-CHART] 📥 Fetching messages from API for date: ${gameDate}`)
        const response = await fetch(`/Rate-Chart/api/messages?date=${gameDate}${cacheBuster}`)
        const data = await response.json()
        
        console.log(`[RATE-CHART] 📥 API response:`, {
          success: data.success,
          messageCount: data.count,
          error: data.error
        })
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch messages')
        }
        
        const allMessages: ChatMessage[] = data.messages || []
        
        // Log message time range
        if (allMessages.length > 0) {
          console.log(`[RATE-CHART] 📥 Message time range:`)
          console.log(`[RATE-CHART]    First: ${allMessages[0].time}`)
          console.log(`[RATE-CHART]    Last: ${allMessages[allMessages.length - 1].time}`)
        }
        
        setLoadedCount(allMessages.length)
        setLoadingStatus(`Loaded ${allMessages.length} messages from database`)
        
        setLoadingStatus('Saving to cache...')
        
        try {
          await fetch('/Rate-Chart/api/cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: gameDate,
              messages: allMessages,
              messageCount: allMessages.length,
              participantCount: 0,
              predictionCount: 0,
              resetTimestamp: null
            })
          })
        } catch (cacheError) {
          console.error('Failed to save to cache:', cacheError)
        }
        
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
    setFetchMessages(() => fetchAllMessages)
    const refreshInterval = setInterval(() => fetchAllMessages(false), 5 * 60 * 1000)
    return () => clearInterval(refreshInterval)
  }, [])

  // Detect reset command from BigBangTheory
  const resetTimestamp = useMemo<Date | null>(() => {
    if (!isMounted) return null
    
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const currentHour = viennaTime.getHours()
    
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
          }
        }
      }
    })
    
    return reset
  }, [messages, isMounted])

  useEffect(() => {
    if (resetTimestamp) {
      setResetInfo({ timestamp: resetTimestamp.toISOString(), active: true })
    } else {
      setResetInfo(null)
    }
  }, [resetTimestamp])

  // Extract price guesses from messages
  const priceGuesses = useMemo(() => {
    if (!isMounted) return []
    
    const guesses: PriceGuess[] = []
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const currentHour = viennaTime.getHours()
    const currentMinute = viennaTime.getMinutes()
    
    console.log(`[RATE-CHART] ════════════════════════════════════════════`)
    console.log(`[RATE-CHART] 🕐 Current Vienna Time: ${viennaTime.toLocaleString('de-AT')}`)
    console.log(`[RATE-CHART] 🕐 Current Hour: ${currentHour}, Minute: ${currentMinute}`)
    console.log(`[RATE-CHART] 📊 Total messages loaded: ${messages.length}`)
    
    let gameDayStart: Date
    let gameDayEnd: Date
    
    if (currentHour < 8) {
      // Winners Period (00:00-08:00): Show YESTERDAY's game (08:00 yesterday to midnight)
      const yesterdayVienna = new Date(viennaTime)
      yesterdayVienna.setDate(yesterdayVienna.getDate() - 1)
      yesterdayVienna.setHours(8, 0, 0, 0)
      
      const midnightToday = new Date(viennaTime)
      midnightToday.setHours(0, 0, 0, 0)
      
      gameDayStart = yesterdayVienna
      gameDayEnd = midnightToday
      
      console.log(`[RATE-CHART] 🏆 WINNERS PERIOD MODE (00:00-08:00)`)
      console.log(`[RATE-CHART] 📅 Looking for YESTERDAY's game`)
    } else {
      // Active game period (08:00-23:59): Show TODAY's game (08:00 today to midnight)
      const today8AM = new Date(viennaTime)
      today8AM.setHours(8, 0, 0, 0)
      
      const midnightTomorrow = new Date(viennaTime)
      midnightTomorrow.setDate(midnightTomorrow.getDate() + 1)
      midnightTomorrow.setHours(0, 0, 0, 0)
      
      gameDayStart = today8AM
      gameDayEnd = midnightTomorrow
      
      console.log(`[RATE-CHART] 🎮 ACTIVE GAME MODE (08:00-23:59)`)
      console.log(`[RATE-CHART] 📅 Looking for TODAY's game`)
    }
    
    console.log(`[RATE-CHART] 📅 Game window: ${gameDayStart.toLocaleString('de-AT')} → ${gameDayEnd.toLocaleString('de-AT')}`)
    console.log(`[RATE-CHART] 📅 Game window (ISO): ${gameDayStart.toISOString()} → ${gameDayEnd.toISOString()}`)
    
    const priceRegex = /\/\/(\d+(?:[.,]\d+)*)\s*(k|K)?/g
    
    // Log first few messages for debugging
    if (messages.length > 0) {
      console.log(`[RATE-CHART] 📝 First message time: ${messages[0].time}`)
      console.log(`[RATE-CHART] 📝 Last message time: ${messages[messages.length - 1].time}`)
    }
    
    let messagesInWindow = 0
    let messagesWithPricePattern = 0
    let validGuessesFound = 0
    
    messages.forEach((message, idx) => {
      const messageDate = new Date(message.time)
      const messageViennaTime = new Date(messageDate.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      
      const isInWindow = messageViennaTime >= gameDayStart && messageViennaTime < gameDayEnd
      
      if (isInWindow) {
        messagesInWindow++
        
        // Log first few messages in window for debugging
        if (messagesInWindow <= 3) {
          console.log(`[RATE-CHART] ✅ Message in window [${messagesInWindow}]: ${message.username} at ${messageViennaTime.toLocaleString('de-AT')}: "${message.text.substring(0, 50)}..."`)
        }
      }
      
      if (isInWindow) {
        if (resetTimestamp && messageDate <= resetTimestamp) return
        
        const textWithoutQuotes = message.text.replace(/\[quote[^\]]*\][\s\S]*?\[\/quote\]/gi, '')
        const matches = [...textWithoutQuotes.matchAll(priceRegex)]
        
        if (matches.length > 0) {
          messagesWithPricePattern++
          if (messagesWithPricePattern <= 5) {
            console.log(`[RATE-CHART] 💰 Found price pattern in: ${message.username}: "${message.text.substring(0, 80)}"`)
          }
        }
        
        matches.forEach((match) => {
          let cleanedNumber = match[1]
          cleanedNumber = cleanedNumber.replace(/\./g, (m, offset, str) => {
            const afterDot = str.substring(offset + 1)
            if (/^\d{3}(?:[.,]|$)/.test(afterDot)) return ''
            return '.'
          })
          cleanedNumber = cleanedNumber.replace(/,/g, (m, offset, str) => {
            const afterComma = str.substring(offset + 1)
            if (/^\d{3}(?:[.,]|$)/.test(afterComma)) return ''
            return '.'
          })
          
          const numericValue = parseFloat(cleanedNumber)
          const hasK = match[2]?.toLowerCase() === 'k'
          
          let price = numericValue
          if (hasK) price = numericValue * 1000
          if (!hasK && numericValue >= 50 && numericValue <= 200) price = numericValue * 1000
          
          if (price >= 1000 && price <= 1000000) {
            price = Math.round(price / 100) * 100
            const hour = messageViennaTime.getHours()
            
            if (hour >= 23) {
              console.log(`[RATE-CHART] ⏰ Skipping late guess (after 23:00): ${message.username} at ${hour}:00`)
              return
            }
            
            let timeBonus = 1.0
            if (hour < 8) timeBonus = 1.0
            else if (hour < 12) timeBonus = 0.5
            else if (hour < 18) timeBonus = 0.25
            else timeBonus = 0.0
            
            validGuessesFound++
            if (validGuessesFound <= 5) {
              console.log(`[RATE-CHART] ✅ Valid guess [${validGuessesFound}]: ${message.username} → $${price} at ${hour}:${messageViennaTime.getMinutes().toString().padStart(2, '0')}`)
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
    
    console.log(`[RATE-CHART] ════════════════════════════════════════════`)
    console.log(`[RATE-CHART] 📊 SUMMARY:`)
    console.log(`[RATE-CHART]    Total messages: ${messages.length}`)
    console.log(`[RATE-CHART]    Messages in game window: ${messagesInWindow}`)
    console.log(`[RATE-CHART]    Messages with // pattern: ${messagesWithPricePattern}`)
    console.log(`[RATE-CHART]    Valid guesses extracted: ${validGuessesFound}`)
    console.log(`[RATE-CHART] ════════════════════════════════════════════`)
    
    return guesses
  }, [messages, resetTimestamp, isMounted])

  // Next round predictions (only during Winners Period)
  const nextRoundGuesses = useMemo(() => {
    if (!isMounted) return []
    
    const guesses: PriceGuess[] = []
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const currentHour = viennaTime.getHours()
    
    if (currentHour >= 8) return []
    
    const midnightToday = new Date(viennaTime)
    midnightToday.setHours(0, 0, 0, 0)
    
    const priceRegex = /\/\/(\d+(?:[.,]\d+)*)\s*(k|K)?/g
    
    messages.forEach((message) => {
      const messageDate = new Date(message.time)
      const messageViennaTime = new Date(messageDate.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      
      if (messageViennaTime >= midnightToday) {
        const textWithoutQuotes = message.text.replace(/\[quote[^\]]*\][\s\S]*?\[\/quote\]/gi, '')
        const matches = [...textWithoutQuotes.matchAll(priceRegex)]
        
        matches.forEach((match) => {
          let cleanedNumber = match[1]
          cleanedNumber = cleanedNumber.replace(/\./g, (m, offset, str) => {
            const afterDot = str.substring(offset + 1)
            if (/^\d{3}(?:[.,]|$)/.test(afterDot)) return ''
            return '.'
          })
          cleanedNumber = cleanedNumber.replace(/,/g, (m, offset, str) => {
            const afterComma = str.substring(offset + 1)
            if (/^\d{3}(?:[.,]|$)/.test(afterComma)) return ''
            return '.'
          })
          
          const numericValue = parseFloat(cleanedNumber)
          const hasK = match[2]?.toLowerCase() === 'k'
          
          let price = numericValue
          if (hasK) price = numericValue * 1000
          if (!hasK && numericValue >= 50 && numericValue <= 200) price = numericValue * 1000
          
          if (price >= 1000 && price <= 1000000) {
            price = Math.round(price / 100) * 100
            const hour = messageViennaTime.getHours()
            if (hour >= 23) return
            
            let timeBonus = 1.0
            if (hour < 8) timeBonus = 1.0
            else if (hour < 12) timeBonus = 0.5
            else if (hour < 18) timeBonus = 0.25
            else timeBonus = 0.0
            
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
    
    return guesses
  }, [messages, isMounted])

  // Group by username and create leaderboard
  const leaderboard = useMemo(() => {
    if (!isMounted) return []
    
    console.log(`[RATE-CHART] 🏆 Building leaderboard from ${priceGuesses.length} guesses`)
    
    const userMap = new Map<string, LeaderboardEntry>()
    
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
    
    userMap.forEach((entry) => {
      entry.guesses.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      entry.latestGuess = entry.guesses[0].price
      entry.earliestTimestamp = entry.guesses[0].timestamp
    })
    
    const now = new Date()
    const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    const currentHour = viennaTime.getHours()
    const isWinnersPeriod = currentHour >= 0 && currentHour < 8
    const referencePrice = isWinnersPeriod && midnightPrice !== null ? midnightPrice : currentBitcoinPrice
    
    console.log(`[RATE-CHART] 🏆 Leaderboard config:`)
    console.log(`[RATE-CHART]    Is Winners Period: ${isWinnersPeriod}`)
    console.log(`[RATE-CHART]    Reference price: $${referencePrice}`)
    console.log(`[RATE-CHART]    Midnight price: ${midnightPrice !== null ? `$${midnightPrice}` : 'not loaded'}`)
    console.log(`[RATE-CHART]    Current BTC price: $${currentBitcoinPrice}`)
    console.log(`[RATE-CHART]    Unique participants: ${userMap.size}`)
    
    const sorted = Array.from(userMap.values()).sort((a, b) => {
      const aDiff = Math.abs(a.latestGuess - referencePrice)
      const bDiff = Math.abs(b.latestGuess - referencePrice)
      
      // Primary sort: closest to reference price
      if (aDiff !== bDiff) {
        return aDiff - bDiff
      }
      
      // Tiebreaker: earliest timestamp wins (first to tip with same accuracy)
      return new Date(a.earliestTimestamp).getTime() - new Date(b.earliestTimestamp).getTime()
    })
    
    if (sorted.length > 0) {
      console.log(`[RATE-CHART] 🥇 Top 3 winners:`)
      sorted.slice(0, 3).forEach((entry, i) => {
        const diff = Math.abs(entry.latestGuess - referencePrice)
        const tipTime = new Date(entry.earliestTimestamp).toLocaleTimeString('de-AT', { timeZone: 'Europe/Vienna' })
        console.log(`[RATE-CHART]    ${i + 1}. ${entry.username}: $${entry.latestGuess} (off by $${diff}) @ ${tipTime}`)
      })
    }
    
    return sorted
  }, [priceGuesses, currentBitcoinPrice, midnightPrice, isMounted])

  const allGuessesSorted = useMemo(() => {
    return [...priceGuesses].sort((a, b) => a.price - b.price)
  }, [priceGuesses])

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

  // Save winners to leaderboard at 08:00 Vienna time (end of winners period)
  useEffect(() => {
    const saveWinnersToLeaderboard = async () => {
      // Only save if we have winners and midnight price
      if (leaderboard.length < 1 || midnightPrice === null) return
      
      const now = new Date()
      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      const currentHour = viennaTime.getHours()
      const currentMinute = viennaTime.getMinutes()
      
      // Only trigger at exactly 08:00-08:01 Vienna time
      if (currentHour !== 8 || currentMinute > 1) return
      
      // Get game date (yesterday if before 8am)
      const getGameDateForSave = () => {
        if (currentHour < 8) {
          const yesterday = new Date(viennaTime)
          yesterday.setDate(yesterday.getDate() - 1)
          return yesterday.toISOString().split('T')[0]
        }
        return viennaTime.toISOString().split('T')[0]
      }
      
      // Check if we already saved today (use localStorage to prevent duplicate saves)
      const gameDate = getGameDateForSave()
      const savedKey = `winners_saved_${gameDate}`
      if (localStorage.getItem(savedKey)) return
      
      console.log('[RATE-CHART] 🏆 Saving winners to leaderboard...')
      
      try {
        const result = {
          game_date: gameDate,
          midnight_price: midnightPrice,
          winner_username: leaderboard[0].username,
          winner_avatar: leaderboard[0].avatar,
          winner_prediction: leaderboard[0].latestGuess,
          winner_difference: Math.abs(leaderboard[0].latestGuess - midnightPrice),
          winner_timestamp: leaderboard[0].earliestTimestamp,
          second_username: leaderboard[1]?.username,
          second_avatar: leaderboard[1]?.avatar,
          second_prediction: leaderboard[1]?.latestGuess,
          second_difference: leaderboard[1] ? Math.abs(leaderboard[1].latestGuess - midnightPrice) : undefined,
          second_timestamp: leaderboard[1]?.earliestTimestamp,
          third_username: leaderboard[2]?.username,
          third_avatar: leaderboard[2]?.avatar,
          third_prediction: leaderboard[2]?.latestGuess,
          third_difference: leaderboard[2] ? Math.abs(leaderboard[2].latestGuess - midnightPrice) : undefined,
          third_timestamp: leaderboard[2]?.earliestTimestamp,
          total_participants: leaderboard.length,
          total_predictions: priceGuesses.length
        }
        
        const response = await fetch('/Rate-Chart/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        })
        
        if (response.ok) {
          localStorage.setItem(savedKey, 'true')
          console.log('[RATE-CHART] ✅ Winners saved to leaderboard!')
          // Refresh leaderboard
          const leaderboardResponse = await fetch('/Rate-Chart/api/leaderboard?limit=10')
          if (leaderboardResponse.ok) {
            const data = await leaderboardResponse.json()
            setAllTimeLeaderboard(data.leaderboard || [])
          }
        }
      } catch (error) {
        console.error('[RATE-CHART] Failed to save winners:', error)
      }
    }
    
    // Check every minute
    const interval = setInterval(saveWinnersToLeaderboard, 60000)
    saveWinnersToLeaderboard() // Also check immediately
    
    return () => clearInterval(interval)
  }, [leaderboard, midnightPrice, priceGuesses.length])

  const formatPrice = (price: number) => {
    return `$${price.toLocaleString()}`
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return {
      relative: formatDistanceToNow(date, { addSuffix: true }),
      exact: format(date, 'HH:mm:ss')
    }
  }

  const getPriceDiff = (price: number) => {
    const referencePrice = isPastMidnight && midnightPrice !== null ? midnightPrice : currentBitcoinPrice
    const diff = price - referencePrice
    const percentage = ((diff / referencePrice) * 100).toFixed(2)
    return { diff, percentage, isClose: Math.abs(diff) < 1000 }
  }

  const getTimeBonusLabel = (timeBonus: number) => {
    if (timeBonus >= 1.0) return { label: 'EARLY BIRD', color: 'text-emerald-400', bg: 'bg-emerald-500/20' }
    if (timeBonus >= 0.5) return { label: 'MORNING', color: 'text-amber-400', bg: 'bg-amber-500/20' }
    if (timeBonus >= 0.25) return { label: 'AFTERNOON', color: 'text-orange-400', bg: 'bg-orange-500/20' }
    return { label: 'EVENING', color: 'text-red-400', bg: 'bg-red-500/20' }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white font-mono">
        {/* Animated background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzIwMjAzMCIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
          {/* Bitcoin logo animation */}
          <div className="relative mb-8">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center animate-pulse">
              <span className="text-4xl font-bold text-white">₿</span>
            </div>
            <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-orange-500/50 animate-ping" />
          </div>

          {/* Loading text */}
          <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">
            BITCOIN PREDICTION ARENA
          </h1>
          
          <div className="flex items-center gap-3 text-orange-400/80">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          
          <p className="mt-4 text-zinc-500 uppercase tracking-widest text-sm">{loadingStatus}</p>
          
          {loadedCount > 0 && (
            <div className="mt-6 px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg">
              <span className="text-zinc-400 text-sm">{loadedCount.toLocaleString()} messages loaded</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-mono selection:bg-orange-500/30">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzIwMjAzMCIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
      </div>

      <div className="relative z-10">
        {/* Top Status Bar */}
        <div className="border-b border-zinc-800/50 bg-zinc-900/30 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                  <span className="text-lg font-bold">₿</span>
                </div>
                <span className="text-sm font-semibold text-zinc-300 hidden sm:block">BTC ARENA</span>
              </div>

              {/* Live indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">LIVE</span>
              </div>

              {/* Current time */}
              {currentTime && (
                <div className="hidden md:flex items-center gap-2 text-zinc-500 text-xs">
                  <span>🇦🇹</span>
                  <span className="tabular-nums">
                    {currentTime.toLocaleTimeString('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              {/* Refresh countdown */}
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>SYNC</span>
                <span className="tabular-nums text-zinc-400">{timeUntilRefresh}</span>
                <button
                  onClick={async () => {
                    if (!isRefreshing) {
                      setIsRefreshing(true)
                      setLoadingStatus('Syncing from TradingView...')
                      try {
                        // First, trigger sync to fetch new messages from TradingView
                        console.log('[RATE-CHART] 🔄 Manual sync triggered...')
                        const syncResponse = await fetch('/api/cron/sync-chat?trigger=manual', {
                          method: 'POST'
                        })
                        const syncData = await syncResponse.json()
                        console.log('[RATE-CHART] ✅ Sync result:', syncData)
                        
                        // Then reload messages from database with force refresh
                        setLoadingStatus('Reloading messages from database...')
                        if (fetchMessages) {
                          console.log('[RATE-CHART] 🔄 Force refreshing messages...')
                          await fetchMessages(true)
                          console.log('[RATE-CHART] ✅ Messages refreshed!')
                        }
                      } catch (error) {
                        console.error('[RATE-CHART] ❌ Sync failed:', error)
                        setLoadingStatus('Sync failed!')
                      } finally {
                        setIsRefreshing(false)
                        setLoadingStatus('Complete!')
                      }
                    }
                  }}
                  disabled={isRefreshing}
                  className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
                  title="Sync new messages from TradingView"
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Hero Section */}
          <div className="mb-12">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
              <div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
                  <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
                    PREDICTION
                  </span>
                  <br />
                  <span className="text-white">ARENA</span>
                </h1>
                <p className="text-zinc-500 text-sm max-w-md">
                  Daily Bitcoin price predictions from the community. Place your bet with <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-orange-400">//price</code> in chat.
                </p>
              </div>

              {/* Countdown Timer */}
              <div className={`p-6 rounded-2xl border ${isPastMidnight ? 'bg-amber-500/5 border-amber-500/30' : 'bg-zinc-900/50 border-zinc-800'}`}>
                <div className="text-center">
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                    {isPastMidnight ? '👑 Winners Period' : '⏱️ Drawing at Midnight'}
                  </div>
                  <div className={`text-4xl md:text-5xl font-black tabular-nums ${isPastMidnight ? 'text-amber-400' : 'text-white'}`}>
                    {timeUntilMidnight}
                  </div>
                  <div className="text-xs text-zinc-600 mt-2">Vienna Time (CET)</div>
                </div>
              </div>
            </div>

            {/* Reset Alert */}
            {resetInfo && (
              <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">🔄</span>
                </div>
                <div>
                  <div className="font-semibold text-orange-400">Round Reset Active</div>
                  <div className="text-sm text-zinc-400">
                    Predictions before {formatDistanceToNow(new Date(resetInfo.timestamp), { addSuffix: true })} are ignored
                  </div>
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Current Price */}
              <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-2xl group hover:border-emerald-500/50 transition-colors">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {isPastMidnight ? 'LIVE PRICE' : 'CURRENT PRICE'}
                </div>
                <div className="text-2xl md:text-3xl font-black text-emerald-400 tabular-nums">
                  ${currentBitcoinPrice.toLocaleString()}
                </div>
              </div>

              {/* Midnight Price (during winners period) */}
              {isPastMidnight && midnightPrice !== null && (
                <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-2xl group hover:border-amber-500/50 transition-colors">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                    <span>🏆</span>
                    MIDNIGHT CLOSE
                  </div>
                  <div className="text-2xl md:text-3xl font-black text-amber-400 tabular-nums">
                    ${midnightPrice.toLocaleString()}
                  </div>
                </div>
              )}

              {/* Predictions */}
              <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-2xl group hover:border-blue-500/50 transition-colors">
                <div className="text-xs text-zinc-500 mb-2">PREDICTIONS</div>
                <div className="text-2xl md:text-3xl font-black text-blue-400 tabular-nums">
                  {priceGuesses.length}
                </div>
              </div>

              {/* Participants */}
              <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-2xl group hover:border-purple-500/50 transition-colors">
                <div className="text-xs text-zinc-500 mb-2">PARTICIPANTS</div>
                <div className="text-2xl md:text-3xl font-black text-purple-400 tabular-nums">
                  {leaderboard.length}
                </div>
              </div>

              {/* Price Range - Only shown during reveal period (23:00-00:00) */}
              {isRevealed && !isPastMidnight && (
                <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-2xl group hover:border-orange-500/50 transition-colors">
                  <div className="text-xs text-zinc-500 mb-2">PRICE RANGE</div>
                  <div className="text-lg font-bold text-orange-400 tabular-nums">
                    {allGuessesSorted.length > 0 ? (
                      <>
                        {formatPrice(allGuessesSorted[0].price)} — {formatPrice(allGuessesSorted[allGuessesSorted.length - 1].price)}
                      </>
                    ) : '—'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Time Bonus + All-Time Leaders Row */}
          <div className="mb-8 flex flex-col lg:flex-row gap-4">
            {/* All-Time Leaderboard Widget - Compact */}
            <div className="lg:w-64 flex-shrink-0 p-4 bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏆</span>
              <div className="text-xs uppercase tracking-widest text-amber-400 font-bold">All-Time Leaders</div>
            </div>
            
            {isLeaderboardLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : allTimeLeaderboard.length > 0 ? (
              <div className="space-y-2">
                {allTimeLeaderboard.slice(0, 3).map((entry, index) => (
                  <div 
                    key={entry.username}
                    className={`flex items-center gap-2 p-2 rounded-lg ${
                      index === 0 ? 'bg-amber-500/10 border border-amber-500/30' :
                      index === 1 ? 'bg-zinc-500/10 border border-zinc-500/30' :
                      'bg-orange-900/10 border border-orange-900/30'
                    }`}
                  >
                    <span className="text-base">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                    </span>
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={entry.avatar || undefined} alt={entry.username} />
                      <AvatarFallback className="bg-zinc-700 text-[10px]">
                        {entry.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{entry.username}</div>
                      <div className="text-[10px] text-zinc-500">
                        {entry.first_place_count}🥇 {entry.second_place_count}🥈 {entry.third_place_count}🥉
                      </div>
                    </div>
                    <div className="text-sm font-bold text-amber-400">{entry.total_points}pts</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-2">
                <div className="text-zinc-500 text-xs">No results yet</div>
                <div className="text-zinc-600 text-[10px] mt-1">First game ends tomorrow 08:00</div>
                
                {/* Manual save button for admins during winners period */}
                {isPastMidnight && leaderboard.length >= 1 && midnightPrice !== null && (
                  <button
                    onClick={async () => {
                      const now = new Date()
                      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
                      const yesterday = new Date(viennaTime)
                      yesterday.setDate(yesterday.getDate() - 1)
                      const gameDate = yesterday.toISOString().split('T')[0]
                      
                      const result = {
                        game_date: gameDate,
                        midnight_price: midnightPrice,
                        winner_username: leaderboard[0].username,
                        winner_avatar: leaderboard[0].avatar,
                        winner_prediction: leaderboard[0].latestGuess,
                        winner_difference: Math.abs(leaderboard[0].latestGuess - midnightPrice),
                        winner_timestamp: leaderboard[0].earliestTimestamp,
                        second_username: leaderboard[1]?.username,
                        second_avatar: leaderboard[1]?.avatar,
                        second_prediction: leaderboard[1]?.latestGuess,
                        second_difference: leaderboard[1] ? Math.abs(leaderboard[1].latestGuess - midnightPrice) : undefined,
                        second_timestamp: leaderboard[1]?.earliestTimestamp,
                        third_username: leaderboard[2]?.username,
                        third_avatar: leaderboard[2]?.avatar,
                        third_prediction: leaderboard[2]?.latestGuess,
                        third_difference: leaderboard[2] ? Math.abs(leaderboard[2].latestGuess - midnightPrice) : undefined,
                        third_timestamp: leaderboard[2]?.earliestTimestamp,
                        total_participants: leaderboard.length,
                        total_predictions: priceGuesses.length
                      }
                      
                      try {
                        const response = await fetch('/Rate-Chart/api/leaderboard', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(result)
                        })
                        
                        if (response.ok) {
                          alert('Winners saved! Refreshing leaderboard...')
                          const leaderboardResponse = await fetch('/Rate-Chart/api/leaderboard?limit=10')
                          if (leaderboardResponse.ok) {
                            const data = await leaderboardResponse.json()
                            setAllTimeLeaderboard(data.leaderboard || [])
                          }
                        } else {
                          const err = await response.json()
                          alert('Error: ' + (err.error || err.message || 'Unknown error'))
                        }
                      } catch (error) {
                        alert('Failed to save: ' + error)
                      }
                    }}
                    className="mt-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/50 rounded-lg text-amber-400 text-[10px] hover:bg-amber-500/30 transition-colors"
                  >
                    💾 Save Winners
                  </button>
                )}
              </div>
            )}
            
            <div className="mt-3 pt-3 border-t border-amber-500/10 text-center">
              <div className="text-[10px] text-zinc-600">
                🥇 3pts • 🥈 2pts • 🥉 1pt + Time Bonus
              </div>
            </div>
          </div>

            {/* Time Bonus Widget */}
            <div className="flex-1 p-4 bg-zinc-900/30 border border-zinc-800 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-widest text-zinc-500">⏰ Time Bonus</div>
                <div className="text-[10px] text-zinc-600">Früh tippen = mehr Punkte!</div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>🌅</span>
                    <span className="text-xs text-emerald-400">Early Bird</span>
                  </div>
                  <div className="text-xs text-zinc-400">00:00 - 08:00</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-400">+100%</span>
                    <span className="text-[10px] text-emerald-500/60">(6/4/2pts)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>☀️</span>
                    <span className="text-xs text-amber-400">Morning</span>
                  </div>
                  <div className="text-xs text-zinc-400">08:00 - 12:00</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-400">+50%</span>
                    <span className="text-[10px] text-amber-500/60">(4.5/3/1.5pts)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>🌤️</span>
                    <span className="text-xs text-orange-400">Afternoon</span>
                  </div>
                  <div className="text-xs text-zinc-400">12:00 - 18:00</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-orange-400">+25%</span>
                    <span className="text-[10px] text-orange-500/60">(3.75/2.5/1.25pts)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>🌙</span>
                    <span className="text-xs text-red-400">Evening</span>
                  </div>
                  <div className="text-xs text-zinc-400">18:00 - 23:00</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-red-400">+0%</span>
                    <span className="text-[10px] text-red-500/60">(3/2/1pts)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span>🚫</span>
                    <span className="text-xs text-zinc-400">Closed</span>
                  </div>
                  <div className="text-xs text-zinc-500">23:00 - 00:00</div>
                  <div className="text-sm font-bold text-zinc-500">—</div>
                </div>
              </div>
            </div>
          </div>

          {/* Winners Podium (shown after midnight) */}
          {isPastMidnight && leaderboard.length >= 3 && (
            <div className="mb-12">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-black mb-2">
                  <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                    🎉 TODAY&apos;S WINNERS 🎉
                  </span>
                </h2>
                <p className="text-zinc-500 text-sm">
                  Closest predictions to the midnight close price of{' '}
                  <span className="text-amber-400 font-bold">${midnightPrice?.toLocaleString()}</span>
                  {midnightPriceTime && (
                    <span className="text-zinc-600 ml-1">
                      ({format(midnightPriceTime, 'HH:mm')} Vienna)
                    </span>
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                {/* 2nd Place */}
                {leaderboard[1] && (
                  <div className="order-2 md:order-1">
                    <div className="p-6 bg-gradient-to-b from-zinc-400/10 to-transparent border border-zinc-600/50 rounded-2xl text-center">
                      <div className="text-5xl mb-3">🥈</div>
                      <Avatar className="h-16 w-16 mx-auto mb-3 ring-4 ring-zinc-500/50">
                        <AvatarImage src={leaderboard[1].avatar} alt={leaderboard[1].username} />
                        <AvatarFallback className="bg-zinc-800 text-zinc-300">{leaderboard[1].username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="font-bold text-lg mb-1">{leaderboard[1].username}</div>
                      <div className="text-2xl font-black text-zinc-300 tabular-nums">{formatPrice(leaderboard[1].latestGuess)}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        Off by {formatPrice(Math.abs(leaderboard[1].latestGuess - (midnightPrice || currentBitcoinPrice)))}
                      </div>
                      <div className="text-xs text-zinc-600 mt-2 tabular-nums">
                        ⏰ {format(new Date(leaderboard[1].earliestTimestamp), 'HH:mm:ss')}
                      </div>
                    </div>
                  </div>
                )}

                {/* 1st Place */}
                {leaderboard[0] && (
                  <div className="order-1 md:order-2">
                    <div className="p-8 bg-gradient-to-b from-amber-500/20 to-transparent border-2 border-amber-500/50 rounded-2xl text-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent" />
                      <div className="relative">
                        <div className="text-6xl mb-3 animate-bounce">👑</div>
                        <Avatar className="h-20 w-20 mx-auto mb-3 ring-4 ring-amber-500">
                          <AvatarImage src={leaderboard[0].avatar} alt={leaderboard[0].username} />
                          <AvatarFallback className="bg-amber-900 text-amber-200">{leaderboard[0].username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="font-black text-xl mb-1 text-amber-400">{leaderboard[0].username}</div>
                        <div className="text-3xl font-black text-white tabular-nums">{formatPrice(leaderboard[0].latestGuess)}</div>
                        <div className="text-xs text-amber-400/70 mt-1">
                          Off by {formatPrice(Math.abs(leaderboard[0].latestGuess - (midnightPrice || currentBitcoinPrice)))}
                        </div>
                        <div className="text-xs text-amber-500/50 mt-2 tabular-nums">
                          ⏰ {format(new Date(leaderboard[0].earliestTimestamp), 'HH:mm:ss')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3rd Place */}
                {leaderboard[2] && (
                  <div className="order-3">
                    <div className="p-6 bg-gradient-to-b from-orange-700/10 to-transparent border border-orange-700/50 rounded-2xl text-center">
                      <div className="text-5xl mb-3">🥉</div>
                      <Avatar className="h-16 w-16 mx-auto mb-3 ring-4 ring-orange-700/50">
                        <AvatarImage src={leaderboard[2].avatar} alt={leaderboard[2].username} />
                        <AvatarFallback className="bg-orange-900/50 text-orange-300">{leaderboard[2].username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="font-bold text-lg mb-1">{leaderboard[2].username}</div>
                      <div className="text-2xl font-black text-orange-300 tabular-nums">{formatPrice(leaderboard[2].latestGuess)}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        Off by {formatPrice(Math.abs(leaderboard[2].latestGuess - (midnightPrice || currentBitcoinPrice)))}
                      </div>
                      <div className="text-xs text-zinc-600 mt-2 tabular-nums">
                        ⏰ {format(new Date(leaderboard[2].earliestTimestamp), 'HH:mm:ss')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Next Round Preview */}
          {isPastMidnight && nextRoundLeaderboard.length > 0 && (
            <div className="mb-12 p-6 bg-blue-500/5 border border-blue-500/30 rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-blue-400">🔮 Next Round - Early Birds</h3>
                  <p className="text-sm text-zinc-500">Predictions for tomorrow&apos;s round • Prices hidden until 23:00</p>
                </div>
                <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full">
                  <span className="text-sm font-bold text-blue-400">{nextRoundLeaderboard.length} participants</span>
                </div>
              </div>

              <div className="space-y-2">
                {nextRoundLeaderboard.slice(0, 5).map((entry) => (
                  <div key={entry.username} className="flex items-center gap-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={entry.avatar} alt={entry.username} />
                      <AvatarFallback className="bg-zinc-800">{entry.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-semibold">{entry.username}</div>
                      <div className="text-xs text-zinc-500">{formatDistanceToNow(new Date(entry.earliestTimestamp), { addSuffix: true })}</div>
                    </div>
                    <div className="text-xl font-bold text-zinc-600">🔒 ???</div>
                  </div>
                ))}
                {nextRoundLeaderboard.length > 5 && (
                  <div className="text-center text-sm text-zinc-500 py-2">
                    ... and {nextRoundLeaderboard.length - 5} more early birds!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Leaderboard */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black">
                  {isPastMidnight ? (
                    <>Final Results</>
                  ) : isRevealed ? (
                    <>Live Leaderboard</>
                  ) : (
                    <>🔒 Participants</>
                  )}
                </h2>
                <p className="text-sm text-zinc-500">
                  {isPastMidnight ? (
                    <>Yesterday&apos;s game results</>
                  ) : isRevealed ? (
                    <>Sorted by distance to current price</>
                  ) : (
                    <>Prices revealed at 23:00</>
                  )}
                </p>
              </div>
              {isPastMidnight && midnightPrice !== null && (
                <div className="text-right">
                  <div className="text-xs text-zinc-500">Reference Price</div>
                  <div className="text-xl font-bold text-amber-400">${midnightPrice.toLocaleString()}</div>
                </div>
              )}
            </div>

            {leaderboard.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <div className="text-6xl mb-4">📊</div>
                <div className="text-xl font-bold mb-2">No predictions yet</div>
                <div className="text-sm">Use <code className="px-2 py-1 bg-zinc-800 rounded">//price</code> in chat to make a prediction</div>
              </div>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((entry, index) => {
                  const priceDiff = getPriceDiff(entry.latestGuess)
                  const timeBonus = getTimeBonusLabel(entry.guesses[0]?.timeBonus || 0)
                  
                  return (
                    <div key={entry.username}>
                      <div
                        className={`group p-4 rounded-2xl border transition-all ${
                          index === 0 && isRevealed ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/50' :
                          index === 1 && isRevealed ? 'bg-gradient-to-r from-zinc-400/10 to-transparent border-zinc-500/50' :
                          index === 2 && isRevealed ? 'bg-gradient-to-r from-orange-700/10 to-transparent border-orange-700/50' :
                          'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {/* Rank */}
                          <div className="w-12 text-center flex-shrink-0">
                            {isRevealed ? (
                              <>
                                {index === 0 && <div className="text-3xl">🥇</div>}
                                {index === 1 && <div className="text-3xl">🥈</div>}
                                {index === 2 && <div className="text-3xl">🥉</div>}
                                {index > 2 && <div className="text-xl font-black text-zinc-600">#{index + 1}</div>}
                              </>
                            ) : (
                              <div className="text-2xl">✅</div>
                            )}
                          </div>

                          {/* Avatar */}
                          <Avatar className="h-12 w-12 ring-2 ring-zinc-800">
                            <AvatarImage src={entry.avatar} alt={entry.username} />
                            <AvatarFallback className="bg-zinc-800 text-zinc-400">{entry.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => isRevealed && setSelectedUser(selectedUser === entry.username ? null : entry.username)}
                              className={`font-bold text-left ${isRevealed ? 'hover:text-orange-400 cursor-pointer' : ''}`}
                            >
                              {entry.username}
                              {isRevealed && entry.guessCount > 1 && (
                                <span className="ml-2 text-xs text-orange-400 font-normal">
                                  ⚠️ {entry.guessCount - 1}x changed
                                </span>
                              )}
                            </button>
                            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                              <span>{formatDistanceToNow(new Date(entry.earliestTimestamp), { addSuffix: true })}</span>
                              {isRevealed && (
                                <span className={`px-2 py-0.5 rounded-full ${timeBonus.bg} ${timeBonus.color}`}>
                                  {timeBonus.label}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Price */}
                          <div className="text-right">
                            {isRevealed ? (
                              <>
                                <div className="text-2xl font-black tabular-nums">{formatPrice(entry.latestGuess)}</div>
                                <div className={`text-xs tabular-nums ${priceDiff.isClose ? 'text-emerald-400' : priceDiff.diff > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                  {priceDiff.isClose ? '🎯 Very Close!' : `${priceDiff.diff > 0 ? '+' : ''}${priceDiff.percentage}%`}
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-end gap-1">
                                <div className="text-2xl font-bold text-zinc-600">🔒 ???</div>
                                <div className="text-xs text-zinc-600">Reveal @ 23:00</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* History Dropdown */}
                      {isRevealed && entry.guesses.length > 1 && selectedUser === entry.username && (
                        <div className="mt-2 ml-16 mr-4 p-4 bg-orange-500/5 border border-orange-500/30 rounded-xl">
                          <h4 className="text-sm font-bold text-orange-400 mb-3">
                            📜 {entry.username}&apos;s History — {entry.guesses.length} predictions (only ✅ latest counts)
                          </h4>
                          <div className="space-y-2">
                            {entry.guesses.map((guess, gIndex) => {
                              const guessDiff = getPriceDiff(guess.price)
                              const guessTimeBonus = getTimeBonusLabel(guess.timeBonus)
                              
                              return (
                                <div
                                  key={`${guess.messageId}-${gIndex}`}
                                  className={`flex items-center justify-between p-3 rounded-xl ${
                                    gIndex === 0 
                                      ? 'bg-emerald-500/10 border border-emerald-500/30' 
                                      : 'bg-zinc-900/50 border border-zinc-800 opacity-60'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`text-xs font-bold ${gIndex === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {gIndex === 0 ? '✅ COUNTS' : '❌ Overwritten'}
                                    </div>
                                    <div>
                                      <div className="font-bold tabular-nums">{formatPrice(guess.price)}</div>
                                      <div className="text-xs text-zinc-500">
                                        {formatTimestamp(guess.timestamp).relative}
                                        <span className="ml-2 opacity-50">{formatTimestamp(guess.timestamp).exact}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <code className="text-xs bg-zinc-800 px-2 py-1 rounded">{guess.originalText}</code>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${guessTimeBonus.bg} ${guessTimeBonus.color}`}>
                                      {guessTimeBonus.label}
                                    </span>
                                    <span className={`text-xs ${guessDiff.isClose ? 'text-emerald-400' : guessDiff.diff > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                      {guessDiff.isClose ? '🎯' : `${guessDiff.diff > 0 ? '+' : ''}${guessDiff.percentage}%`}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* All Predictions (Collapsible) */}
          {isRevealed && allGuessesSorted.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none">
                <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors flex items-center justify-between">
                  <div className="font-bold">All Predictions (Sorted by Price)</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-500">{allGuessesSorted.length} predictions</span>
                    <svg className="w-5 h-5 text-zinc-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </summary>
              <div className="mt-4 p-4 bg-zinc-900/30 border border-zinc-800 rounded-2xl">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {allGuessesSorted.map((guess, index) => {
                    const timeBonus = getTimeBonusLabel(guess.timeBonus)
                    
                    return (
                      <div
                        key={`${guess.messageId}-${index}`}
                        className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={guess.avatar} alt={guess.username} />
                            <AvatarFallback className="bg-zinc-700 text-xs">{guess.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">{guess.username}</div>
                            <div className="text-xs text-zinc-500">
                              {format(new Date(guess.timestamp), 'HH:mm:ss')} • {formatDistanceToNow(new Date(guess.timestamp), { addSuffix: true })}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <code className="text-xs bg-zinc-700 px-2 py-1 rounded">{guess.originalText}</code>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${timeBonus.bg} ${timeBonus.color}`}>
                            {timeBonus.label}
                          </span>
                          <div className="font-bold tabular-nums text-blue-400">{formatPrice(guess.price)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </details>
          )}

          {/* How It Works */}
          <div className="mt-12 p-6 bg-zinc-900/30 border border-zinc-800 rounded-2xl">
            <h3 className="text-lg font-bold mb-6 text-orange-400">📖 So funktioniert&apos;s</h3>
            
            {/* Price Format Examples */}
            <div className="mb-8 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
              <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-xl">🎯</span> Preis abgeben — Alle gültigen Formate:
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {/* With K suffix */}
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
                  <code className="text-emerald-400 font-bold">//95k</code>
                  <div className="text-xs text-zinc-500 mt-1">= $95,000</div>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
                  <code className="text-emerald-400 font-bold">//95K</code>
                  <div className="text-xs text-zinc-500 mt-1">= $95,000</div>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
                  <code className="text-emerald-400 font-bold">//95.5k</code>
                  <div className="text-xs text-zinc-500 mt-1">= $95,500</div>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
                  <code className="text-emerald-400 font-bold">//95,5k</code>
                  <div className="text-xs text-zinc-500 mt-1">= $95,500</div>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
                  <code className="text-emerald-400 font-bold">//100 k</code>
                  <div className="text-xs text-zinc-500 mt-1">= $100,000</div>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
                  <code className="text-emerald-400 font-bold">//105.5 K</code>
                  <div className="text-xs text-zinc-500 mt-1">= $105,500</div>
                </div>
                
                {/* Full numbers */}
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
                  <code className="text-blue-400 font-bold">//95000</code>
                  <div className="text-xs text-zinc-500 mt-1">= $95,000</div>
                </div>
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
                  <code className="text-blue-400 font-bold">//99857</code>
                  <div className="text-xs text-zinc-500 mt-1">= $99,900 🎯</div>
                </div>
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
                  <code className="text-blue-400 font-bold">//95.000</code>
                  <div className="text-xs text-zinc-500 mt-1">= $95,000</div>
                </div>
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
                  <code className="text-blue-400 font-bold">//95,000</code>
                  <div className="text-xs text-zinc-500 mt-1">= $95,000</div>
                </div>
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
                  <code className="text-blue-400 font-bold">//100.500</code>
                  <div className="text-xs text-zinc-500 mt-1">= $100,500</div>
                </div>
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
                  <code className="text-blue-400 font-bold">//100,500</code>
                  <div className="text-xs text-zinc-500 mt-1">= $100,500</div>
                </div>
                
                {/* Auto-K detection */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center">
                  <code className="text-amber-400 font-bold">//95</code>
                  <div className="text-xs text-zinc-500 mt-1">= $95,000 ⚡</div>
                </div>
              </div>
              <div className="mt-4 text-xs text-zinc-500 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-blue-400">🎯</span>
                  <span>Exakte Zahlen werden auf $100 gerundet (z.B. //99857 = $99,900)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400">⚡</span>
                  <span>Zahlen zwischen 50-200 ohne &quot;k&quot; werden automatisch als Tausender erkannt (z.B. //95 = $95,000)</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
              <div>
                <div className="font-bold mb-1 text-white">⏰ Zeitraum</div>
                <div className="text-zinc-400">
                  Täglich von <strong className="text-white">00:00 bis 23:00</strong> Wiener Zeit. <span className="text-red-400">Nach 23:00 = keine Vorhersagen!</span>
                </div>
              </div>
              <div>
                <div className="font-bold mb-1 text-white">🎯 Rundung</div>
                <div className="text-zinc-400">
                  Preise werden auf <strong className="text-white">$100</strong> gerundet. Kein $1-Sniping möglich!
                </div>
              </div>
              <div>
                <div className="font-bold mb-1 text-white">🔒 Geheime Wetten</div>
                <div className="text-zinc-400">
                  Preise sind <strong className="text-white">versteckt bis 23:00!</strong> Kein Sniping — erst dann wird alles revealed.
                </div>
              </div>
              <div>
                <div className="font-bold mb-1 text-white">🏆 Gewinner</div>
                <div className="text-zinc-400">
                  Wer am nächsten am <strong className="text-white">Mitternachtspreis</strong> liegt, gewinnt! Nur die <strong className="text-white">letzte</strong> Vorhersage zählt.
                </div>
              </div>
              <div>
                <div className="font-bold mb-1 text-white">⏱️ Time Bonus</div>
                <div className="text-zinc-400">
                  Frühere Vorhersagen = höherer Bonus! <strong className="text-white">100% → 50% → 25% → 0%</strong>
                </div>
              </div>
              <div>
                <div className="font-bold mb-1 text-white">📝 Ändern erlaubt</div>
                <div className="text-zinc-400">
                  Du kannst mehrmals tippen — nur die <strong className="text-white">letzte</strong> Vorhersage zählt!
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 text-center text-zinc-600 text-xs">
            <p>Bitcoin Prediction Arena • Vienna Time (CET) • Data refreshes every 5 minutes</p>
          </div>
        </div>
      </div>
    </div>
  )
}
