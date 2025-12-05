'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format, formatDistanceToNow } from 'date-fns'

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

interface Transaction {
  id: string
  transaction_type: string
  amount: number
  balance_after: number
  description?: string
  created_at: string
}

interface ActiveBet {
  id: string
  target_username: string
  bet_type: string
  bet_amount: number
  odds: number
  potential_payout: number
  status: string
  game_date: string
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

export default function CreditsDisplay() {
  const [userId, setUserId] = useState<string>('')
  const [credits, setCredits] = useState<UserCredits | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [activeBets, setActiveBets] = useState<ActiveBet[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [claimingBonus, setClaimingBonus] = useState(false)
  const [bonusMessage, setBonusMessage] = useState<string | null>(null)
  const [isEditingNickname, setIsEditingNickname] = useState(false)
  const [nickname, setNickname] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const nicknameInputRef = useRef<HTMLInputElement>(null)

  // Initialize user ID
  useEffect(() => {
    setUserId(getUserId())
  }, [])

  // Fetch credits and history
  const fetchCredits = useCallback(async (includeHistory = false) => {
    if (!userId) return
    
    try {
      const url = `/Rate-Chart/api/market/credits?userId=${userId}${includeHistory ? '&history=true&historyLimit=20' : ''}`
      const response = await fetch(url)
      const data = await response.json()
      
      if (response.ok && data.credits) {
        setCredits(data.credits)
        // Save to localStorage for quick access
        localStorage.setItem('market_credits', JSON.stringify({
          available: data.credits.available_credits,
          total: data.credits.total_credits,
          display_name: data.credits.display_name,
          timestamp: Date.now()
        }))
      } else {
        // API error - use localStorage fallback
        console.warn('[CREDITS] API returned error, using localStorage fallback')
        loadFromLocalStorage()
      }
      if (data.history) {
        setTransactions(data.history)
        // Sync to localStorage so PredictionMarket can also see them
        localStorage.setItem('market_transactions', JSON.stringify(data.history.slice(0, 50)))
      }
      if (data.activeBets) setActiveBets(data.activeBets)
    } catch (err) {
      console.error('[CREDITS] Failed to fetch:', err)
      loadFromLocalStorage()
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  // Load credits from localStorage (fallback when DB not available)
  const loadFromLocalStorage = () => {
    const cached = localStorage.getItem('market_credits')
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setCredits({
          user_identifier: userId,
          display_name: parsed.display_name || generateLocalNickname(),
          available_credits: parsed.available ?? 1000,
          total_credits: parsed.total ?? 1000,
          total_bets_placed: 0,
          total_bets_won: 0,
          total_credits_won: 0,
          total_credits_lost: 0,
          best_win: 0,
          current_streak: 0,
          best_streak: 0
        })
      } catch {
        initializeLocalCredits()
      }
    } else {
      initializeLocalCredits()
    }
  }

  // Generate a local nickname
  const generateLocalNickname = () => {
    const adjectives = ['Lucky', 'Swift', 'Bold', 'Crypto', 'Diamond', 'Golden', 'Mighty', 'Epic']
    const nouns = ['Trader', 'Whale', 'Bull', 'Wolf', 'Dragon', 'Hodler', 'Degen', 'Legend']
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const num = Math.floor(Math.random() * 100)
    return `${adj}${noun}${num}`
  }

  // Initialize credits in localStorage for new users
  const initializeLocalCredits = () => {
    const nickname = generateLocalNickname()
    const newCredits = {
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
    setCredits(newCredits)
    localStorage.setItem('market_credits', JSON.stringify({
      available: 1000,
      total: 1000,
      display_name: nickname,
      timestamp: Date.now()
    }))
    // Also add welcome transaction to localStorage
    const txns = [{
      id: `local_${Date.now()}`,
      transaction_type: 'initial_credits',
      amount: 1000,
      balance_after: 1000,
      description: 'Welcome bonus - 1000 credits!',
      created_at: new Date().toISOString()
    }]
    localStorage.setItem('market_transactions', JSON.stringify(txns))
    setTransactions(txns)
  }

  // Initial fetch (without history)
  useEffect(() => {
    fetchCredits(false)
  }, [fetchCredits])

  // Fetch history when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchCredits(true)
    }
  }, [isOpen, fetchCredits])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Initialize nickname when credits load
  useEffect(() => {
    if (credits?.display_name) {
      setNickname(credits.display_name)
    }
  }, [credits?.display_name])

  // Focus nickname input when editing starts
  useEffect(() => {
    if (isEditingNickname && nicknameInputRef.current) {
      nicknameInputRef.current.focus()
    }
  }, [isEditingNickname])

  // Save nickname
  const handleSaveNickname = async () => {
    if (!userId || savingNickname) return
    
    const trimmedNickname = nickname.trim()
    
    if (trimmedNickname.length < 2) {
      setNicknameError('Nickname must be at least 2 characters')
      return
    }
    
    if (trimmedNickname.length > 20) {
      setNicknameError('Nickname must be 20 characters or less')
      return
    }
    
    // Check for invalid characters
    if (!/^[a-zA-Z0-9_\-.\s]+$/.test(trimmedNickname)) {
      setNicknameError('Only letters, numbers, spaces, and _-. allowed')
      return
    }
    
    setSavingNickname(true)
    setNicknameError(null)
    
    try {
      const response = await fetch('/Rate-Chart/api/market/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          action: 'set_display_name',
          displayName: trimmedNickname
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        setIsEditingNickname(false)
        fetchCredits(false) // Refresh credits to get updated display_name
        // Also update localStorage for quick access
        localStorage.setItem('market_nickname', trimmedNickname)
      } else {
        setNicknameError(data.error || 'Failed to save nickname')
      }
    } catch (err) {
      setNicknameError('Error saving nickname')
    } finally {
      setSavingNickname(false)
    }
  }

  // Cancel nickname editing
  const handleCancelNickname = () => {
    setNickname(credits?.display_name || '')
    setIsEditingNickname(false)
    setNicknameError(null)
  }

  // Claim daily bonus
  const handleClaimBonus = async () => {
    if (!userId || claimingBonus) return
    
    setClaimingBonus(true)
    setBonusMessage(null)
    
    try {
      const response = await fetch('/Rate-Chart/api/market/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'daily_bonus' })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        setBonusMessage(`+${data.bonusAmount} credits claimed!`)
        
        // Save transaction to localStorage so it shows in both views
        const txns = JSON.parse(localStorage.getItem('market_transactions') || '[]')
        txns.unshift({
          id: `bonus_${Date.now()}`,
          transaction_type: 'daily_bonus',
          amount: data.bonusAmount || 100,
          balance_after: (credits?.available_credits || 0) + (data.bonusAmount || 100),
          description: 'Daily bonus claimed!',
          created_at: new Date().toISOString()
        })
        localStorage.setItem('market_transactions', JSON.stringify(txns.slice(0, 50)))
        setTransactions(txns.slice(0, 20))
        
        // Also update local credits cache
        const cached = JSON.parse(localStorage.getItem('market_credits') || '{}')
        cached.available = (cached.available || 0) + (data.bonusAmount || 100)
        cached.total = (cached.total || 0) + (data.bonusAmount || 100)
        cached.timestamp = Date.now()
        localStorage.setItem('market_credits', JSON.stringify(cached))
        
        fetchCredits(true) // Refresh with history
        setTimeout(() => setBonusMessage(null), 3000)
      } else if (data.alreadyClaimed) {
        setBonusMessage('Already claimed today!')
        setTimeout(() => setBonusMessage(null), 3000)
      } else {
        setBonusMessage(data.error || 'Failed to claim')
        setTimeout(() => setBonusMessage(null), 3000)
      }
    } catch (err) {
      setBonusMessage('Error claiming bonus')
      setTimeout(() => setBonusMessage(null), 3000)
    } finally {
      setClaimingBonus(false)
    }
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'bet_placed': return '🎯'
      case 'bet_won': return '🎉'
      case 'bet_lost': return '😢'
      case 'daily_bonus': return '🎁'
      case 'initial_credits': return '🚀'
      case 'referral_bonus': return '👥'
      default: return '💰'
    }
  }

