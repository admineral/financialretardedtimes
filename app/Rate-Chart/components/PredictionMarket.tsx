'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { format, formatDistanceToNow } from 'date-fns'

interface LeaderboardEntry {
  username: string
  avatar?: string
  guesses: { price: number; timestamp: string; timeBonus: number }[]
  latestGuess: number
  earliestTimestamp: string
  guessCount: number
}

interface MarketPool {
  target_username: string
  target_avatar?: string
  total_pool_amount: number
  total_bets_count: number
  current_odds: number
  implied_probability: number
  latest_prediction?: number
  is_resolved: boolean
  final_position?: number
}

interface UserCredits {
  user_identifier: string
  display_name?: string
  total_credits: number
  available_credits: number
  total_bets_placed: number
  total_bets_won: number
  total_credits_won: number
  total_credits_lost: number
  best_win: number
  current_streak: number
  best_streak: number
}

interface UserBet {
  id: string
  target_username: string
  bet_type: string
  bet_amount: number
  odds: number
  potential_payout: number
  status: string
}

interface PredictionMarketProps {
  leaderboard: LeaderboardEntry[]
  currentBitcoinPrice: number
  midnightPrice: number | null
  gameDate: string
  isRevealed: boolean
  isPastMidnight: boolean
  onClose: () => void
}

// Generate unique user ID for localStorage
function getUserId(): string {
  if (typeof window === 'undefined') return 'server'
  
  let id = localStorage.getItem('market_user_id')
  if (!id) {
    id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('market_user_id', id)
  }
  return id
}

