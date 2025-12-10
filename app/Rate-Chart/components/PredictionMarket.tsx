'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { format, formatDistanceToNow } from 'date-fns'
import { 
  Trophy, 
  TrendingUp, 
  Users, 
  Target, 
  Coins, 
  Gift, 
  ChevronLeft, 
  X, 
  Info,
  Flame,
  Crown,
  Zap
} from 'lucide-react'

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
  
  const [showDropdown, setShowDropdown] = useState(false)
  const [transactions, setTransactions] = useState<{ id: string; transaction_type: string; amount: number; balance_after: number; description?: string; created_at: string }[]>([])
  const [editingNickname, setEditingNickname] = useState(false)
  const [newNickname, setNewNickname] = useState('')
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false)
  const [leaderboardSortBy, setLeaderboardSortBy] = useState<'points' | 'wins'>('points')

  useEffect(() => {
    setUserId(getUserId())
  }, [])

  useEffect(() => {
    if (!userId) return
    
    const txns = localStorage.getItem('market_transactions')
    const credits = localStorage.getItem('market_credits')
    
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
        
        const allBetKeys = Object.keys(localStorage).filter(k => k.startsWith('market_bets_'))
        allBetKeys.forEach(key => {
          try {
            const bets = JSON.parse(localStorage.getItem(key) || '[]')
            bets.forEach((bet: UserBet) => {
              repairTxns.push({
                id: `repair_bet_${bet.id}`,
                transaction_type: 'bet_placed',
                amount: -bet.bet_amount,
                balance_after: 0,
                description: `Bet on ${bet.target_username} to ${bet.bet_type}`,
                created_at: new Date().toISOString()
              })
            })
          } catch {}
        })
        
        localStorage.setItem('market_transactions', JSON.stringify(repairTxns))
        setTransactions(repairTxns)
      } catch {}
    }
  }, [userId])

  const generateLocalNickname = () => {
    const adjectives = ['Lucky', 'Swift', 'Bold', 'Crypto', 'Diamond', 'Golden', 'Mighty', 'Epic']
    const nouns = ['Trader', 'Whale', 'Bull', 'Wolf', 'Dragon', 'Hodler', 'Degen', 'Legend']
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const num = Math.floor(Math.random() * 100)
    return `${adj}${noun}${num}`
  }

  const loadFromLocalStorage = useCallback(() => {
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
    
    const cachedBets = localStorage.getItem(`market_bets_${gameDate}`)
    if (cachedBets) {
      try {
        setUserBets(JSON.parse(cachedBets))
      } catch {
        setUserBets([])
      }
    }
    
    // Don't load topBettors from localStorage - always get fresh from API
    // localStorage data can be corrupted or out of sync
  }, [userId, gameDate])

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
    
    const bettors = [{ user_identifier: userId, display_name: nickname, total_credits: 1000 }]
    localStorage.setItem('market_all_bettors', JSON.stringify(bettors))
    setTopBettors(bettors)
  }

  const fetchMarketData = useCallback(async () => {
    if (!userId || !gameDate) return
    
    try {
      const response = await fetch(`/Rate-Chart/api/market?date=${gameDate}&userId=${userId}`)
      const data = await response.json()
      
      if (response.ok) {
        if (data.userCredits) {
          setUserCredits(data.userCredits)
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
        if (data.topBettors) {
          setTopBettors(data.topBettors)
          // Sync API data to localStorage to keep topBettors in sync
          localStorage.setItem('market_all_bettors', JSON.stringify(data.topBettors))
        }
        
        try {
          const creditsRes = await fetch(`/Rate-Chart/api/market/credits?userId=${userId}&history=true&historyLimit=20`)
          const creditsData = await creditsRes.json()
          if (creditsRes.ok && creditsData.history) {
            setTransactions(creditsData.history)
            localStorage.setItem('market_transactions', JSON.stringify(creditsData.history.slice(0, 50)))
          }
        } catch {}
      } else {
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
    const interval = setInterval(fetchMarketData, 30000)
    return () => clearInterval(interval)
  }, [fetchMarketData])

  // Clear corrupted localStorage on mount and force API refresh
  useEffect(() => {
    // Clear potentially corrupted localStorage to force fresh data from API
    const storedBettors = localStorage.getItem('market_all_bettors')
    if (storedBettors) {
      try {
        const bettors = JSON.parse(storedBettors)
        // Check for corrupted data (values that look like decimals instead of integers)
        const hasCorruptedData = bettors.some((b: { total_credits: number }) => 
          b.total_credits > 0 && b.total_credits < 100
        )
        if (hasCorruptedData) {
          console.log('[MARKET] Clearing corrupted localStorage data...')
          localStorage.removeItem('market_all_bettors')
        }
      } catch {
        localStorage.removeItem('market_all_bettors')
      }
    }
  }, [])

  const calculateDynamicOdds = (username: string): number => {
    const pool = marketPools.find(p => p.target_username === username)
    if (pool && pool.current_odds > 0) return pool.current_odds
    
    const position = leaderboard.findIndex(e => e.username === username)
    if (position === -1) return 10
    
    const baseOdds = 1.5 + (position * 0.5)
    return Math.min(baseOdds, 20)
  }

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
        placeBetLocally(targetUsername, targetAvatar, latestPrediction)
        return
      }
      
      if (data.userCredits) setUserCredits(data.userCredits)
      if (data.bet) setUserBets(prev => [...prev, data.bet])
      
      setSelectedTarget(null)
      setBetAmount(10)
      fetchMarketData()
      
    } catch (err) {
      placeBetLocally(targetUsername, targetAvatar, latestPrediction)
    } finally {
      setIsPlacingBet(false)
    }
  }

  const placeBetLocally = (targetUsername: string, targetAvatar?: string, latestPrediction?: number) => {
    if (!userCredits) return
    
    const existingBet = userBets.find(b => b.target_username === targetUsername && b.bet_type === betType)
    if (existingBet) {
      setError(`You already have a ${betType} bet on ${targetUsername}`)
      return
    }
    
    const position = leaderboard.findIndex(e => e.username === targetUsername)
    const odds = Math.max(1.5, Math.min(10, 1.5 + position * 0.5))
    const potentialPayout = Math.round(betAmount * odds * 100) / 100
    
    const newBet: UserBet = {
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      target_username: targetUsername,
      bet_type: betType,
      bet_amount: betAmount,
      odds,
      potential_payout: potentialPayout,
      status: 'active'
    }
    
    const newAvailable = userCredits.available_credits - betAmount
    const updatedCredits: UserCredits = {
      ...userCredits,
      available_credits: newAvailable,
      total_bets_placed: userCredits.total_bets_placed + 1
    }
    
    setUserCredits(updatedCredits)
    setUserBets(prev => [...prev, newBet])
    
    localStorage.setItem('market_credits', JSON.stringify({
      available: newAvailable,
      total: updatedCredits.total_credits,
      display_name: updatedCredits.display_name,
      total_bets_placed: updatedCredits.total_bets_placed,
      timestamp: Date.now()
    }))
    
    const allBets = [...userBets, newBet]
    localStorage.setItem(`market_bets_${gameDate}`, JSON.stringify(allBets))
    
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
  }

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

  useEffect(() => {
    if (userId) {
      loadTransactions()
    }
  }, [userId, loadTransactions])

  const handleUpdateNickname = useCallback(() => {
    if (!newNickname.trim() || newNickname.length < 2 || newNickname.length > 20) {
      setError('Nickname must be 2-20 characters')
      return
    }
    
    if (userCredits) {
      setUserCredits({
        ...userCredits,
        display_name: newNickname.trim()
      })
    }
    
    const cached = JSON.parse(localStorage.getItem('market_credits') || '{}')
    cached.display_name = newNickname.trim()
    localStorage.setItem('market_credits', JSON.stringify(cached))
    
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

  useEffect(() => {
    if (showDropdown) {
      loadTransactions()
    }
  }, [showDropdown, loadTransactions])

  useEffect(() => {
    if (!isRevealed || !userId || userBets.length === 0) return
    
    const resolvedKey = `market_resolved_${gameDate}`
    if (localStorage.getItem(resolvedKey)) return
    
    const winner = leaderboard[0]?.username
    const top3 = leaderboard.slice(0, 3).map(e => e.username)
    
    if (!winner) return
    
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
          amount: 0,
          balance_after: (userCredits?.available_credits || 0) + totalWon,
          description: `Lost bet on ${bet.target_username}`,
          created_at: new Date().toISOString()
        })
      }
    })
    
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
      
      const existingTxns = JSON.parse(localStorage.getItem('market_transactions') || '[]')
      const allTxns = [...newTransactions, ...existingTxns]
      localStorage.setItem('market_transactions', JSON.stringify(allTxns.slice(0, 50)))
      setTransactions(allTxns.slice(0, 20))
      
      localStorage.setItem(`market_bets_${gameDate}`, JSON.stringify(resolvedBets))
      setUserBets(resolvedBets)
      
      // Update topBettors with new credits after resolution
      const bettors = JSON.parse(localStorage.getItem('market_all_bettors') || '[]')
      const myIndex = bettors.findIndex((b: { user_identifier: string }) => b.user_identifier === userId)
      if (myIndex >= 0) {
        bettors[myIndex].total_credits = newCredits.total_credits
        bettors[myIndex].total_bets_won = newCredits.total_bets_won
        bettors[myIndex].best_streak = newCredits.best_streak
      } else {
        bettors.push({
          user_identifier: userId,
          display_name: newCredits.display_name,
          total_credits: newCredits.total_credits,
          total_bets_won: newCredits.total_bets_won,
          best_streak: newCredits.best_streak
        })
      }
      const sortedBettors = bettors.sort((a: { total_credits: number }, b: { total_credits: number }) => b.total_credits - a.total_credits)
      localStorage.setItem('market_all_bettors', JSON.stringify(sortedBettors))
      setTopBettors(sortedBettors)
      
      localStorage.setItem(resolvedKey, 'true')
    }
  }, [isRevealed, userId, userBets, userCredits, gameDate, leaderboard, transactions])

  const getUserBetOnTarget = (username: string) => {
    return userBets.find(b => b.target_username === username)
  }

  const referencePrice = isPastMidnight && midnightPrice !== null ? midnightPrice : currentBitcoinPrice

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground font-body">Lade Marktdaten...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-background to-background pointer-events-none" />
      
      {/* Grid pattern overlay */}
      <div className="fixed inset-0 opacity-30 pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='grid' width='60' height='60' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 60 0 L 0 0 0 60' fill='none' stroke='%23f5a62308' stroke-width='1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23grid)'/%3E%3C/svg%3E")`
      }} />

      <div className="relative z-10">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-primary/20">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-primary/10 rounded-lg transition-colors text-muted-foreground hover:text-primary"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center shadow-lg shadow-primary/30">
                    <Trophy className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h1 className="font-headline text-xl font-bold gold-text">Prediction Market</h1>
                    <p className="text-xs text-muted-foreground">Wette auf den Gewinner des Tages</p>
                  </div>
                </div>
              </div>

              {/* User Credits */}
              {userCredits && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClaimBonus}
                    className="hidden sm:flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400 text-sm transition-all hover:scale-105"
                  >
                    <Gift className="w-4 h-4" />
                    <span>Daily Bonus</span>
                  </button>
                  
                  <div className="relative">
                    <button
                      onClick={() => setShowDropdown(!showDropdown)}
                      className="flex items-center gap-3 px-4 py-2 glass-card-gold rounded-xl cursor-pointer hover:scale-105 transition-all"
                    >
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</div>
                        <div className="font-bold text-xl gold-text tabular-nums">
                          {userCredits.available_credits.toLocaleString()}
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center">
                        <Coins className="w-5 h-5 text-primary-foreground" />
                      </div>
                    </button>
                    
                    {/* Dropdown */}
                    {showDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                        
                        <div className="absolute right-0 top-full mt-2 w-80 glass-card border border-primary/30 rounded-xl shadow-2xl z-50 overflow-hidden">
                          {/* Header */}
                          <div className="p-4 bg-gradient-to-br from-primary/10 to-amber-500/10 border-b border-primary/20">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-muted-foreground uppercase tracking-wider">Dein Profil</span>
                              <button
                                onClick={() => {
                                  setEditingNickname(true)
                                  setNewNickname(userCredits.display_name || '')
                                }}
                                className="text-xs text-primary hover:text-primary/80"
                              >
                                Bearbeiten
                              </button>
                            </div>
                            
                            {editingNickname ? (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={newNickname}
                                  onChange={(e) => setNewNickname(e.target.value)}
                                  placeholder="Nickname eingeben"
                                  className="flex-1 px-3 py-2 bg-card border border-primary/30 rounded-lg text-foreground text-sm"
                                  maxLength={20}
                                  autoFocus
                                />
                                <button
                                  onClick={handleUpdateNickname}
                                  className="px-3 py-2 bg-primary hover:bg-primary/90 rounded-lg text-sm font-bold text-primary-foreground"
                                >
                                  OK
                                </button>
                              </div>
                            ) : (
                              <div className="font-bold text-lg text-foreground truncate">
                                {userCredits.display_name || 'Anonym'}
                              </div>
                            )}
                          </div>
                          
                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 gap-3 p-4 border-b border-primary/10">
                            <div className="text-center p-3 bg-card/50 rounded-lg border border-primary/10">
                              <div className="text-xl font-black gold-text">{userCredits.available_credits.toLocaleString()}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">Verfügbar</div>
                            </div>
                            <div className="text-center p-3 bg-card/50 rounded-lg border border-primary/10">
                              <div className="text-xl font-black text-blue-400">{userCredits.total_bets_placed}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">Wetten</div>
                            </div>
                            <div className="text-center p-3 bg-card/50 rounded-lg border border-primary/10">
                              <div className="text-xl font-black text-emerald-400">{userCredits.total_bets_won}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">Gewonnen</div>
                            </div>
                            <div className="text-center p-3 bg-card/50 rounded-lg border border-primary/10">
                              <div className="text-xl font-black text-amber-400">{userCredits.best_win.toLocaleString()}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">Bester Gewinn</div>
                            </div>
                          </div>
                          
                          {/* Active Bets */}
                          {userBets.filter(b => b.status === 'active').length > 0 && (
                            <div className="p-4 border-b border-primary/10">
                              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Aktive Wetten</div>
                              <div className="space-y-2">
                                {userBets.filter(b => b.status === 'active').map((bet) => (
                                  <div key={bet.id} className="flex items-center justify-between p-2 bg-card/50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                      <Target className="w-4 h-4 text-primary" />
                                      <span className="text-sm text-foreground">{bet.target_username}</span>
                                    </div>
                                    <div className="text-sm font-mono">
                                      <span className="text-muted-foreground">{bet.bet_amount}</span>
                                      <span className="text-muted-foreground/50 mx-1">→</span>
                                      <span className="text-emerald-400">{Math.round(bet.potential_payout)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Transactions */}
                          <div className="p-4">
                            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Letzte Aktivität</div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {transactions.length > 0 ? (
                                transactions.map((txn) => (
                                  <div key={txn.id} className="flex items-center justify-between py-2 px-3 bg-card/30 rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <span className="text-lg">
                                        {txn.transaction_type === 'daily_bonus' && '🎁'}
                                        {txn.transaction_type === 'initial_credits' && '🎉'}
                                        {txn.transaction_type === 'bet_placed' && '🎯'}
                                        {txn.transaction_type === 'bet_won' && '🏆'}
                                        {txn.transaction_type === 'bet_lost' && '💔'}
                                      </span>
                                      <div>
                                        <div className="text-xs text-foreground/80 truncate max-w-[140px]">
                                          {txn.description || txn.transaction_type.replace(/_/g, ' ')}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                          {formatDistanceToNow(new Date(txn.created_at), { addSuffix: true })}
                                        </div>
                                      </div>
                                    </div>
                                    <div className={`text-sm font-bold tabular-nums ${
                                      txn.amount > 0 ? 'text-emerald-400' : txn.amount < 0 ? 'text-red-400' : 'text-muted-foreground'
                                    }`}>
                                      {txn.amount > 0 ? '+' : ''}{txn.amount}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-4 text-muted-foreground text-sm">
                                  Noch keine Transaktionen
                                </div>
                              )}
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

        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="glass-card p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">BTC Preis</span>
              </div>
              <div className="text-2xl font-black gold-text tabular-nums">
                ${currentBitcoinPrice.toLocaleString()}
              </div>
            </div>
            
            <div className="glass-card p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Teilnehmer</span>
              </div>
              <div className="text-2xl font-black text-blue-400 tabular-nums">
                {leaderboard.length}
              </div>
            </div>
            
            {userCredits && (
              <>
                <div className="glass-card p-4 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Win Rate</span>
                  </div>
                  <div className="text-2xl font-black text-purple-400 tabular-nums">
                    {userCredits.total_bets_placed > 0 
                      ? Math.round((userCredits.total_bets_won / userCredits.total_bets_placed) * 100)
                      : 0}%
                  </div>
                </div>
                <div className="glass-card p-4 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Streak</span>
                  </div>
                  <div className="text-2xl font-black text-amber-400 tabular-nums">
                    {userCredits.current_streak}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">⚠️</span>
                <span className="text-destructive">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Market Status Banner */}
          {isPastMidnight && (
            <div className="mb-6 p-4 glass-card-gold rounded-xl flex items-center gap-3">
              <Trophy className="w-6 h-6 text-primary" />
              <div>
                <div className="font-bold gold-text">Gewinner-Phase</div>
                <div className="text-sm text-muted-foreground">
                  Wetten sind geschlossen. Ergebnisse werden ermittelt!
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Market Cards - Main Column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold font-headline">Wer gewinnt heute?</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Wettart:</span>
                  <div className="flex bg-card/50 rounded-lg p-1 border border-primary/20">
                    <button
                      onClick={() => setBetType('win')}
                      className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                        betType === 'win' 
                          ? 'bg-primary text-primary-foreground font-semibold shadow-lg' 
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Sieger
                    </button>
                    <button
                      onClick={() => setBetType('top3')}
                      className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                        betType === 'top3' 
                          ? 'bg-primary text-primary-foreground font-semibold shadow-lg' 
                          : 'text-muted-foreground hover:text-foreground'
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
                    className={`stagger-item p-4 rounded-xl border transition-all ${
                      isSelected 
                        ? 'glass-card-gold ring-1 ring-primary/50' 
                        : hasBet
                          ? 'glass-card border-blue-500/30'
                          : 'glass-card hover:border-primary/30'
                    }`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      {/* Position Badge - only show after reveal */}
                      {isRevealed && (
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                          position === 1 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          position === 2 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/30' :
                          position === 3 ? 'bg-orange-600/20 text-orange-400 border border-orange-500/30' :
                          'bg-card text-muted-foreground border border-primary/10'
                        }`}>
                          {position === 1 ? <Crown className="w-5 h-5" /> : position}
                        </div>
                      )}

                      {/* Avatar & Name */}
                      <div className="flex items-center gap-3 flex-1">
                        <Avatar className="h-12 w-12 border-2 border-primary/20">
                          <AvatarImage src={entry.avatar} alt={entry.username} />
                          <AvatarFallback className="bg-card text-muted-foreground font-bold">
                            {entry.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{entry.username}</div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">
                              {isRevealed ? `$${entry.latestGuess.toLocaleString()}` : '???'}
                            </span>
                            {isRevealed && (
                              <span className={`text-xs ${
                                entry.diff < 500 ? 'text-emerald-400' :
                                entry.diff < 1000 ? 'text-amber-400' :
                                'text-muted-foreground'
                              }`}>
                                (${entry.diff.toLocaleString()} off)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Odds & Probability */}
                      <div className="text-right mr-4">
                        <div className="text-xl font-black gold-text">
                          {entry.odds.toFixed(2)}x
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.probability}% Chance
                        </div>
                      </div>

                      {/* Bet Button or Status */}
                      {hasBet ? (
                        <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-center">
                          <div className="text-[10px] text-blue-400 uppercase">Deine Wette</div>
                          <div className="font-bold text-blue-300">
                            {entry.userBet!.bet_amount} credits
                          </div>
                          <div className="text-xs text-muted-foreground">
                            → {Math.round(entry.userBet!.potential_payout)}
                          </div>
                        </div>
                      ) : isPastMidnight ? (
                        <div className="px-4 py-2 bg-card rounded-xl text-muted-foreground text-sm">
                          Geschlossen
                        </div>
                      ) : isSelected ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={betAmount}
                            onChange={(e) => setBetAmount(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-20 px-3 py-2 bg-card border border-primary/30 rounded-lg text-center text-foreground"
                            min="1"
                            max={userCredits?.available_credits || 0}
                          />
                          <button
                            onClick={() => handlePlaceBet(entry.username, entry.avatar, entry.latestGuess, entry.earliestTimestamp)}
                            disabled={isPlacingBet || !userCredits || betAmount > userCredits.available_credits}
                            className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed rounded-xl font-bold transition-all text-primary-foreground"
                          >
                            {isPlacingBet ? '...' : 'Wetten'}
                          </button>
                          <button
                            onClick={() => setSelectedTarget(null)}
                            className="p-2 hover:bg-card rounded-lg transition-colors text-muted-foreground"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedTarget(entry.username)}
                          className="px-6 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-primary font-semibold transition-all hover:scale-105"
                        >
                          Wetten
                        </button>
                      )}
                    </div>

                    {/* Pool info */}
                    {entry.pool && entry.pool.total_bets_count > 0 && (
                      <div className="mt-3 pt-3 border-t border-primary/10 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{entry.pool.total_bets_count} Wetten</span>
                        <span>Pool: {entry.pool.total_pool_amount.toLocaleString()} credits</span>
                      </div>
                    )}
                  </div>
                )
              })}

              {marketEntries.length === 0 && (
                <div className="p-12 text-center glass-card rounded-xl">
                  <div className="text-4xl mb-4">📊</div>
                  <p className="text-muted-foreground">Noch keine Vorhersagen. Schau später wieder vorbei!</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Your Active Bets */}
              {userBets.length > 0 && (
                <div className="glass-card p-5 rounded-xl">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    <span>Deine aktiven Wetten</span>
                  </h3>
                  <div className="space-y-3">
                    {userBets.map((bet) => (
                      <div key={bet.id} className="p-3 bg-card/50 rounded-xl border border-primary/10">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{bet.target_username}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            bet.status === 'won' ? 'bg-emerald-500/20 text-emerald-400' :
                            bet.status === 'lost' ? 'bg-red-500/20 text-red-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {bet.status === 'active' ? 'Aktiv' : bet.status === 'won' ? 'Gewonnen' : 'Verloren'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{bet.bet_amount} credits</span>
                          <span className="text-primary">
                            → {Math.round(bet.potential_payout)} @ {bet.odds}x
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Bettors */}
              <div className="glass-card p-5 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <button 
                    onClick={() => setLeaderboardExpanded(!leaderboardExpanded)}
                    className="font-bold flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <span>Top Wetteiferer</span>
                    <svg 
                      className={`w-4 h-4 transition-transform duration-300 ${leaderboardExpanded ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-card/50 rounded-lg p-0.5 border border-primary/20">
                      <button
                        onClick={() => setLeaderboardSortBy('points')}
                        className={`px-2 py-1 text-[10px] rounded transition-all ${
                          leaderboardSortBy === 'points'
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Punkte
                      </button>
                      <button
                        onClick={() => setLeaderboardSortBy('wins')}
                        className={`px-2 py-1 text-[10px] rounded transition-all ${
                          leaderboardSortBy === 'wins'
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Siege
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          // First sync local user data to Supabase
                          if (userCredits && userId) {
                            console.log('[MARKET] Syncing local user to Supabase...')
                            const syncRes = await fetch('/Rate-Chart/api/market/sync-user', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                userId,
                                displayName: userCredits.display_name,
                                totalCredits: userCredits.total_credits,
                                availableCredits: userCredits.available_credits,
                                totalBetsPlaced: userCredits.total_bets_placed,
                                totalBetsWon: userCredits.total_bets_won,
                                totalCreditsWon: userCredits.total_credits_won,
                                totalCreditsLost: userCredits.total_credits_lost,
                                bestWin: userCredits.best_win,
                                currentStreak: userCredits.current_streak,
                                bestStreak: userCredits.best_streak,
                                bets: userBets.map(b => ({
                                  gameDate,
                                  targetUsername: b.target_username,
                                  betType: b.bet_type,
                                  betAmount: b.bet_amount,
                                  odds: b.odds,
                                  potentialPayout: b.potential_payout,
                                  status: b.status
                                }))
                              })
                            })
                            const syncData = await syncRes.json()
                            console.log('[MARKET] Sync result:', syncData)
                          }
                          
                          // Then recalculate all credits
                          const res = await fetch('/Rate-Chart/api/market/recalculate', { method: 'POST' })
                          const data = await res.json()
                          console.log('[MARKET] Recalculate result:', data)
                          
                          if (data.success && data.updated_leaderboard) {
                            setTopBettors(data.updated_leaderboard)
                            localStorage.setItem('market_all_bettors', JSON.stringify(data.updated_leaderboard))
                          }
                          fetchMarketData()
                        } catch (err) {
                          console.error('[MARKET] Sync error:', err)
                        }
                      }}
                      className="p-1.5 hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary transition-all hover:rotate-180 duration-500"
                      title="Sync credits to server"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className={`space-y-2 overflow-hidden transition-all duration-300 ${leaderboardExpanded ? 'max-h-[2000px]' : 'max-h-[400px]'}`}>
                  {[...topBettors]
                    .sort((a, b) => {
                      if (leaderboardSortBy === 'wins') {
                        return (b.total_bets_won ?? 0) - (a.total_bets_won ?? 0)
                      }
                      return b.total_credits - a.total_credits
                    })
                    .slice(0, leaderboardExpanded ? topBettors.length : 8)
                    .map((bettor, index) => (
                    <div key={bettor.user_identifier} className="flex items-center gap-3 p-2 rounded-lg hover:bg-card/50 transition-colors">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        index === 1 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/30' :
                        index === 2 ? 'bg-orange-600/20 text-orange-400 border border-orange-500/30' :
                        'bg-card text-muted-foreground border border-primary/10'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {bettor.display_name || `Spieler ${bettor.user_identifier.slice(-4)}`}
                        </div>
                        {bettor.total_bets_won !== undefined && bettor.total_bets_won > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            {bettor.total_bets_won} Siege
                            {bettor.best_streak && bettor.best_streak > 1 && (
                              <span className="ml-1 text-amber-500">
                                <Flame className="w-3 h-3 inline" />{bettor.best_streak}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className={`font-bold tabular-nums text-sm ${leaderboardSortBy === 'wins' ? 'text-emerald-400' : 'gold-text'}`}>
                        {leaderboardSortBy === 'wins' 
                          ? `${bettor.total_bets_won ?? 0} 🏆`
                          : bettor.total_credits.toLocaleString()
                        }
                      </div>
                    </div>
                  ))}
                  {topBettors.length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-4">
                      Noch keine Wetteiferer. Sei der Erste!
                    </p>
                  )}
                </div>
                {topBettors.length > 8 && (
                  <button
                    onClick={() => setLeaderboardExpanded(!leaderboardExpanded)}
                    className="w-full mt-3 py-2 text-xs text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
                  >
                    {leaderboardExpanded ? 'Weniger anzeigen' : `Alle ${topBettors.length} anzeigen`}
                    <svg 
                      className={`w-3 h-3 transition-transform duration-300 ${leaderboardExpanded ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </div>

              {/* How it Works */}
              <div className="glass-card p-5 rounded-xl">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-400" />
                  <span>So funktioniert's</span>
                </h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <span className="text-primary font-bold">1.</span>
                    <span>Wähle einen Teilnehmer aus dem Rate-Chart</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-primary font-bold">2.</span>
                    <span>Setze Credits auf den, der am nächsten am Mitternachtspreis liegt</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-primary font-bold">3.</span>
                    <span>Quoten ändern sich basierend auf Pool-Verteilung</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-primary font-bold">4.</span>
                    <span>Gewinne multiplizierte Credits wenn dein Pick gewinnt!</span>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="text-xs text-amber-400 font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Denk dran
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Wetten schließen um 23:00 Wiener Zeit. Gewinner werden anhand der nächsten Vorhersage zum Mitternachts-BTC-Preis ermittelt.
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