  const getTransactionColor = (type: string, amount: number) => {
    if (amount > 0) return 'text-emerald-400'
    if (amount < 0) return 'text-red-400'
    return 'text-zinc-400'
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-lg border border-zinc-700 animate-pulse">
        <div className="w-4 h-4 bg-zinc-700 rounded" />
        <div className="w-12 h-4 bg-zinc-700 rounded" />
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Credits Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
          isOpen
            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
            : 'bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-white'
        }`}
      >
        <span className="text-sm">💰</span>
        <span className="font-bold tabular-nums text-sm">
          {credits?.available_credits?.toLocaleString() || '1,000'}
        </span>
        <svg 
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border-b border-zinc-700">
            {/* Nickname Section */}
            <div className="mb-3">
              {isEditingNickname ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      ref={nicknameInputRef}
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveNickname()
                        if (e.key === 'Escape') handleCancelNickname()
                      }}
                      placeholder="Enter nickname..."
                      className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded-md text-white text-sm placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                      maxLength={20}
                    />
                    <button
                      onClick={handleSaveNickname}
                      disabled={savingNickname}
                      className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-md text-emerald-400 transition-colors disabled:opacity-50"
                    >
                      {savingNickname ? '...' : '✓'}
                    </button>
                    <button
                      onClick={handleCancelNickname}
                      className="p-1.5 hover:bg-zinc-700 rounded-md text-zinc-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                  {nicknameError && (
                    <div className="text-xs text-red-400">{nicknameError}</div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingNickname(true)}
                  className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors group"
                >
                  <span className="text-lg">👤</span>
                  <span className="font-medium truncate max-w-[150px]">
                    {credits?.display_name || 'Anonymous'}
                  </span>
                  <span className="text-zinc-500 group-hover:text-zinc-400 text-xs">✏️</span>
                </button>
              )}
            </div>
            
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 uppercase tracking-wider">Available Credits</span>
              <button
                onClick={handleClaimBonus}
                disabled={claimingBonus}
                className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-md text-amber-400 text-xs transition-colors disabled:opacity-50"
              >
                <span>🎁</span>
                <span>{claimingBonus ? '...' : 'Daily'}</span>
              </button>
            </div>
            <div className="text-3xl font-black text-emerald-400 tabular-nums">
              {credits?.available_credits?.toLocaleString() || '1,000'}
            </div>
            {bonusMessage && (
              <div className={`mt-2 text-xs ${bonusMessage.includes('+') ? 'text-emerald-400' : 'text-amber-400'}`}>
                {bonusMessage}
              </div>
            )}
          </div>

          {/* Stats */}
          {credits && (
            <div className="grid grid-cols-3 gap-2 p-3 border-b border-zinc-800">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-400 tabular-nums">{credits.total_bets_placed}</div>
                <div className="text-[10px] text-zinc-500 uppercase">Bets</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-400 tabular-nums">{credits.total_bets_won}</div>
                <div className="text-[10px] text-zinc-500 uppercase">Won</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-400 tabular-nums">
                  {credits.total_bets_placed > 0 
                    ? Math.round((credits.total_bets_won / credits.total_bets_placed) * 100) 
                    : 0}%
                </div>
                <div className="text-[10px] text-zinc-500 uppercase">Win Rate</div>
              </div>
            </div>
          )}

          {/* Active Bets */}
          {activeBets.length > 0 && (
            <div className="p-3 border-b border-zinc-800">
              <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Active Bets</div>
              <div className="space-y-2 max-h-24 overflow-y-auto">
                {activeBets.map((bet) => (
                  <div key={bet.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400">🎯</span>
                      <span className="text-zinc-300 truncate max-w-[120px]">{bet.target_username}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-400">{bet.bet_amount} → </span>
                      <span className="text-emerald-400">{Math.round(bet.potential_payout)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transaction History */}
          <div className="p-3">
            <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Recent Activity</div>
            {transactions.length === 0 ? (
              <div className="text-center py-4 text-zinc-500 text-sm">
                No transactions yet
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {transactions.map((tx) => (
                  <div 
                    key={tx.id} 
                    className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{getTransactionIcon(tx.transaction_type)}</span>
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-300 truncate">
                          {tx.description || tx.transaction_type.replace(/_/g, ' ')}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <div className={`text-sm font-bold tabular-nums ${getTransactionColor(tx.transaction_type, tx.amount)}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-zinc-800/30 border-t border-zinc-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">
                Streak: <span className="text-amber-400 font-bold">{credits?.current_streak || 0}</span>
                {credits?.best_streak ? ` (Best: ${credits.best_streak})` : ''}
              </span>
              {credits?.best_win && credits.best_win > 0 && (
                <span className="text-zinc-500">
                  Best win: <span className="text-emerald-400 font-bold">+{credits.best_win}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

