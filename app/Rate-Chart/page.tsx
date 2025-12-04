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
  const [priceFetchTime, setPriceFetchTime] = useState<Date | null>(null)
  const [midnightPrice, setMidnightPrice] = useState<number | null>(null)
  const [midnightPriceTime, setMidnightPriceTime] = useState<Date | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [timeUntilMidnight, setTimeUntilMidnight] = useState('')
  const [isPastMidnight, setIsPastMidnight] = useState(false)
  const [resetInfo, setResetInfo] = useState<{ timestamp: string; active: boolean } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fetchMessages, setFetchMessages] = useState<((force?: boolean) => Promise<void>) | null>(null)
  const [fetchBitcoinPrice, setFetchBitcoinPrice] = useState<((force?: boolean) => Promise<void>) | null>(null)
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
  const [yesterdayResults, setYesterdayResults] = useState<{
    game_date: string
    midnight_price: number
    winner_username: string
    winner_avatar: string | null
    winner_prediction: number
    winner_timestamp?: string
    winner_time_bonus?: number
    winner_total_points?: number
    second_username?: string
    second_avatar?: string | null
    second_prediction?: number
    second_timestamp?: string
    second_time_bonus?: number
    second_total_points?: number
    third_username?: string
    third_avatar?: string | null
    third_prediction?: number
    third_timestamp?: string
    third_time_bonus?: number
    third_total_points?: number
    total_participants?: number
    total_predictions?: number
  } | null>(null)
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true)
  const [isYesterdayExpanded, setIsYesterdayExpanded] = useState(false)
  const [isAllTimeExpanded, setIsAllTimeExpanded] = useState(false)
  const [allTimeLimit, setAllTimeLimit] = useState(10)
  const [isLoadingMoreAllTime, setIsLoadingMoreAllTime] = useState(false)
  const [yesterdayShowCount, setYesterdayShowCount] = useState(10)
  
  // TEST MODE - Simulate different time periods (only visible if server env allows)
  const [testModeEnabled, setTestModeEnabled] = useState(false)
  const [testMode, setTestMode] = useState<string | null>(null)
  const testModeOptions = [
    { value: null, label: '🔴 Live (Real Time)', hour: null },
    { value: 'morning', label: '☀️ Morning (10:00) - Hidden', hour: 10 },
    { value: 'afternoon', label: '🌤️ Afternoon (15:00) - Hidden', hour: 15 },
    { value: 'evening', label: '🌙 Evening (20:00) - Hidden', hour: 20 },
    { value: 'reveal', label: '👁️ Reveal Time (23:00) - Revealed!', hour: 23 },
    { value: 'reveal-late', label: '👁️ Late Reveal (23:30) - Revealed!', hour: 23.5 },
    { value: 'midnight', label: '🕛 Midnight (00:00) - Winners!', hour: 0 },
    { value: 'winners-early', label: '🏆 Winners Early (02:00)', hour: 2 },
    { value: 'winners-late', label: '🏆 Winners Late (06:00)', hour: 6 },
    { value: 'new-day', label: '🌅 New Day Start (08:00)', hour: 8 },
  ]
  
  // Get simulated Vienna time based on test mode
  const getSimulatedViennaTime = () => {
    // Only run on client side to avoid prerendering issues
    if (typeof window === 'undefined') {
      return new Date()
    }
    
    const now = new Date()
    const realViennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
    
    // Only simulate time if test mode is enabled server-side
    if (!testModeEnabled || testMode === null) return realViennaTime
    
    const option = testModeOptions.find(o => o.value === testMode)
    if (!option || option.hour === null) return realViennaTime
    
    const simulated = new Date(realViennaTime)
    const hour = Math.floor(option.hour)
    const minute = (option.hour % 1) * 60
    simulated.setHours(hour, minute, 0, 0)
    return simulated
  }
  
  // Computed values based on test mode
  const simulatedHour = useMemo(() => {
    if (!isMounted) return 0
    const viennaTime = getSimulatedViennaTime()
    return viennaTime.getHours()
  }, [testMode, isMounted, testModeEnabled])
  
  const isTestRevealed = useMemo(() => {
    if (!isMounted || !testModeEnabled || testMode === null) return null // Use real value
    return simulatedHour >= 23 || simulatedHour < 8
  }, [testMode, simulatedHour, isMounted, testModeEnabled])
  
  const isTestPastMidnight = useMemo(() => {
    if (!isMounted || !testModeEnabled || testMode === null) return null // Use real value
    return simulatedHour >= 0 && simulatedHour < 8
  }, [testMode, simulatedHour, isMounted, testModeEnabled])

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
      // If test mode is active, use simulated value
      if (isTestRevealed !== null) {
        setIsRevealed(isTestRevealed)
        return
      }
      
      const now = new Date()
      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      const currentHour = viennaTime.getHours()
      const shouldReveal = currentHour >= 23 || currentHour < 8
      setIsRevealed(shouldReveal)
    }
    
    checkRevealStatus()
    const interval = setInterval(checkRevealStatus, 1000)
    return () => clearInterval(interval)
  }, [isTestRevealed])

  // Fetch leaderboard function (can be called on refresh)
  const fetchLeaderboard = async (limit: number = 10) => {
    try {
      console.log(`[RATE-CHART] 🏆 Fetching leaderboard (limit: ${limit})...`)
      const response = await fetch(`/Rate-Chart/api/leaderboard?limit=${limit}&_t=${Date.now()}`)
      if (response.ok) {
        const data = await response.json()
        setAllTimeLeaderboard(data.leaderboard || [])
        setYesterdayResults(data.yesterdayResults || null)
        console.log('[RATE-CHART] ✅ Leaderboard updated:', data.leaderboard?.length || 0, 'players')
      }
    } catch (error) {
      console.error('[RATE-CHART] Failed to fetch leaderboard:', error)
    } finally {
      setIsLeaderboardLoading(false)
    }
  }
  
  // Load all all-time leaders
  const loadMoreAllTime = async () => {
    setIsLoadingMoreAllTime(true)
    const newLimit = 100 // Load all players
    await fetchLeaderboard(newLimit)
    setAllTimeLimit(newLimit)
    setIsLoadingMoreAllTime(false)
  }

  // Initial leaderboard fetch
  useEffect(() => {
    fetchLeaderboard()
  }, [])
  
  // Fetch test mode status from server (cannot be bypassed from browser)
  useEffect(() => {
    const checkTestMode = async () => {
      try {
        const response = await fetch('/Rate-Chart/api/test-mode')
        const data = await response.json()
        setTestModeEnabled(data.enabled || false)
        console.log('[RATE-CHART] 🧪 Test mode enabled:', data.enabled)
      } catch (error) {
        console.error('[RATE-CHART] Failed to check test mode:', error)
        setTestModeEnabled(false)
      }
    }
    
    checkTestMode()
  }, [])

  // Fetch current Bitcoin price with 5-minute cache
  useEffect(() => {
    const CACHE_KEY = 'btc_price_cache'
    const CACHE_DURATION = 5 * 60 * 1000
    
    const fetchBitcoinPriceFunc = async (forceRefresh = false) => {
      try {
        if (!forceRefresh && typeof window !== 'undefined') {
          const cached = localStorage.getItem(CACHE_KEY)
          if (cached) {
            const { price, timestamp } = JSON.parse(cached)
            const age = Date.now() - timestamp
            
            if (age < CACHE_DURATION) {
              setCurrentBitcoinPrice(price)
              setPriceFetchTime(new Date(timestamp))
              setIsPriceLoading(false)
              console.log('[RATE-CHART] 💰 Using cached BTC price: $' + price.toLocaleString())
              return
            }
          }
        }
        
        setIsPriceLoading(true)
        console.log('[RATE-CHART] 💰 Fetching fresh BTC price from CoinGecko...')
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        const data = await response.json()
        
        if (data.bitcoin && data.bitcoin.usd) {
          const price = Math.round(data.bitcoin.usd)
          const fetchTime = Date.now()
          setCurrentBitcoinPrice(price)
          setPriceFetchTime(new Date(fetchTime))
          console.log('[RATE-CHART] ✅ BTC price updated: $' + price.toLocaleString())
          
          if (typeof window !== 'undefined') {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              price,
              timestamp: fetchTime
            }))
          }
        }
      } catch (error) {
        console.error('[RATE-CHART] Error fetching Bitcoin price:', error)
      } finally {
        setIsPriceLoading(false)
      }
    }

    fetchBitcoinPriceFunc()
    setFetchBitcoinPrice(() => fetchBitcoinPriceFunc)
    
    const priceInterval = setInterval(() => fetchBitcoinPriceFunc(false), 60000)
    return () => clearInterval(priceInterval)
  }, [])

  // Fetch midnight price for yesterday (only during Winners Period)
  // Midnight Vienna = 23:00 UTC (winter) or 22:00 UTC (summer)
  useEffect(() => {
    const fetchMidnightPrice = async () => {
      const now = new Date()
      const viennaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }))
      const currentHour = viennaTime.getHours()
      
      // Check if we're in winners period (real or simulated)
      const isWinnersPeriod = isTestPastMidnight !== null ? isTestPastMidnight : (currentHour < 8)
      
      // Only fetch during Winners Period (00:00-08:00 Vienna) or in test mode
      if (!isWinnersPeriod) {
        // Clear midnight price when not in winners period
        if (testMode === null) {
          setMidnightPrice(null)
          setMidnightPriceTime(null)
        }
        return
      }
      
      // In test mode, use current price as simulated midnight price
      if (testMode !== null) {
        console.log('[RATE-CHART] 🧪 Test mode: Using current price as midnight price')
        setMidnightPrice(currentBitcoinPrice)
        setMidnightPriceTime(new Date())
        return
      }
      
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
  }, [currentBitcoinPrice, testMode, isTestPastMidnight])

  // Countdown to midnight Vienna time
  useEffect(() => {
    const updateCountdown = () => {
      // Use test mode if active
      const viennaTime = getSimulatedViennaTime()
      const currentHour = viennaTime.getHours()
      
      // Override with test mode value if set
      const isWinnerPeriod = isTestPastMidnight !== null ? isTestPastMidnight : (currentHour >= 0 && currentHour < 8)
      
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
  }, [testMode, isTestPastMidnight])

  // Countdown to next auto-refresh
  useEffect(() => {
    const updateRefreshCountdown = () => {
      const now = Date.now()
      const diff = nextRefreshTime - now
      
      if (diff <= 0) {
        setTimeUntilRefresh(isRefreshing ? 'SYNCING...' : '00:00')
        
        // Trigger refresh when countdown reaches zero (if not already refreshing)
        if (!isRefreshing && diff > -2000 && fetchMessages && fetchBitcoinPrice) {
          console.log('[RATE-CHART] ⏰ Countdown reached 00:00, triggering refresh...')
          setIsRefreshing(true)
          setLoadingStatus('Auto-refreshing...')
          
          Promise.all([
            fetchMessages(false),
            fetchLeaderboard(),
            fetchBitcoinPrice(true)
          ])
            .then(() => {
              console.log('[RATE-CHART] ✅ Auto-refresh complete!')
              setNextRefreshTime(Date.now() + 5 * 60 * 1000)
              setLoadingStatus('Complete!')
            })
            .catch((error) => {
              console.error('[RATE-CHART] ❌ Auto-refresh failed:', error)
              setLoadingStatus('Refresh failed!')
            })
            .finally(() => {
              setIsRefreshing(false)
            })
        }
        return
      }
      
      const minutes = Math.floor(diff / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeUntilRefresh(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
    }
    
    updateRefreshCountdown()
    const interval = setInterval(updateRefreshCountdown, 1000)
    return () => clearInterval(interval)
  }, [nextRefreshTime, isRefreshing, fetchMessages, fetchBitcoinPrice])

  useEffect(() => {
    const CACHE_DURATION = 5 * 60 * 1000
    
    const getGameDate = () => {
      const now = new Date()
      
      // Use Intl.DateTimeFormat.formatToParts for reliable Vienna timezone handling
      // This avoids the bug where toISOString() converts back to UTC incorrectly
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Vienna',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false
      })
      
      const parts = formatter.formatToParts(now)
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || ''
      
      const viennaHour = parseInt(getPart('hour'))
      const viennaYear = getPart('year')
      const viennaMonth = getPart('month')
      const viennaDay = getPart('day')
      
      console.log(`[RATE-CHART] 🗓️ getGameDate() called`)
      console.log(`[RATE-CHART]    Vienna time: ${viennaDay}.${viennaMonth}.${viennaYear} ${viennaHour}:00`)
      console.log(`[RATE-CHART]    Current hour: ${viennaHour}`)
      
      // Today's Vienna date as YYYY-MM-DD
      let gameDate = `${viennaYear}-${viennaMonth}-${viennaDay}`
      
      if (viennaHour < 8) {
        // Winners Period - need yesterday's Vienna date
        // Subtract 24 hours and format again to handle month/year boundaries correctly
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const yesterdayParts = formatter.formatToParts(yesterday)
        const getYesterdayPart = (type: string) => yesterdayParts.find(p => p.type === type)?.value || ''
        gameDate = `${getYesterdayPart('year')}-${getYesterdayPart('month')}-${getYesterdayPart('day')}`
        console.log(`[RATE-CHART]    Hour < 8 → Using YESTERDAY's date`)
      } else {
        console.log(`[RATE-CHART]    Hour >= 8 → Using TODAY's date`)
      }
      
      console.log(`[RATE-CHART]    Game date: ${gameDate}`)
      
      return gameDate
    }
    
    /**
     * STALE-WHILE-REVALIDATE PATTERN:
     * 1. Show cached data immediately (even if stale)
     * 2. Revalidate in background if cache is stale
     * 3. Update UI when fresh data arrives
     * 
     * forceRefresh: Skip cache, read fresh from database
     */
    const fetchAllMessages = async (forceRefresh = false) => {
      try {
        const gameDate = getGameDate()
        
        console.log(`[RATE-CHART] 🚀 fetchAllMessages called with forceRefresh=${forceRefresh}`)
        
        // STEP 1: Check cache first (stale-while-revalidate)
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
          
          // STALE-WHILE-REVALIDATE: Show stale data immediately, then refresh
          if (cacheData.found && cacheData.messages?.length > 0) {
            console.log(`[RATE-CHART] ✅ Using cached data: ${cacheData.messageCount} messages`)
            setMessages(cacheData.messages)
            setLoadedCount(cacheData.messageCount)
            setIsLoading(false)
            
            if (cacheData.valid) {
              // Cache is fresh - just use it
              setLoadingStatus('Complete!')
              setNextRefreshTime(Date.now() + (CACHE_DURATION - cacheData.cacheAge))
              return
            } else {
              // Cache is stale - show it but revalidate in background
              console.log(`[RATE-CHART] 🔄 Cache stale, revalidating in background...`)
              setLoadingStatus('Updating in background...')
              
              // Also refresh BTC price when cache is stale
              if (fetchBitcoinPrice) {
                console.log(`[RATE-CHART] 💰 Cache stale, also refreshing BTC price...`)
                fetchBitcoinPrice(true)
              }
              // Don't return - continue to fetch fresh data
            }
          } else {
            console.log(`[RATE-CHART] ❌ Cache miss, fetching fresh data...`)
          }
        } else {
          console.log(`[RATE-CHART] 🔄 Force refresh - skipping cache`)
        }
        
        // Only show loading spinner if we don't have any data yet
        if (messages.length === 0) {
          setIsLoading(true)
        }
        setLoadingStatus('Loading chat messages from database...')
        
        // STEP 2: Fetch fresh messages from database
        console.log(`[RATE-CHART] 📥 Fetching messages from API for date: ${gameDate}`)
        const response = await fetch(`/Rate-Chart/api/messages?date=${gameDate}&_t=${Date.now()}`)
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
        
        // STEP 3: Save to cache
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
    
    // AUTO-REFRESH: Refresh every 5 minutes while page is open
    const refreshInterval = setInterval(async () => {
      console.log('[RATE-CHART] ⏰ Auto-refresh triggered (5 min interval)')
      
      // Set next refresh time (5 minutes from now)
      setNextRefreshTime(Date.now() + 5 * 60 * 1000)
      
      // Refresh all data: messages, leaderboard, and BTC price
      const refreshPromises = [fetchAllMessages(false)]
      
      if (fetchBitcoinPrice) {
        console.log('[RATE-CHART] 💰 Auto-refreshing BTC price...')
        refreshPromises.push(fetchBitcoinPrice(true))
      }
      
      // Also refresh leaderboard
      refreshPromises.push(fetchLeaderboard())
      
      await Promise.all(refreshPromises)
      console.log('[RATE-CHART] ✅ Auto-refresh complete!')
    }, 5 * 60 * 1000)
    
    return () => clearInterval(refreshInterval)
  }, [fetchBitcoinPrice])

  // Detect reset command from BigBangTheory
  const resetTimestamp = useMemo<Date | null>(() => {
    if (!isMounted) return null
    
    // Use simulated time for test mode
    const viennaTime = getSimulatedViennaTime()
    const currentHour = viennaTime.getHours()
    
    // Use test mode value if set, otherwise use real time check
    const isWinnersPeriod = isTestPastMidnight !== null ? isTestPastMidnight : (currentHour < 8)
    
    let gameDayStart: Date
    let gameDayEnd: Date
    
    if (isWinnersPeriod) {
      // Winners Period (00:00-08:00): Show YESTERDAY's complete game (00:00-23:59 yesterday)
      const yesterdayMidnight = new Date(viennaTime)
      yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1)
      yesterdayMidnight.setHours(0, 0, 0, 0)
      
      const midnightToday = new Date(viennaTime)
      midnightToday.setHours(0, 0, 0, 0)
      
      gameDayStart = yesterdayMidnight
      gameDayEnd = midnightToday
    } else {
      // Active game period (08:00-23:59): Show TODAY's complete game (00:00-23:59 today)
      // This includes early bird predictions from 00:00-08:00!
      const midnightToday = new Date(viennaTime)
      midnightToday.setHours(0, 0, 0, 0)
      
      const midnightTomorrow = new Date(viennaTime)
      midnightTomorrow.setDate(midnightTomorrow.getDate() + 1)
      midnightTomorrow.setHours(0, 0, 0, 0)
      
      gameDayStart = midnightToday
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
  }, [messages, isMounted, isTestPastMidnight, testMode])

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
    // Use simulated time for test mode
    const viennaTime = getSimulatedViennaTime()
    const currentHour = viennaTime.getHours()
    const currentMinute = viennaTime.getMinutes()
    
    // Use test mode value if set, otherwise use real time check
    const isWinnersPeriod = isTestPastMidnight !== null ? isTestPastMidnight : (currentHour < 8)
    
    console.log(`[RATE-CHART] ════════════════════════════════════════════`)
    console.log(`[RATE-CHART] 🕐 Current Vienna Time: ${viennaTime.toLocaleString('de-AT')}${testMode ? ' (SIMULATED)' : ''}`)
    console.log(`[RATE-CHART] 🕐 Current Hour: ${currentHour}, Minute: ${currentMinute}`)
    console.log(`[RATE-CHART] 📊 Total messages loaded: ${messages.length}`)
    
    let gameDayStart: Date
    let gameDayEnd: Date
    
    if (isWinnersPeriod) {
      // Winners Period (00:00-08:00): Show YESTERDAY's complete game (00:00-23:59 yesterday)
      const yesterdayMidnight = new Date(viennaTime)
      yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1)
      yesterdayMidnight.setHours(0, 0, 0, 0)
      
      const midnightToday = new Date(viennaTime)
      midnightToday.setHours(0, 0, 0, 0)
      
      gameDayStart = yesterdayMidnight
      gameDayEnd = midnightToday
      
      console.log(`[RATE-CHART] 🏆 WINNERS PERIOD MODE (00:00-08:00)`)
      console.log(`[RATE-CHART] 📅 Looking for YESTERDAY's complete game (00:00-23:59)`)
    } else {
      // Active game period (08:00-23:59): Show TODAY's complete game (00:00-23:59 today)
      // This includes early bird predictions from 00:00-08:00!
      const midnightToday = new Date(viennaTime)
      midnightToday.setHours(0, 0, 0, 0)
      
      const midnightTomorrow = new Date(viennaTime)
      midnightTomorrow.setDate(midnightTomorrow.getDate() + 1)
      midnightTomorrow.setHours(0, 0, 0, 0)
      
      gameDayStart = midnightToday
      gameDayEnd = midnightTomorrow
      
      console.log(`[RATE-CHART] 🎮 ACTIVE GAME MODE (08:00-23:59)`)
      console.log(`[RATE-CHART] 📅 Looking for TODAY's complete game (00:00-23:59, includes early birds!)`)
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
  }, [messages, resetTimestamp, isMounted, isTestPastMidnight, testMode])

  // Next round predictions (only during Winners Period)
  const nextRoundGuesses = useMemo(() => {
    if (!isMounted) return []
    
    const guesses: PriceGuess[] = []
    // Use simulated time for test mode
    const viennaTime = getSimulatedViennaTime()
    const currentHour = viennaTime.getHours()
    
    // Use test mode value if set, otherwise use real time check
    const isWinnersPeriod = isTestPastMidnight !== null ? isTestPastMidnight : (currentHour < 8)
    
    // Only show during Winners Period (00:00-08:00)
    if (!isWinnersPeriod) return []
    
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
  }, [messages, isMounted, isTestPastMidnight, testMode])

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
    // Use test mode value if set, otherwise use real time
    const isWinnersPeriod = isTestPastMidnight !== null ? isTestPastMidnight : (currentHour >= 0 && currentHour < 8)
    const referencePrice = isWinnersPeriod && midnightPrice !== null ? midnightPrice : currentBitcoinPrice
    
    console.log(`[RATE-CHART] 🏆 Leaderboard config:`)
    console.log(`[RATE-CHART]    Is Winners Period: ${isWinnersPeriod} (test mode: ${isTestPastMidnight})`)
    console.log(`[RATE-CHART]    Reference price: $${referencePrice}`)
    console.log(`[RATE-CHART]    Midnight price: ${midnightPrice !== null ? `$${midnightPrice}` : 'not loaded'}`)
    console.log(`[RATE-CHART]    Current BTC price: $${currentBitcoinPrice}`)
    console.log(`[RATE-CHART]    Unique participants: ${userMap.size}`)
    console.log(`[RATE-CHART]    Is Revealed: ${isRevealed}`)
    
    const sorted = Array.from(userMap.values()).sort((a, b) => {
      // If predictions are NOT revealed yet, sort by earliest timestamp (first come, first shown)
      if (!isRevealed) {
        return new Date(a.earliestTimestamp).getTime() - new Date(b.earliestTimestamp).getTime()
      }
      
      // If revealed, sort by closest to reference price
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
  }, [priceGuesses, currentBitcoinPrice, midnightPrice, isMounted, isTestPastMidnight, isRevealed])

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

  // Save winners to leaderboard during Winners Period (00:00-08:00 Vienna time)
  // This checks if yesterday's winners have been saved, and saves them if not
  useEffect(() => {
    const saveWinnersToLeaderboard = async () => {
      // Only save if we have winners and midnight price
      if (leaderboard.length < 1 || midnightPrice === null) return
      
      const now = new Date()
      
      // Use Intl.DateTimeFormat.formatToParts for reliable Vienna timezone handling
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Vienna',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false
      })
      
      const parts = formatter.formatToParts(now)
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || ''
      const currentHour = parseInt(getPart('hour'))
      
      // Only during Winners Period (00:00-08:00 Vienna time)
      if (currentHour >= 8) return
      
      // Get game date (yesterday during winners period)
      // Subtract 24 hours and format in Vienna timezone to get correct date
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const yesterdayParts = formatter.formatToParts(yesterday)
      const getYesterdayPart = (type: string) => yesterdayParts.find(p => p.type === type)?.value || ''
      const gameDate = `${getYesterdayPart('year')}-${getYesterdayPart('month')}-${getYesterdayPart('day')}`
      
      // Check if we already saved (use localStorage to prevent duplicate saves per session)
      const savedKey = `winners_saved_${gameDate}`
      if (localStorage.getItem(savedKey)) return
      
      // Check if results already exist on server (another user might have saved them)
      if (yesterdayResults && yesterdayResults.game_date === gameDate) {
        console.log(`[RATE-CHART] ✅ Winners for ${gameDate} already saved on server`)
        localStorage.setItem(savedKey, 'true')
        return
      }
      
      console.log(`[RATE-CHART] 🏆 Saving winners for ${gameDate} to leaderboard...`)
      
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
          const data = await response.json()
          if (data.existing) {
            console.log(`[RATE-CHART] ✅ Winners for ${gameDate} already exist on server`)
          } else {
            console.log(`[RATE-CHART] ✅ Winners for ${gameDate} saved to leaderboard!`)
          }
          localStorage.setItem(savedKey, 'true')
          // Refresh leaderboard to show updated results
          await fetchLeaderboard()
        } else {
          const errorData = await response.json()
          console.error('[RATE-CHART] Failed to save winners:', errorData.error)
        }
      } catch (error) {
        console.error('[RATE-CHART] Failed to save winners:', error)
      }
    }
    
    // Check every minute during Winners Period
    const interval = setInterval(saveWinnersToLeaderboard, 60000)
    // Also check immediately when data is available
    saveWinnersToLeaderboard()
    
    return () => clearInterval(interval)
  }, [leaderboard, midnightPrice, priceGuesses.length, yesterdayResults])

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
      <div className="min-h-screen bg-[#1a1a24] text-white font-mono">
        {/* Animated background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/10 via-transparent to-transparent" />
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
                <span>NEXT</span>
                <span className="tabular-nums text-zinc-400">{timeUntilRefresh}</span>
                
                {/* Refresh from DB button (no API call, just read database) */}
                <button
                  onClick={async () => {
                    if (!isRefreshing && fetchMessages) {
                      setIsRefreshing(true)
                      setLoadingStatus('Refreshing from database...')
                      try {
                        console.log('[RATE-CHART] 🔄 Refreshing from database...')
                        // Refresh messages, leaderboard, AND Bitcoin price
                        await Promise.all([
                          fetchMessages(true),
                          fetchLeaderboard(),
                          fetchBitcoinPrice ? fetchBitcoinPrice(true) : Promise.resolve()
                        ])
                        console.log('[RATE-CHART] ✅ Database refresh complete!')
                        // Reset next refresh time
                        setNextRefreshTime(Date.now() + 5 * 60 * 1000)
                      } catch (error) {
                        console.error('[RATE-CHART] ❌ Refresh failed:', error)
                        setLoadingStatus('Refresh failed!')
                      } finally {
                        setIsRefreshing(false)
                        setLoadingStatus('Complete!')
                      }
                    }
                  }}
                  disabled={isRefreshing}
                  className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
                  title="Refresh from database (messages + leaderboard + BTC price)"
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                
                {/* Trigger Cron Sync button (calls TradingView API) */}
                <button
                  onClick={async () => {
                    if (!isRefreshing) {
                      setIsRefreshing(true)
                      setLoadingStatus('⚡ Syncing from TradingView...')
                      try {
                        console.log('[RATE-CHART] ⚡ Triggering cron sync...')
                        const syncResponse = await fetch('/api/cron/sync-chat?trigger=manual', {
                          method: 'POST'
                        })
                        const syncData = await syncResponse.json()
                        console.log('[RATE-CHART] ✅ Cron sync result:', syncData)
                        
                        // Then reload messages, leaderboard, AND Bitcoin price from database
                        setLoadingStatus('Reloading from database...')
                        await Promise.all([
                          fetchMessages ? fetchMessages(true) : Promise.resolve(),
                          fetchLeaderboard(),
                          fetchBitcoinPrice ? fetchBitcoinPrice(true) : Promise.resolve()
                        ])
                        // Reset next refresh time
                        setNextRefreshTime(Date.now() + 5 * 60 * 1000)
                      } catch (error) {
                        console.error('[RATE-CHART] ❌ Cron sync failed:', error)
                        setLoadingStatus('Sync failed!')
                      } finally {
                        setIsRefreshing(false)
                        setLoadingStatus('Complete!')
                      }
                    }
                  }}
                  disabled={isRefreshing}
                  className="p-1.5 hover:bg-orange-500/20 hover:text-orange-400 rounded-md transition-colors disabled:opacity-50 border border-transparent hover:border-orange-500/30"
                  title="⚡ Trigger TradingView sync (like cron job)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
                
                {/* TEST MODE DROPDOWN - Only visible if server env allows */}
                {testModeEnabled && (
                <div className="relative ml-2">
                  <select
                    value={testMode || ''}
                    onChange={(e) => setTestMode(e.target.value || null)}
                    className={`appearance-none text-[10px] px-2 py-1 rounded-md border cursor-pointer transition-colors ${
                      testMode 
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' 
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {testModeOptions.map((option) => (
                      <option key={option.value || 'live'} value={option.value || ''}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {testMode && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  )}
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* TEST MODE BANNER - Only visible if server env allows */}
        {testModeEnabled && testMode && (
          <div className="bg-purple-500/20 border-b border-purple-500/30 px-4 py-2">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-purple-400 text-sm font-bold">🧪 TEST MODE</span>
                <span className="text-purple-300 text-sm">
                  Simulating: <strong>{testModeOptions.find(o => o.value === testMode)?.label}</strong>
                </span>
                <span className="text-purple-400/60 text-xs">
                  (Hour: {simulatedHour}:00 Vienna)
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className={`px-2 py-0.5 rounded ${isRevealed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400'}`}>
                  {isRevealed ? '👁️ REVEALED' : '🔒 HIDDEN'}
                </span>
                <span className={`px-2 py-0.5 rounded ${isPastMidnight ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700 text-zinc-400'}`}>
                  {isPastMidnight ? '🏆 WINNERS PERIOD' : '🎮 ACTIVE GAME'}
                </span>
                <button
                  onClick={() => setTestMode(null)}
                  className="text-purple-400 hover:text-purple-300 underline"
                >
                  Exit Test Mode
                </button>
              </div>
            </div>
          </div>
        )}

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
                <p className="text-zinc-500 text-sm max-w-lg">
                  Daily Bitcoin price predictions. Type in chat: <code className="px-1 py-0.5 bg-zinc-800 rounded text-orange-400 text-xs">//95k</code> <code className="px-1 py-0.5 bg-zinc-800 rounded text-orange-400 text-xs">//95.5k</code> <code className="px-1 py-0.5 bg-zinc-800 rounded text-orange-400 text-xs">//95000</code> <code className="px-1 py-0.5 bg-zinc-800 rounded text-orange-400 text-xs">//95,000</code> <code className="px-1 py-0.5 bg-zinc-800 rounded text-orange-400 text-xs">//95.000</code> <code className="px-1 py-0.5 bg-zinc-800 rounded text-orange-400 text-xs">//95</code> <code className="px-1 py-0.5 bg-zinc-800 rounded text-orange-400 text-xs">//95.5</code>
                </p>
              </div>

              {/* Current Price - Center */}
              <div className={`p-6 rounded-2xl border ${isPastMidnight ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-zinc-800/60 border-zinc-700'}`}>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-zinc-500 mb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {isPastMidnight ? 'Live Price' : '₿ Current Price'}
                  </div>
                  <div className="text-4xl md:text-5xl font-black text-emerald-400 tabular-nums">
                    ${currentBitcoinPrice.toLocaleString()}
                  </div>
                  {isPastMidnight && midnightPrice !== null && (
                    <div className="mt-3 pt-3 border-t border-emerald-500/20 text-center">
                      <div className="text-[10px] text-zinc-500">MIDNIGHT CLOSE</div>
                      <div className="text-lg font-bold text-amber-400">${midnightPrice.toLocaleString()}</div>
                    </div>
                  )}
                  <div className="text-xs text-zinc-600 mt-2">
                    <div>CoinGecko API</div>
                    {priceFetchTime && (
                      <div className="text-[10px] text-zinc-700 mt-0.5">
                        Updated: {format(priceFetchTime, 'HH:mm:ss')}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Countdown Timer + Stats */}
              <div className={`p-6 rounded-2xl border ${isPastMidnight ? 'bg-amber-500/5 border-amber-500/30' : 'bg-zinc-800/60 border-zinc-700'}`}>
                <div className="text-center">
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                    {isPastMidnight ? '👑 Winners Period' : '⏱️ Drawing at Midnight'}
                  </div>
                  <div className={`text-4xl md:text-5xl font-black tabular-nums ${isPastMidnight ? 'text-amber-400' : 'text-white'}`}>
                    {timeUntilMidnight}
                  </div>
                  <div className="text-xs text-zinc-600 mt-2">Vienna Time (CET)</div>
                  
                  {/* Stats integrated here */}
                  <div className="mt-4 pt-4 border-t border-zinc-700/50 grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <div className="text-2xl font-black text-blue-400 tabular-nums">{priceGuesses.length}</div>
                      <div className="text-[10px] text-zinc-500 uppercase">Predictions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-purple-400 tabular-nums">{leaderboard.length}</div>
                      <div className="text-[10px] text-zinc-500 uppercase">Participants</div>
                    </div>
                  </div>
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

          </div>

          {/* Winners Podium (shown after midnight) - ABOVE Final Results */}
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
                      <Avatar className="h-16 w-16 mx-auto mb-3 border-4 border-zinc-400/50 shadow-lg ring-2 ring-zinc-400/30">
                        <AvatarImage 
                          src={leaderboard[1].avatar} 
                          alt={leaderboard[1].username}
                          className="rounded-full object-cover"
                        />
                        <AvatarFallback className="bg-zinc-800 text-zinc-300 rounded-full">{leaderboard[1].username.slice(0, 2).toUpperCase()}</AvatarFallback>
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
                        <Avatar className="h-20 w-20 mx-auto mb-3 border-4 border-amber-500 shadow-lg ring-2 ring-amber-400/50">
                          <AvatarImage 
                            src={leaderboard[0].avatar} 
                            alt={leaderboard[0].username}
                            className="rounded-full object-cover"
                          />
                          <AvatarFallback className="bg-amber-900 text-amber-200 rounded-full">{leaderboard[0].username.slice(0, 2).toUpperCase()}</AvatarFallback>
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
                      <Avatar className="h-16 w-16 mx-auto mb-3 border-4 border-orange-700/50 shadow-lg ring-2 ring-orange-600/30">
                        <AvatarImage 
                          src={leaderboard[2].avatar} 
                          alt={leaderboard[2].username}
                          className="rounded-full object-cover"
                        />
                        <AvatarFallback className="bg-orange-900/50 text-orange-300 rounded-full">{leaderboard[2].username.slice(0, 2).toUpperCase()}</AvatarFallback>
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

          {/* Main Layout: Left Participants + Right Leaderboards */}
          <div className="mb-12 flex flex-col lg:flex-row gap-6">
            {/* LEFT SIDE - Participants List */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-black">
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
                    <div className="text-lg font-bold text-amber-400">${midnightPrice.toLocaleString()}</div>
                  </div>
                )}
              </div>

              {leaderboard.length === 0 ? (
                <div className="text-center py-16 text-zinc-500 bg-zinc-800/40 border border-zinc-700 rounded-2xl">
                  <div className="text-6xl mb-4">📊</div>
                  <div className="text-xl font-bold mb-2">No predictions yet</div>
                  <div className="text-sm">Use <code className="px-2 py-1 bg-zinc-800 rounded">//price</code> in chat to make a prediction</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((entry, index) => {
                    const priceDiff = getPriceDiff(entry.latestGuess)
                    const timeBonus = getTimeBonusLabel(entry.guesses[0]?.timeBonus || 0)
                    
                    return (
                      <div key={entry.username}>
                        <div
                          className={`group p-3 rounded-xl border transition-all ${
                            index === 0 && isRevealed ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/50' :
                            index === 1 && isRevealed ? 'bg-gradient-to-r from-zinc-400/10 to-transparent border-zinc-500/50' :
                            index === 2 && isRevealed ? 'bg-gradient-to-r from-orange-700/10 to-transparent border-orange-700/50' :
                            'bg-zinc-800/40 border-zinc-700 hover:border-zinc-600'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Rank */}
                            <div className="w-10 text-center flex-shrink-0">
                              {isRevealed ? (
                                <>
                                  {index === 0 && <div className="text-2xl">🥇</div>}
                                  {index === 1 && <div className="text-2xl">🥈</div>}
                                  {index === 2 && <div className="text-2xl">🥉</div>}
                                  {index > 2 && <div className="text-lg font-black text-zinc-600">#{index + 1}</div>}
                                </>
                              ) : (
                                <div className="text-xl">✅</div>
                              )}
                            </div>

                            {/* Avatar */}
                            <Avatar className="h-10 w-10 border-2 border-orange-500/30 shadow-sm ring-1 ring-orange-500/20 hover:border-orange-500/50 hover:ring-2 hover:ring-orange-500/30 transition-all duration-200">
                              <AvatarImage 
                                src={entry.avatar} 
                                alt={entry.username}
                                className="rounded-full object-cover"
                              />
                              <AvatarFallback className="bg-zinc-800 text-zinc-400 rounded-full text-sm">{entry.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <button
                                onClick={() => isRevealed && setSelectedUser(selectedUser === entry.username ? null : entry.username)}
                                className={`font-bold text-left text-sm ${isRevealed ? 'hover:text-orange-400 cursor-pointer' : ''}`}
                              >
                                {entry.username}
                                {isRevealed && entry.guessCount > 1 && (
                                  <span className="ml-2 text-xs text-orange-400 font-normal">
                                    ⚠️ {entry.guessCount - 1}x
                                  </span>
                                )}
                              </button>
                              <div className="flex items-center gap-2 text-xs text-zinc-500">
                                <span className="tabular-nums">{format(new Date(entry.earliestTimestamp), 'HH:mm:ss')}</span>
                                <span>•</span>
                                <span>{formatDistanceToNow(new Date(entry.earliestTimestamp), { addSuffix: true })}</span>
                                {isRevealed && (
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${timeBonus.bg} ${timeBonus.color}`}>
                                    {timeBonus.label}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Price */}
                            <div className="text-right">
                              {isRevealed ? (
                                <>
                                  <div className="text-xl font-black tabular-nums">{formatPrice(entry.latestGuess)}</div>
                                  <div className={`text-xs tabular-nums ${priceDiff.isClose ? 'text-emerald-400' : priceDiff.diff > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                    {priceDiff.isClose ? '🎯' : `${priceDiff.diff > 0 ? '+' : ''}${priceDiff.percentage}%`}
                                  </div>
                                </>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  <div className="text-xl font-bold text-zinc-600">🔒 ???</div>
                                  <div className="text-[10px] text-zinc-600">Reveal @ 23:00</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* History Dropdown */}
                        {isRevealed && entry.guesses.length > 1 && selectedUser === entry.username && (
                          <div className="mt-2 ml-12 mr-4 p-3 bg-orange-500/5 border border-orange-500/30 rounded-xl">
                            <h4 className="text-xs font-bold text-orange-400 mb-2">
                              📜 {entry.username}&apos;s History — {entry.guesses.length} predictions
                            </h4>
                            <div className="space-y-1.5">
                              {entry.guesses.map((guess, gIndex) => {
                                const guessDiff = getPriceDiff(guess.price)
                                const guessTimeBonus = getTimeBonusLabel(guess.timeBonus)
                                
                                return (
                                  <div
                                    key={`${guess.messageId}-${gIndex}`}
                                    className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                                      gIndex === 0 
                                        ? 'bg-emerald-500/10 border border-emerald-500/30' 
                                        : 'bg-zinc-800/60 border border-zinc-700 opacity-60'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`text-[10px] font-bold ${gIndex === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {gIndex === 0 ? '✅' : '❌'}
                                      </div>
                                      <div>
                                        <div className="font-bold tabular-nums">{formatPrice(guess.price)}</div>
                                        <div className="text-[10px] text-zinc-500">
                                          {formatTimestamp(guess.timestamp).exact}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${guessTimeBonus.bg} ${guessTimeBonus.color}`}>
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

            {/* RIGHT SIDEBAR - All-Time Leaders & Yesterday */}
            <div className="lg:w-72 flex-shrink-0 space-y-4">
              {/* All-Time Leaderboard Widget */}
              <div className="p-4 bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20 rounded-2xl">
                <button 
                  onClick={() => setIsAllTimeExpanded(!isAllTimeExpanded)}
                  className="w-full flex items-center justify-between mb-3 hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏆</span>
                    <div className="text-xs uppercase tracking-widest text-amber-400 font-bold">All-Time Leaders</div>
                    {allTimeLeaderboard.length > 0 && (
                      <div className="text-[10px] text-zinc-500">
                        ({allTimeLeaderboard.length} players)
                      </div>
                    )}
                  </div>
                  <span className="text-zinc-500 text-sm">{isAllTimeExpanded ? '▼' : '▶'}</span>
                </button>
                
                {isLeaderboardLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                  </div>
                ) : allTimeLeaderboard.length > 0 ? (
                  <div className="space-y-2">
                    {allTimeLeaderboard.slice(0, allTimeLimit).map((entry, index) => {
                      const currentLeaderboardEntry = leaderboard.find(l => l.username === entry.username)
                      const avatarUrl = entry.avatar || currentLeaderboardEntry?.avatar
                      
                      return (
                        <div 
                          key={entry.username}
                          className={`flex items-center gap-2 p-2 rounded-lg ${
                            index === 0 ? 'bg-amber-500/10 border border-amber-500/30' :
                            index === 1 ? 'bg-zinc-500/10 border border-zinc-500/30' :
                            index === 2 ? 'bg-orange-900/10 border border-orange-900/30' :
                            'bg-zinc-800/50 border border-zinc-700/50'
                          }`}
                        >
                          <span className="text-base w-6 text-center">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                          </span>
                          <Avatar className={`h-6 w-6 border-2 shadow-sm ring-1 ${
                            index === 0 ? 'border-amber-500/50 ring-amber-500/30' :
                            index === 1 ? 'border-zinc-400/50 ring-zinc-400/30' :
                            index === 2 ? 'border-orange-700/50 ring-orange-700/30' :
                            'border-zinc-600/50 ring-zinc-600/30'
                          }`}>
                            <AvatarImage 
                              src={avatarUrl || undefined} 
                              alt={entry.username}
                              className="rounded-full object-cover"
                            />
                            <AvatarFallback className={`text-[10px] rounded-full ${
                              index === 0 ? 'bg-amber-900/50 text-amber-200' :
                              index === 1 ? 'bg-zinc-600 text-zinc-200' :
                              index === 2 ? 'bg-orange-900/50 text-orange-200' :
                              'bg-zinc-700 text-zinc-300'
                            }`}>
                              {entry.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{entry.username}</div>
                            <div className="text-[10px] text-zinc-500">
                              {entry.first_place_count}🥇 {entry.second_place_count}🥈 {entry.third_place_count}🥉
                            </div>
                          </div>
                          <div className={`flex items-center justify-center min-w-8 h-8 px-2 rounded-full text-xs font-bold ${
                            index === 0 ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50' : 
                            index === 1 ? 'bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-500/50' : 
                            index === 2 ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/50' :
                            'bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600/50'
                          }`}>
                            {entry.total_points % 1 === 0 ? entry.total_points : entry.total_points.toFixed(1)}
                          </div>
                        </div>
                      )
                    })}
                    
                    {/* Load All Button */}
                    {allTimeLeaderboard.length >= allTimeLimit && (
                      <button
                        onClick={loadMoreAllTime}
                        disabled={isLoadingMoreAllTime}
                        className="w-full py-2 text-center text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isLoadingMoreAllTime ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-3 h-3 border border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                            Loading...
                          </span>
                        ) : (
                          <span>📊 Show all players...</span>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <div className="text-zinc-500 text-xs">No results yet</div>
                    <div className="text-zinc-600 text-[10px] mt-1">First game ends tomorrow 08:00</div>
                    
                    {isPastMidnight && leaderboard.length >= 1 && midnightPrice !== null && (
                      <button
                        onClick={async () => {
                          const now = new Date()
                          
                          // Use Intl.DateTimeFormat.formatToParts for reliable Vienna timezone handling
                          const formatter = new Intl.DateTimeFormat('en-US', {
                            timeZone: 'Europe/Vienna',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })
                          
                          // Get yesterday's Vienna date
                          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
                          const yesterdayParts = formatter.formatToParts(yesterday)
                          const getYesterdayPart = (type: string) => yesterdayParts.find(p => p.type === type)?.value || ''
                          const gameDate = `${getYesterdayPart('year')}-${getYesterdayPart('month')}-${getYesterdayPart('day')}`
                          
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

              {/* Yesterday's Winners Widget */}
              <div className="p-4 bg-gradient-to-br from-purple-500/5 to-pink-500/5 border border-purple-500/20 rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📅</span>
                    <div className="text-xs uppercase tracking-widest text-purple-400 font-bold">Yesterday</div>
                    {(yesterdayResults?.total_participants || leaderboard.length) > 0 && (
                      <div className="text-[10px] text-zinc-500">
                        ({yesterdayResults?.total_participants || leaderboard.length} players)
                      </div>
                    )}
                  </div>
                </div>
                
                {isLeaderboardLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                  </div>
                ) : (yesterdayResults || leaderboard.length > 0) ? (
                  <div className="space-y-2">
                    {/* Show all participants from leaderboard (which is calculated from DB messages) */}
                    {leaderboard.slice(0, yesterdayShowCount).map((entry, index) => {
                      // Calculate points with time bonus for all participants
                      const timeBonus = entry.guesses[0]?.timeBonus || 0
                      let basePoints = 0
                      if (index === 0) basePoints = 3
                      else if (index === 1) basePoints = 2
                      else if (index === 2) basePoints = 1
                      // No points for #4 and below
                      
                      // Use saved points for top 3 if available, otherwise calculate
                      let pts = basePoints * (1 + timeBonus)
                      if (index === 0 && yesterdayResults?.winner_total_points) pts = yesterdayResults.winner_total_points
                      else if (index === 1 && yesterdayResults?.second_total_points) pts = yesterdayResults.second_total_points
                      else if (index === 2 && yesterdayResults?.third_total_points) pts = yesterdayResults.third_total_points
                      
                      return (
                        <div 
                          key={entry.username}
                          className={`flex items-center gap-2 p-2 rounded-lg ${
                            index === 0 ? 'bg-amber-500/10 border border-amber-500/30' :
                            index === 1 ? 'bg-zinc-500/10 border border-zinc-500/30' :
                            index === 2 ? 'bg-orange-900/10 border border-orange-900/30' :
                            'bg-zinc-800/50 border border-zinc-700/50'
                          }`}
                        >
                          <span className="text-base w-6 text-center">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                          </span>
                          <Avatar className={`h-6 w-6 border-2 shadow-sm ring-1 ${
                            index === 0 ? 'border-amber-500/50 ring-amber-500/30' :
                            index === 1 ? 'border-zinc-400/50 ring-zinc-400/30' :
                            index === 2 ? 'border-orange-700/50 ring-orange-700/30' :
                            'border-zinc-600/50 ring-zinc-600/30'
                          }`}>
                            <AvatarImage 
                              src={entry.avatar || undefined} 
                              alt={entry.username}
                              className="rounded-full object-cover"
                            />
                            <AvatarFallback className={`text-[10px] rounded-full ${
                              index === 0 ? 'bg-amber-900/50 text-amber-200' :
                              index === 1 ? 'bg-zinc-600 text-zinc-200' :
                              index === 2 ? 'bg-orange-900/50 text-orange-200' :
                              'bg-zinc-700 text-zinc-300'
                            }`}>
                              {entry.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{entry.username}</div>
                            <div className="text-[10px] text-zinc-500">
                              ${entry.latestGuess?.toLocaleString()} • {format(new Date(entry.earliestTimestamp), 'HH:mm:ss')}
                            </div>
                          </div>
                          {/* Points badge for everyone */}
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                            index === 0 ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50' : 
                            index === 1 ? 'bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-500/50' : 
                            index === 2 ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/50' :
                            'bg-zinc-800/50 text-zinc-500 ring-1 ring-zinc-700/50'
                          }`}>
                            {pts > 0 ? `+${pts % 1 === 0 ? pts : pts.toFixed(1)}` : '0'}
                          </div>
                        </div>
                      )
                    })}
                    
                    {/* Show All / Show Less buttons */}
                    {leaderboard.length > 10 && (
                      <button
                        onClick={() => setYesterdayShowCount(
                          yesterdayShowCount <= 10 ? leaderboard.length : 10
                        )}
                        className="w-full py-2 text-center text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                      >
                        {yesterdayShowCount <= 10 ? (
                          <span>📊 Show all {leaderboard.length} participants...</span>
                        ) : (
                          <span>▲ Show top 10</span>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="text-zinc-500 text-xs">No results yet</div>
                    <div className="text-zinc-600 text-[10px] mt-1">Results saved at 08:00</div>
                  </div>
                )}
                
                <div className="mt-3 pt-3 border-t border-purple-500/10 text-center">
                  <div className="text-[10px] text-zinc-600">
                    {yesterdayResults ? `$${yesterdayResults.midnight_price?.toLocaleString()} close` : 'Midnight close price'}
                  </div>
                  
                  {/* Fix Results Button - Only show during Winners Period if there's a mismatch */}
                  {isPastMidnight && yesterdayResults && leaderboard.length >= 1 && midnightPrice !== null && 
                   yesterdayResults.winner_username !== leaderboard[0]?.username && (
                    <button
                      onClick={async () => {
                        const confirmDelete = confirm(
                          `⚠️ The saved winner (${yesterdayResults.winner_username}) doesn't match the calculated winner (${leaderboard[0]?.username}).\n\n` +
                          `This happens when results were saved with incorrect data.\n\n` +
                          `Delete the incorrect record and save the correct winners?`
                        )
                        
                        if (!confirmDelete) return
                        
                        try {
                          // Delete the incorrect record
                          const deleteResponse = await fetch(`/Rate-Chart/api/leaderboard?date=${yesterdayResults.game_date}`, {
                            method: 'DELETE'
                          })
                          
                          if (!deleteResponse.ok) {
                            const err = await deleteResponse.json()
                            alert('Failed to delete: ' + (err.error || 'Unknown error'))
                            return
                          }
                          
                          // Clear localStorage to allow re-save
                          localStorage.removeItem(`winners_saved_${yesterdayResults.game_date}`)
                          
                          // Now save the correct results
                          const now = new Date()
                          const formatter = new Intl.DateTimeFormat('en-US', {
                            timeZone: 'Europe/Vienna',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })
                          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
                          const yesterdayParts = formatter.formatToParts(yesterday)
                          const getYesterdayPart = (type: string) => yesterdayParts.find(p => p.type === type)?.value || ''
                          const gameDate = `${getYesterdayPart('year')}-${getYesterdayPart('month')}-${getYesterdayPart('day')}`
                          
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
                          
                          const saveResponse = await fetch('/Rate-Chart/api/leaderboard', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(result)
                          })
                          
                          if (saveResponse.ok) {
                            alert('✅ Fixed! Correct winners saved. Refreshing...')
                            localStorage.setItem(`winners_saved_${gameDate}`, 'true')
                            window.location.reload()
                          } else {
                            const err = await saveResponse.json()
                            alert('Failed to save: ' + (err.error || 'Unknown error'))
                          }
                        } catch (error) {
                          alert('Error: ' + error)
                        }
                      }}
                      className="mt-2 px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-[10px] hover:bg-red-500/30 transition-colors"
                    >
                      ⚠️ Fix Results (Wrong Winner Saved)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

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
                  <div key={entry.username} className="flex items-center gap-4 p-4 bg-zinc-800/60 border border-zinc-700 rounded-xl">
                    <Avatar className="h-10 w-10 border-2 border-blue-500/30 shadow-sm ring-1 ring-blue-500/20">
                      <AvatarImage 
                        src={entry.avatar} 
                        alt={entry.username}
                        className="rounded-full object-cover"
                      />
                      <AvatarFallback className="bg-zinc-800 rounded-full">{entry.username.slice(0, 2).toUpperCase()}</AvatarFallback>
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

          {/* All Predictions (Collapsible) */}
          {isRevealed && allGuessesSorted.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none">
                <div className="p-4 bg-zinc-800/40 border border-zinc-700 rounded-2xl hover:border-zinc-600 transition-colors flex items-center justify-between">
                  <div className="font-bold">All Predictions (Sorted by Price)</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-500">{allGuessesSorted.length} predictions</span>
                    <svg className="w-5 h-5 text-zinc-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </summary>
              <div className="mt-4 p-4 bg-zinc-800/40 border border-zinc-700 rounded-2xl">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {allGuessesSorted.map((guess, index) => {
                    const timeBonus = getTimeBonusLabel(guess.timeBonus)
                    
                    return (
                      <div
                        key={`${guess.messageId}-${index}`}
                        className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border-2 border-blue-500/30 shadow-sm ring-1 ring-blue-500/20">
                            <AvatarImage 
                              src={guess.avatar} 
                              alt={guess.username}
                              className="rounded-full object-cover"
                            />
                            <AvatarFallback className="bg-zinc-700 text-xs rounded-full">{guess.username.slice(0, 2).toUpperCase()}</AvatarFallback>
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
          <div className="mt-12 p-6 bg-zinc-800/40 border border-zinc-700 rounded-2xl">
            <h3 className="text-lg font-bold mb-6 text-orange-400">📖 How It Works</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - Rules */}
              <div className="space-y-4 text-sm">
                <div>
                  <div className="font-bold mb-1 text-white">⏰ Timeframe</div>
                  <div className="text-zinc-400">
                    Daily from <strong className="text-white">00:00 to 23:00</strong> Vienna time. <span className="text-red-400">After 23:00 = no predictions!</span>
                  </div>
                </div>
                <div>
                  <div className="font-bold mb-1 text-white">🏆 Winner</div>
                  <div className="text-zinc-400">
                    Closest to the <strong className="text-white">midnight price</strong> wins! Only your <strong className="text-white">latest</strong> prediction counts.
                  </div>
                </div>
                <div>
                  <div className="font-bold mb-1 text-white">🔒 Hidden Bets</div>
                  <div className="text-zinc-400">
                    Prices are <strong className="text-white">hidden until 23:00!</strong> No sniping — revealed only then.
                  </div>
                </div>
                <div>
                  <div className="font-bold mb-1 text-white">🎯 Rounding</div>
                  <div className="text-zinc-400">
                    Prices rounded to <strong className="text-white">$100</strong>. You can predict multiple times — only your <strong className="text-white">latest</strong> counts!
                  </div>
                </div>
              </div>
              
              {/* Right Column - Time Bonus */}
              <div>
                <div className="font-bold mb-3 text-white">⏱️ Time Bonus — Earlier = More Points!</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌅</span>
                      <span className="text-sm text-emerald-400 font-medium">Early Bird</span>
                    </div>
                    <div className="text-xs text-zinc-400">00:00 - 08:00</div>
                    <span className="text-sm font-bold text-emerald-400">+100%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">☀️</span>
                      <span className="text-sm text-amber-400 font-medium">Morning</span>
                    </div>
                    <div className="text-xs text-zinc-400">08:00 - 12:00</div>
                    <span className="text-sm font-bold text-amber-400">+50%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌤️</span>
                      <span className="text-sm text-orange-400 font-medium">Afternoon</span>
                    </div>
                    <div className="text-xs text-zinc-400">12:00 - 18:00</div>
                    <span className="text-sm font-bold text-orange-400">+25%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌙</span>
                      <span className="text-sm text-red-400 font-medium">Evening</span>
                    </div>
                    <div className="text-xs text-zinc-400">18:00 - 23:00</div>
                    <span className="text-sm font-bold text-red-400">+0%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🚫</span>
                      <span className="text-sm text-zinc-400 font-medium">Closed</span>
                    </div>
                    <div className="text-xs text-zinc-500">23:00 - 00:00</div>
                    <span className="text-sm font-bold text-zinc-500">—</span>
                  </div>
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