export default function PredictionMarket({
  leaderboard,
  currentBitcoinPrice,
  midnightPrice,
  gameDate,
  isRevealed,
  isPastMidnight,
  onClose
}: PredictionMarketProps) {
  const [userId, setUserId] = useState<string>('')
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null)
  const [userBets, setUserBets] = useState<UserBet[]>([])
  const [marketPools, setMarketPools] = useState<MarketPool[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState<number>(10)
  const [betType, setBetType] = useState<'win' | 'top3'>('win')
  const [isPlacingBet, setIsPlacingBet] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [topBettors, setTopBettors] = useState<{ user_identifier: string; display_name?: string; total_credits: number; total_bets_won?: number; best_streak?: number }[]>([])
  
  // Dropdown state
  const [showDropdown, setShowDropdown] = useState(false)
  const [transactions, setTransactions] = useState<{ id: string; transaction_type: string; amount: number; balance_after: number; description?: string; created_at: string }[]>([])
  const [editingNickname, setEditingNickname] = useState(false)
  const [newNickname, setNewNickname] = useState('')

  // Initialize user ID on mount
  useEffect(() => {
    setUserId(getUserId())
  }, [])

  // Repair transaction history for existing users
  useEffect(() => {
    if (!userId) return
    
    const txns = localStorage.getItem('market_transactions')
    const credits = localStorage.getItem('market_credits')
    
    // If no transactions but we have credits, create initial transaction
    if (!txns && credits) {
      try {
        const parsed = JSON.parse(credits)
        const repairTxns = [{
          id: `repair_${Date.now()}`,
          transaction_type: 'initial_credits',
          amount: 1000,
          balance_after: parsed.available || 1000,
          description: 'Welcome bonus! 🎉',
          created_at: new Date(parsed.timestamp || Date.now()).toISOString()
        }]
        
        // Check for any existing bets and add them to history
        const allBetKeys = Object.keys(localStorage).filter(k => k.startsWith('market_bets_'))
        allBetKeys.forEach(key => {
          try {
            const bets = JSON.parse(localStorage.getItem(key) || '[]')
            bets.forEach((bet: UserBet) => {
              repairTxns.push({
                id: `repair_bet_${bet.id}`,
                transaction_type: 'bet_placed',
                amount: -bet.bet_amount,
                balance_after: 0, // Unknown
                description: `Bet on ${bet.target_username} to ${bet.bet_type}`,
                created_at: new Date().toISOString()
              })
            })
          } catch {}
        })
        
        localStorage.setItem('market_transactions', JSON.stringify(repairTxns))
        setTransactions(repairTxns)
        console.log('[MARKET] Repaired transaction history')
      } catch {}
    }
  }, [userId])

  // Generate a local nickname
  const generateLocalNickname = () => {
    const adjectives = ['Lucky', 'Swift', 'Bold', 'Crypto', 'Diamond', 'Golden', 'Mighty', 'Epic']
    const nouns = ['Trader', 'Whale', 'Bull', 'Wolf', 'Dragon', 'Hodler', 'Degen', 'Legend']
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const num = Math.floor(Math.random() * 100)
    return `${adj}${noun}${num}`
  }

  // Load from localStorage fallback
  const loadFromLocalStorage = useCallback(() => {
    // Load credits
    const cachedCredits = localStorage.getItem('market_credits')
    if (cachedCredits) {
      try {
        const parsed = JSON.parse(cachedCredits)
        setUserCredits({
          user_identifier: userId,
          display_name: parsed.display_name || generateLocalNickname(),
          available_credits: parsed.available ?? 1000,
          total_credits: parsed.total ?? 1000,
          total_bets_placed: parsed.total_bets_placed ?? 0,
          total_bets_won: parsed.total_bets_won ?? 0,
          total_credits_won: parsed.total_credits_won ?? 0,
          total_credits_lost: parsed.total_credits_lost ?? 0,
          best_win: parsed.best_win ?? 0,
          current_streak: parsed.current_streak ?? 0,
          best_streak: parsed.best_streak ?? 0
        })
      } catch {
        initializeLocalCredits()
      }
    } else {
      initializeLocalCredits()
    }
    
    // Load bets for this game date
    const cachedBets = localStorage.getItem(`market_bets_${gameDate}`)
    if (cachedBets) {
      try {
        setUserBets(JSON.parse(cachedBets))
      } catch {
        setUserBets([])
      }
    }
    
    // Load top bettors (just current user for now)
    const allBettors = localStorage.getItem('market_all_bettors')
    if (allBettors) {
      try {
        setTopBettors(JSON.parse(allBettors))
      } catch {
        setTopBettors([])
      }
    }
  }, [userId, gameDate])

  // Initialize local credits for new users
  const initializeLocalCredits = () => {
    const nickname = generateLocalNickname()
    const newCredits: UserCredits = {
      user_identifier: userId,
      display_name: nickname,
      available_credits: 1000,
      total_credits: 1000,
      total_bets_placed: 0,
      total_bets_won: 0,
      total_credits_won: 0,
      total_credits_lost: 0,
      best_win: 0,
      current_streak: 0,
      best_streak: 0
    }
    setUserCredits(newCredits)
    localStorage.setItem('market_credits', JSON.stringify({
      available: 1000,
      total: 1000,
      display_name: nickname,
      total_bets_placed: 0,
      total_bets_won: 0,
      best_win: 0,
      timestamp: Date.now()
    }))
    
    // Add welcome transaction
    const welcomeTxn = {
      id: `welcome_${Date.now()}`,
      transaction_type: 'initial_credits',
      amount: 1000,
      balance_after: 1000,
      description: 'Welcome bonus! Start betting 🎉',
      created_at: new Date().toISOString()
    }
    localStorage.setItem('market_transactions', JSON.stringify([welcomeTxn]))
    setTransactions([welcomeTxn])
    
    // Add to top bettors
    const bettors = [{ user_identifier: userId, display_name: nickname, total_credits: 1000 }]
    localStorage.setItem('market_all_bettors', JSON.stringify(bettors))
    setTopBettors(bettors)
  }

  // Fetch market data
  const fetchMarketData = useCallback(async () => {
    if (!userId || !gameDate) return
    
    try {
      // Fetch market data
      const response = await fetch(`/Rate-Chart/api/market?date=${gameDate}&userId=${userId}`)
      const data = await response.json()
      
      if (response.ok) {
        if (data.userCredits) {
          setUserCredits(data.userCredits)
          // Sync credits to localStorage
          localStorage.setItem('market_credits', JSON.stringify({
            available: data.userCredits.available_credits,
            total: data.userCredits.total_credits,
            display_name: data.userCredits.display_name,
            total_bets_placed: data.userCredits.total_bets_placed,
            total_bets_won: data.userCredits.total_bets_won,
            best_win: data.userCredits.best_win,
            timestamp: Date.now()
          }))
        }
        if (data.userBets) setUserBets(data.userBets)
        if (data.pools) setMarketPools(data.pools)
        if (data.topBettors) setTopBettors(data.topBettors)
        
        // Also fetch transaction history from credits API
        try {
          const creditsRes = await fetch(`/Rate-Chart/api/market/credits?userId=${userId}&history=true&historyLimit=20`)
          const creditsData = await creditsRes.json()
          if (creditsRes.ok && creditsData.history) {
            setTransactions(creditsData.history)
            localStorage.setItem('market_transactions', JSON.stringify(creditsData.history.slice(0, 50)))
          }
        } catch {
          // Ignore - transactions will load from localStorage
        }
      } else {
        // API error - fall back to localStorage
        console.warn('[MARKET] API error, using localStorage fallback')
        loadFromLocalStorage()
      }
    } catch (err) {
      console.error('[MARKET] Failed to fetch data:', err)
      loadFromLocalStorage()
    } finally {
      setIsLoading(false)
    }
  }, [userId, gameDate, loadFromLocalStorage])

  useEffect(() => {
    fetchMarketData()
    // Refresh every 30 seconds
    const interval = setInterval(fetchMarketData, 30000)
    return () => clearInterval(interval)
  }, [fetchMarketData])

  // Calculate dynamic odds based on leaderboard and pools
  const calculateDynamicOdds = (username: string): number => {
    const pool = marketPools.find(p => p.target_username === username)
    if (pool && pool.current_odds > 0) return pool.current_odds
    
    // Default odds based on position in leaderboard
    const position = leaderboard.findIndex(e => e.username === username)
    if (position === -1) return 10
    
    // Better positions = lower odds (more likely to win)
    const baseOdds = 1.5 + (position * 0.5)
    return Math.min(baseOdds, 20)
  }

  // Place bet handler
  const handlePlaceBet = async (targetUsername: string, targetAvatar?: string, latestPrediction?: number, predictionTimestamp?: string) => {
    if (!userId || !userCredits || isPlacingBet) return
    
    if (betAmount > userCredits.available_credits) {
      setError('Insufficient credits')
      return
    }
    
    if (betAmount < 1) {
      setError('Minimum bet is 1 credit')
      return
    }
    
    setIsPlacingBet(true)
    setError(null)
    
    try {
      const response = await fetch('/Rate-Chart/api/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          gameDate,
          targetUsername,
          targetAvatar,
          betType,
          betAmount,
          latestPrediction,
          predictionTimestamp
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        // API failed - try localStorage betting
        console.warn('[MARKET] API bet failed, using localStorage')
        placeBetLocally(targetUsername, targetAvatar, latestPrediction)
        return
      }
      
      // Update local state
      if (data.userCredits) setUserCredits(data.userCredits)
      if (data.bet) setUserBets(prev => [...prev, data.bet])
      
      setSelectedTarget(null)
      setBetAmount(10)
      
      // Refresh market data
      fetchMarketData()
      
    } catch (err) {
      console.error('[MARKET] Error placing bet:', err)
      // Fall back to localStorage
      placeBetLocally(targetUsername, targetAvatar, latestPrediction)
    } finally {
      setIsPlacingBet(false)
    }
  }

  // Place bet locally when API unavailable
  const placeBetLocally = (targetUsername: string, targetAvatar?: string, latestPrediction?: number) => {
    if (!userCredits) return
    
    // Check for existing bet
    const existingBet = userBets.find(b => b.target_username === targetUsername && b.bet_type === betType)
    if (existingBet) {
      setError(`You already have a ${betType} bet on ${targetUsername}`)
      return
    }
    
    // Calculate odds based on position
    const position = leaderboard.findIndex(e => e.username === targetUsername)
    const odds = Math.max(1.5, Math.min(10, 1.5 + position * 0.5))
    const potentialPayout = Math.round(betAmount * odds * 100) / 100
    
    // Create new bet
    const newBet: UserBet = {
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      target_username: targetUsername,
      bet_type: betType,
      bet_amount: betAmount,
      odds,
      potential_payout: potentialPayout,
      status: 'active'
    }
    
    // Update credits
    const newAvailable = userCredits.available_credits - betAmount
    const updatedCredits: UserCredits = {
      ...userCredits,
      available_credits: newAvailable,
      total_bets_placed: userCredits.total_bets_placed + 1
    }
    
    // Save to state
    setUserCredits(updatedCredits)
    setUserBets(prev => [...prev, newBet])
    
    // Save to localStorage
    localStorage.setItem('market_credits', JSON.stringify({
      available: newAvailable,
      total: updatedCredits.total_credits,
      display_name: updatedCredits.display_name,
      total_bets_placed: updatedCredits.total_bets_placed,
      timestamp: Date.now()
    }))
    
    // Save bets to localStorage
    const allBets = [...userBets, newBet]
    localStorage.setItem(`market_bets_${gameDate}`, JSON.stringify(allBets))
    
    // Update top bettors
    const bettors = JSON.parse(localStorage.getItem('market_all_bettors') || '[]')
    const myIndex = bettors.findIndex((b: { user_identifier: string }) => b.user_identifier === userId)
    if (myIndex >= 0) {
      bettors[myIndex].total_credits = updatedCredits.total_credits
    } else {
      bettors.push({
        user_identifier: userId,
        display_name: updatedCredits.display_name,
        total_credits: updatedCredits.total_credits
      })
    }
    localStorage.setItem('market_all_bettors', JSON.stringify(bettors))
    setTopBettors(bettors.sort((a: { total_credits: number }, b: { total_credits: number }) => b.total_credits - a.total_credits))
    
    // Record transaction
    const txns = JSON.parse(localStorage.getItem('market_transactions') || '[]')
    txns.unshift({
      id: newBet.id,
      transaction_type: 'bet_placed',
      amount: -betAmount,
      balance_after: newAvailable,
      description: `Bet on ${targetUsername} to ${betType}`,
      created_at: new Date().toISOString()
    })
    localStorage.setItem('market_transactions', JSON.stringify(txns.slice(0, 50)))
    setTransactions(txns.slice(0, 20))
    
    setSelectedTarget(null)
    setBetAmount(10)
    setError(null)
    
    console.log(`[MARKET] ✅ Bet placed locally: ${betAmount} on ${targetUsername} @ ${odds}x`)
  }

  // Claim daily bonus
  const handleClaimBonus = async () => {
    if (!userId) return
    
    try {
      const response = await fetch('/Rate-Chart/api/market/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'daily_bonus' })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        fetchMarketData()
        // Add to local transactions
        const txns = JSON.parse(localStorage.getItem('market_transactions') || '[]')
        txns.unshift({
          id: `bonus_${Date.now()}`,
          transaction_type: 'daily_bonus',
          amount: 100,
          balance_after: (userCredits?.available_credits || 0) + 100,
          description: 'Daily bonus claimed',
          created_at: new Date().toISOString()
        })
        localStorage.setItem('market_transactions', JSON.stringify(txns.slice(0, 50)))
        setTransactions(txns.slice(0, 20))
      } else if (data.alreadyClaimed) {
        setError('Daily bonus already claimed!')
      }
    } catch (err) {
      console.error('[MARKET] Error claiming bonus:', err)
    }
  }

  // Load transactions from localStorage
  const loadTransactions = useCallback(() => {
    const txns = localStorage.getItem('market_transactions')
    if (txns) {
      try {
        const parsed = JSON.parse(txns)
        setTransactions(Array.isArray(parsed) ? parsed.slice(0, 20) : [])
      } catch {
        setTransactions([])
      }
    }
  }, [])

  // Load transactions on initial mount
  useEffect(() => {
    if (userId) {
      loadTransactions()
    }
  }, [userId, loadTransactions])

  // Update nickname
  const handleUpdateNickname = useCallback(() => {
    if (!newNickname.trim() || newNickname.length < 2 || newNickname.length > 20) {
      setError('Nickname must be 2-20 characters')
      return
    }
    
    // Update in state
    if (userCredits) {
      setUserCredits({
        ...userCredits,
        display_name: newNickname.trim()
      })
    }
    
    // Update in localStorage
    const cached = JSON.parse(localStorage.getItem('market_credits') || '{}')
    cached.display_name = newNickname.trim()
    localStorage.setItem('market_credits', JSON.stringify(cached))
    
    // Update in top bettors
    const bettors = JSON.parse(localStorage.getItem('market_all_bettors') || '[]')
    const myIndex = bettors.findIndex((b: { user_identifier: string }) => b.user_identifier === userId)
    if (myIndex >= 0) {
      bettors[myIndex].display_name = newNickname.trim()
      localStorage.setItem('market_all_bettors', JSON.stringify(bettors))
      setTopBettors(bettors)
    }
    
    setEditingNickname(false)
    setNewNickname('')
  }, [newNickname, userCredits, userId])

  // Load transactions when dropdown opens
  useEffect(() => {
    if (showDropdown) {
      loadTransactions()
    }
  }, [showDropdown, loadTransactions])

  // Resolve bets when winners are revealed
  useEffect(() => {
    if (!isRevealed || !userId || userBets.length === 0) return
    
    // Check if we already resolved bets for this game date
    const resolvedKey = `market_resolved_${gameDate}`
    if (localStorage.getItem(resolvedKey)) return
    
    // Get the winner (position 1) from leaderboard
    const winner = leaderboard[0]?.username
    const top3 = leaderboard.slice(0, 3).map(e => e.username)
    
    if (!winner) return
    
    console.log(`[MARKET] Resolving bets for ${gameDate}. Winner: ${winner}, Top 3: ${top3.join(', ')}`)
    
    let totalWon = 0
    let totalLost = 0
    const newTransactions: typeof transactions = []
    const resolvedBets: UserBet[] = []
    
    userBets.forEach(bet => {
      if (bet.status !== 'active') return
      
      let won = false
      if (bet.bet_type === 'win') {
        won = bet.target_username === winner
      } else if (bet.bet_type === 'top3') {
        won = top3.includes(bet.target_username)
      }
      
      const resolvedBet = { ...bet, status: won ? 'won' : 'lost' }
      resolvedBets.push(resolvedBet)
      
      if (won) {
        totalWon += bet.potential_payout
        newTransactions.push({
          id: `win_${bet.id}`,
          transaction_type: 'bet_won',
          amount: bet.potential_payout,
          balance_after: (userCredits?.available_credits || 0) + totalWon - totalLost,
          description: `Won bet on ${bet.target_username} @ ${bet.odds}x`,
          created_at: new Date().toISOString()
        })
      } else {
        totalLost += bet.bet_amount
        newTransactions.push({
          id: `loss_${bet.id}`,
          transaction_type: 'bet_lost',
          amount: 0, // Already deducted when bet was placed
          balance_after: (userCredits?.available_credits || 0) + totalWon,
          description: `Lost bet on ${bet.target_username}`,
          created_at: new Date().toISOString()
        })
      }
    })
    
    // Update credits
    if (userCredits && (totalWon > 0 || resolvedBets.length > 0)) {
      const winsCount = resolvedBets.filter(b => b.status === 'won').length
      const newCredits: UserCredits = {
        ...userCredits,
        available_credits: userCredits.available_credits + totalWon,
        total_credits: userCredits.total_credits + totalWon - totalLost,
        total_bets_won: userCredits.total_bets_won + winsCount,
        total_credits_won: userCredits.total_credits_won + totalWon,
        total_credits_lost: userCredits.total_credits_lost + totalLost,
        best_win: Math.max(userCredits.best_win, ...resolvedBets.filter(b => b.status === 'won').map(b => b.potential_payout), 0),
        current_streak: winsCount === resolvedBets.length && winsCount > 0 ? userCredits.current_streak + 1 : 0,
        best_streak: winsCount === resolvedBets.length && winsCount > 0 ? Math.max(userCredits.best_streak, userCredits.current_streak + 1) : userCredits.best_streak
      }
      setUserCredits(newCredits)
      
      // Save to localStorage
      localStorage.setItem('market_credits', JSON.stringify({
        available: newCredits.available_credits,
        total: newCredits.total_credits,
        display_name: newCredits.display_name,
        total_bets_placed: newCredits.total_bets_placed,
        total_bets_won: newCredits.total_bets_won,
        total_credits_won: newCredits.total_credits_won,
        total_credits_lost: newCredits.total_credits_lost,
        best_win: newCredits.best_win,
        current_streak: newCredits.current_streak,
        best_streak: newCredits.best_streak,
        timestamp: Date.now()
      }))
      
      // Update transactions
      const existingTxns = JSON.parse(localStorage.getItem('market_transactions') || '[]')
      const allTxns = [...newTransactions, ...existingTxns]
      localStorage.setItem('market_transactions', JSON.stringify(allTxns.slice(0, 50)))
      setTransactions(allTxns.slice(0, 20))
      
      // Update bets
      localStorage.setItem(`market_bets_${gameDate}`, JSON.stringify(resolvedBets))
      setUserBets(resolvedBets)
      
      // Mark as resolved
      localStorage.setItem(resolvedKey, 'true')
      
      console.log(`[MARKET] ✅ Bets resolved! Won: ${totalWon}, Lost: ${totalLost}`)
    }
  }, [isRevealed, userId, userBets, userCredits, gameDate, leaderboard, transactions])

  // Get user's bet on a target
  const getUserBetOnTarget = (username: string) => {
    return userBets.find(b => b.target_username === username)
  }

  // Reference price for displaying accuracy
  const referencePrice = isPastMidnight && midnightPrice !== null ? midnightPrice : currentBitcoinPrice

  // Merge leaderboard with market data
  const marketEntries = useMemo(() => {
    return leaderboard.map(entry => {
      const pool = marketPools.find(p => p.target_username === entry.username)
      const odds = calculateDynamicOdds(entry.username)
      const probability = Math.round((1 / odds) * 100)
      const userBet = getUserBetOnTarget(entry.username)
      
      return {
        ...entry,
        pool,
        odds,
        probability,
        userBet,
        diff: Math.abs(entry.latestGuess - referencePrice)
      }
    })
  }, [leaderboard, marketPools, userBets, referencePrice])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0d12] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400">Loading market data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d0d12] text-white font-sans">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzE1MTUyMCIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-[#0d0d12]/90 backdrop-blur-xl border-b border-zinc-800/50">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Back button */}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-zinc-800/50 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                {/* Logo */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-black text-lg">
                    ₿
                  </div>
                  <div>
                    <h1 className="font-bold text-lg">Prediction Market</h1>
                    <p className="text-xs text-zinc-500">Bet on who wins today</p>
                  </div>
                </div>
              </div>

              {/* User Credits */}
              {userCredits && (
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleClaimBonus}
                    className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400 text-sm transition-colors"
                  >
                    <span>🎁</span>
                    <span>Daily Bonus</span>
                  </button>
                  
                  {/* Balance with dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowDropdown(!showDropdown)}
                      className="flex items-center gap-3 px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-xl border border-zinc-700/50 transition-colors cursor-pointer"
                    >
                      <div className="text-right">
                        <div className="text-xs text-zinc-500">Balance</div>
                        <div className="font-bold text-lg text-emerald-400 tabular-nums">
                          {userCredits.available_credits.toLocaleString()} <span className="text-xs text-zinc-500">credits</span>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        💰
                      </div>
                    </button>
                    
                    {/* Dropdown */}
                    {showDropdown && (
                      <>
                        {/* Backdrop */}
                        <div 
                          className="fixed inset-0 z-40"
                          onClick={() => setShowDropdown(false)}
                        />
                        
                        {/* Dropdown content */}
                        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                          {/* Header with nickname */}
                          <div className="p-4 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-b border-zinc-800">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-zinc-500 uppercase tracking-wider">Your Profile</span>
                              <button
                                onClick={() => {
                                  setEditingNickname(true)
                                  setNewNickname(userCredits.display_name || '')
                                }}
                                className="text-xs text-emerald-400 hover:text-emerald-300"
                              >
                                Edit
                              </button>
                            </div>
                            
                            {editingNickname ? (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={newNickname}
                                  onChange={(e) => setNewNickname(e.target.value)}
                                  placeholder="Enter nickname"
                                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-white text-sm"
                                  maxLength={20}
                                  autoFocus
                                />
                                <button
                                  onClick={handleUpdateNickname}
                                  className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-bold"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <div className="font-bold text-lg text-white truncate">
                                {userCredits.display_name || 'Anonymous'}
                              </div>
                            )}
                          </div>
                          
                          {/* Stats */}
                          <div className="grid grid-cols-2 gap-3 p-4 border-b border-zinc-800">
                            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                              <div className="text-xl font-black text-emerald-400">{userCredits.available_credits.toLocaleString()}</div>
                              <div className="text-xs text-zinc-500">Available</div>
                            </div>
                            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                              <div className="text-xl font-black text-blue-400">{userCredits.total_bets_placed}</div>
                              <div className="text-xs text-zinc-500">Total Bets</div>
                            </div>
                            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                              <div className="text-xl font-black text-purple-400">{userCredits.total_bets_won}</div>
                              <div className="text-xs text-zinc-500">Wins</div>
                            </div>
                            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                              <div className="text-xl font-black text-amber-400">{userCredits.best_win.toLocaleString()}</div>
                              <div className="text-xs text-zinc-500">Best Win</div>
                            </div>
                          </div>
                          
                          {/* Active Bets */}
                          {userBets.filter(b => b.status === 'active').length > 0 && (
                            <div className="p-4 border-b border-zinc-800">
                              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Active Bets</div>
                              <div className="space-y-2">
                                {userBets.filter(b => b.status === 'active').map((bet) => (
                                  <div key={bet.id} className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg">🎯</span>
                                      <span className="text-sm text-zinc-300">{bet.target_username}</span>
                                    </div>
                                    <div className="text-sm font-mono">
                                      <span className="text-zinc-400">{bet.bet_amount}</span>
                                      <span className="text-zinc-600 mx-1">→</span>
                                      <span className="text-emerald-400">{Math.round(bet.potential_payout)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Recent Transactions */}
                          <div className="p-4">
                            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Recent Activity</div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {transactions.length > 0 ? (
                                transactions.map((txn) => (
                                  <div
                                    key={txn.id}
                                    className="flex items-center justify-between py-2 px-3 bg-zinc-800/30 rounded-lg"
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="text-lg">
                                        {txn.transaction_type === 'daily_bonus' && '🎁'}
                                        {txn.transaction_type === 'initial_credits' && '🎉'}
                                        {txn.transaction_type === 'bet_placed' && '🎯'}
                                        {txn.transaction_type === 'bet_won' && '🏆'}
                                        {txn.transaction_type === 'bet_lost' && '💔'}
                                      </span>
                                      <div>
                                        <div className="text-xs text-zinc-300 truncate max-w-[140px]">
                                          {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                                        </div>
                                        <div className="text-[10px] text-zinc-500">
                                          {formatDistanceToNow(new Date(txn.created_at), { addSuffix: true })}
                                        </div>
                                      </div>
                                    </div>
                                    <div className={`text-sm font-bold tabular-nums ${
                                      txn.amount > 0 ? 'text-emerald-400' : txn.amount < 0 ? 'text-red-400' : 'text-zinc-500'
                                    }`}>
                                      {txn.amount > 0 ? '+' : ''}{txn.amount}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-4 text-zinc-500 text-sm">
                                  No transactions yet
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* User ID for reference */}
                          <div className="px-4 pb-4">
                            <div className="text-xs text-zinc-600 truncate">
                              ID: {userId.slice(0, 20)}...
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* Current BTC Price */}
            <div className="p-4 bg-zinc-800/30 rounded-2xl border border-zinc-700/30">
              <div className="text-xs text-zinc-500 mb-1">BTC Price</div>
              <div className="text-2xl font-black text-emerald-400 tabular-nums">
                ${currentBitcoinPrice.toLocaleString()}
              </div>
            </div>
            
            {/* Participants */}
            <div className="p-4 bg-zinc-800/30 rounded-2xl border border-zinc-700/30">
              <div className="text-xs text-zinc-500 mb-1">Participants</div>
              <div className="text-2xl font-black text-blue-400 tabular-nums">
                {leaderboard.length}
              </div>
            </div>
            
            {/* Your Stats */}
            {userCredits && (
              <>
                <div className="p-4 bg-zinc-800/30 rounded-2xl border border-zinc-700/30">
                  <div className="text-xs text-zinc-500 mb-1">Your Win Rate</div>
                  <div className="text-2xl font-black text-purple-400 tabular-nums">
                    {userCredits.total_bets_placed > 0 
                      ? Math.round((userCredits.total_bets_won / userCredits.total_bets_placed) * 100)
                      : 0}%
                  </div>
                </div>
                <div className="p-4 bg-zinc-800/30 rounded-2xl border border-zinc-700/30">
                  <div className="text-xs text-zinc-500 mb-1">Total Bets</div>
                  <div className="text-2xl font-black text-amber-400 tabular-nums">
                    {userCredits.total_bets_placed}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">⚠️</span>
                <span className="text-red-400">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-zinc-500 hover:text-white">
                ✕
              </button>
            </div>
          )}

          {/* Market Status Banner */}
          {isPastMidnight && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3">
              <span className="text-2xl">🏆</span>
              <div>
                <div className="font-bold text-amber-400">Winners Period</div>
                <div className="text-sm text-zinc-400">
                  Betting is closed. Results are being finalized!
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Market Cards - Main Column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Who will win?</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Bet type:</span>
                  <div className="flex bg-zinc-800/50 rounded-lg p-1">
                    <button
                      onClick={() => setBetType('win')}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        betType === 'win' 
                          ? 'bg-emerald-500 text-white' 
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Win
                    </button>
                    <button
                      onClick={() => setBetType('top3')}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        betType === 'top3' 
                          ? 'bg-emerald-500 text-white' 
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Top 3
                    </button>
                  </div>
                </div>
              </div>

              {/* Market Cards */}
              {marketEntries.map((entry, index) => {
                const isSelected = selectedTarget === entry.username
                const hasBet = !!entry.userBet
                const position = index + 1
                
                return (
                  <div
                    key={entry.username}
                    className={`p-4 rounded-2xl border transition-all ${
                      isSelected 
                        ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/30' 
                        : hasBet
                          ? 'bg-blue-500/5 border-blue-500/30'
                          : 'bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Position Badge */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                        position === 1 ? 'bg-amber-500/20 text-amber-400' :
                        position === 2 ? 'bg-zinc-400/20 text-zinc-300' :
                        position === 3 ? 'bg-orange-600/20 text-orange-400' :
                        'bg-zinc-700/30 text-zinc-500'
                      }`}>
                        {position}
                      </div>

                      {/* Avatar & Name */}
                      <div className="flex items-center gap-3 flex-1">
                        <Avatar className="h-12 w-12 border-2 border-zinc-700">
                          <AvatarImage src={entry.avatar} alt={entry.username} />
                          <AvatarFallback className="bg-zinc-800 text-zinc-400">
                            {entry.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{entry.username}</div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-zinc-400">
                              {isRevealed ? `$${entry.latestGuess.toLocaleString()}` : '???'}
                            </span>
                            {isRevealed && (
                              <span className={`text-xs ${
                                entry.diff < 500 ? 'text-emerald-400' :
                                entry.diff < 1000 ? 'text-amber-400' :
                                'text-zinc-500'
                              }`}>
                                (${entry.diff.toLocaleString()} off)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Odds & Probability */}
                      <div className="text-right mr-4">
                        <div className="text-lg font-bold text-emerald-400">
                          {entry.odds.toFixed(2)}x
                        </div>
                        <div className="text-xs text-zinc-500">
                          {entry.probability}% chance
                        </div>
                      </div>

                      {/* Bet Button or Status */}
                      {hasBet ? (
                        <div className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded-xl text-center">
                          <div className="text-xs text-blue-400">Your bet</div>
                          <div className="font-bold text-blue-300">
                            {entry.userBet!.bet_amount} credits
                          </div>
                          <div className="text-xs text-zinc-500">
                            → {Math.round(entry.userBet!.potential_payout)}
                          </div>
                        </div>
                      ) : isPastMidnight ? (
                        <div className="px-4 py-2 bg-zinc-700/30 rounded-xl text-zinc-500 text-sm">
                          Closed
                        </div>
                      ) : isSelected ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={betAmount}
                            onChange={(e) => setBetAmount(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-20 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-center text-white"
                            min="1"
                            max={userCredits?.available_credits || 0}
                          />
                          <button
                            onClick={() => handlePlaceBet(entry.username, entry.avatar, entry.latestGuess, entry.earliestTimestamp)}
                            disabled={isPlacingBet || !userCredits || betAmount > userCredits.available_credits}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-600 disabled:cursor-not-allowed rounded-xl font-bold transition-colors"
                          >
                            {isPlacingBet ? '...' : 'Bet'}
                          </button>
                          <button
                            onClick={() => setSelectedTarget(null)}
                            className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedTarget(entry.username)}
                          className="px-6 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 font-semibold transition-colors"
                        >
                          Bet
                        </button>
                      )}
                    </div>

                    {/* Pool info */}
                    {entry.pool && entry.pool.total_bets_count > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-700/30 flex items-center gap-4 text-xs text-zinc-500">
                        <span>{entry.pool.total_bets_count} bets</span>
                        <span>Pool: {entry.pool.total_pool_amount.toLocaleString()} credits</span>
                      </div>
                    )}
                  </div>
                )
              })}

              {marketEntries.length === 0 && (
                <div className="p-12 text-center text-zinc-500">
                  <div className="text-4xl mb-4">📊</div>
                  <p>No predictions yet. Check back later!</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Your Active Bets */}
              {userBets.length > 0 && (
                <div className="p-4 bg-zinc-800/30 rounded-2xl border border-zinc-700/30">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <span>🎯</span> Your Active Bets
                  </h3>
                  <div className="space-y-3">
                    {userBets.map((bet) => (
                      <div key={bet.id} className="p-3 bg-zinc-700/30 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{bet.target_username}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            bet.status === 'won' ? 'bg-emerald-500/20 text-emerald-400' :
                            bet.status === 'lost' ? 'bg-red-500/20 text-red-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {bet.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-zinc-400">{bet.bet_amount} credits</span>
                          <span className="text-emerald-400">
                            → {Math.round(bet.potential_payout)} @ {bet.odds}x
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Bettors */}
              <div className="p-4 bg-zinc-800/30 rounded-2xl border border-zinc-700/30">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <span>🏆</span> Top Bettors
                </h3>
                <div className="space-y-2">
                  {topBettors.slice(0, 5).map((bettor, index) => (
                    <div key={bettor.user_identifier} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-700/30 transition-colors">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-amber-500/20 text-amber-400' :
                        index === 1 ? 'bg-zinc-400/20 text-zinc-300' :
                        index === 2 ? 'bg-orange-600/20 text-orange-400' :
                        'bg-zinc-700/30 text-zinc-500'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {bettor.display_name || `Player ${bettor.user_identifier.slice(-4)}`}
                        </div>
                        {bettor.total_bets_won !== undefined && bettor.total_bets_won > 0 && (
                          <div className="text-[10px] text-zinc-500">
                            {bettor.total_bets_won} wins
                            {bettor.best_streak && bettor.best_streak > 1 && (
                              <span className="ml-1 text-amber-500">🔥{bettor.best_streak}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-emerald-400 font-bold tabular-nums text-sm">
                        {bettor.total_credits.toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {topBettors.length === 0 && (
                    <p className="text-center text-zinc-500 text-sm py-4">
                      No bettors yet. Be the first!
                    </p>
                  )}
                </div>
              </div>

              {/* How it Works */}
              <div className="p-4 bg-zinc-800/30 rounded-2xl border border-zinc-700/30">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <span>ℹ️</span> How it Works
                </h3>
                <div className="space-y-3 text-sm text-zinc-400">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400">1.</span>
                    <span>Choose a participant from today's Rate-Chart</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400">2.</span>
                    <span>Bet credits on who you think will be closest to midnight price</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400">3.</span>
                    <span>Odds update based on pool distribution</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400">4.</span>
                    <span>Win multiplied credits if your pick wins!</span>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="text-xs text-amber-400 font-medium">📌 Remember</div>
                  <div className="text-xs text-zinc-400 mt-1">
                    Betting closes at 23:00 Vienna time. Winners are determined by closest prediction to midnight BTC price.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

