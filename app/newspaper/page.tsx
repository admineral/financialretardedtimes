/**
 * page.tsx (Newspaper Landing Page)
 * 
 * Main landing page for the Financial Retarded Times newspaper.
 * 
 * LOCAL: Orchestrates all newspaper components and manages shared state:
 * - Fetches available dates and BTC market data
 * - Manages date selection and loading states
 * - Coordinates data flow between components
 * 
 * GLOBAL: Primary entry point for the newspaper feature at /newspaper.
 * Renders the full newspaper layout with header, navigation, content areas,
 * and footer. All AI-generated content flows through this page.
 * 
 * ROUTE: /newspaper
 * 
 * STATE:
 * - availableDates: DateStats[] - Available chat archive dates
 * - selectedDate: string | null - Currently selected date
 * - btcData: BTCData | null - Live Bitcoin market data
 * - isLoading: boolean - Content generation loading state
 * - newspaperData: UnifiedNewspaperData - Shared AI-generated content
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { SparklesIcon } from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  NewspaperContent,
  NewspaperSidebar,
  ShortNewsSidebar,
  DateTimeline,
  ChatSection,
} from './components'
import { FearGreedWidget } from '@/app/test-fg/components'
import type { CacheInfo } from './components'
import type { DayRange } from './components/DateTimeline'
import type { DateStats, UnifiedNewspaperData } from './lib/types'

/**
 * BTC Market Data Interface
 * Displayed in the masthead ticker
 */
interface BTCData {
  price: number
  change24h: number
  change7d: number
  change30d: number
  high24h: number
  low24h: number
  ath: number
}

/**
 * CurrentDate Component
 * Displays the current date in German format
 */
function CurrentDate() {
  const [date, setDate] = useState<string>('')
  
  useEffect(() => {
    const now = new Date()
    setDate(now.toLocaleDateString('de-DE', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }))
  }, [])
  
  return <span>{date || 'Loading...'}</span>
}

/**
 * Format time ago in German
 */
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'gerade eben'
  if (diffMins < 60) return `vor ${diffMins}m`
  if (diffHours < 24) return `vor ${diffHours}h ${diffMins % 60}m`
  return `vor ${diffDays}d ${diffHours % 24}h`
}

/**
 * Main Newspaper Page Component
 */
export default function NewspaperPage() {
  // Date selection state
  const [availableDates, setAvailableDates] = useState<DateStats[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [dayRange, setDayRange] = useState<DayRange>(1)
  const [isLoadingDates, setIsLoadingDates] = useState(true)
  const [cumulativeUsers, setCumulativeUsers] = useState<Record<number, number> | undefined>(undefined)
  
  // Market data state
  const [btcData, setBtcData] = useState<BTCData | null>(null)
  
  // Content loading state
  const [isLoading, setIsLoading] = useState(false)
  
  // Refresh key to force content regeneration
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Shared newspaper data (for sidebar synchronization)
  const [newspaperData, setNewspaperData] = useState<Partial<UnifiedNewspaperData> | undefined>(undefined)
  
  // Cache info for displaying version and time
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null)

  /**
   * Fetch BTC market data from CoinGecko
   * Refreshes every 60 seconds
   */
  useEffect(() => {
    const fetchBTC = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false'
        )
        if (response.ok) {
          const data = await response.json()
          setBtcData({
            price: data.market_data.current_price.usd,
            change24h: data.market_data.price_change_percentage_24h,
            change7d: data.market_data.price_change_percentage_7d,
            change30d: data.market_data.price_change_percentage_30d,
            high24h: data.market_data.high_24h.usd,
            low24h: data.market_data.low_24h.usd,
            ath: data.market_data.ath.usd
          })
        }
      } catch (err) {
        console.error('Failed to fetch BTC data:', err)
      }
    }
    
    fetchBTC()
    const interval = setInterval(fetchBTC, 60000)
    return () => clearInterval(interval)
  }, [])

  /**
   * Fetch available dates from the API
   * Runs once on mount
   */
  useEffect(() => {
    const fetchDates = async () => {
      try {
        const response = await fetch('/newspaper/api/available-dates')
        if (response.ok) {
          const data = await response.json()
          setAvailableDates(data.dates || [])
          // Store cumulative users for deduplicated multi-day stats
          if (data.cumulativeUsers) {
            setCumulativeUsers(data.cumulativeUsers)
          }
          // Auto-select the most recent date
          if (data.dates && data.dates.length > 0) {
            setSelectedDate(data.dates[0].date)
          }
        }
      } catch (err) {
        console.error('Failed to fetch available dates:', err)
      } finally {
        setIsLoadingDates(false)
      }
    }
    fetchDates()
  }, [])

  // Callbacks for child component communication
  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date)
    // When selecting a new date, reset to single day if currently on multi-day
    if (dayRange === 1) {
      setSelectedDates([date])
    }
  }, [dayRange])
  
  const handleDayRangeChange = useCallback((days: DayRange, dates: string[]) => {
    setDayRange(days)
    setSelectedDates(dates)
  }, [])

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsLoading(loading)
  }, [])
  
  const handleDataChange = useCallback((data: Partial<UnifiedNewspaperData> | undefined) => {
    setNewspaperData(data)
  }, [])
  
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])
  
  const handleCacheInfoChange = useCallback((info: CacheInfo | null) => {
    setCacheInfo(info)
  }, [])

  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-foreground/10 py-2">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center text-xs text-muted-foreground">
          <CurrentDate />
          <div className="flex items-center gap-4">
            {/* Cache Info */}
            {cacheInfo && !isLoading && (
              <span className="hidden md:flex items-center gap-1.5 text-muted-foreground/70">
                <span className={cacheInfo.isFromCache ? 'text-emerald-600' : 'text-amber-600'}>
                  {cacheInfo.dayRange}d
                </span>
                <span>•</span>
                <span>{formatTimeAgo(cacheInfo.updatedAt)}</span>
                {cacheInfo.isFromCache && <span className="text-emerald-600/60">(cache)</span>}
              </span>
            )}
            <span className="hidden sm:inline">Vol. 1 • No. 1</span>
            {isLoading && (
              <span className="flex items-center gap-1.5 text-amber-600">
                <SparklesIcon className="h-3 w-3 animate-pulse" />
                <span className="hidden sm:inline">Chat-Kurator...</span>
              </span>
            )}
            <ThemeSwitcher />
          </div>
        </div>
      </div>

      {/* Masthead */}
      <header className="w-full py-4 sm:py-6 border-b-4 border-double border-foreground/60">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 text-center">
          <Link href="/newspaper" className="inline-block">
            <h1 className="font-masthead text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-wide text-foreground hover:text-primary transition-colors">
              Financial Retarded Times
            </h1>
          </Link>
          <p className="font-headline text-[10px] sm:text-xs md:text-sm lg:text-base tracking-[0.2em] sm:tracking-[0.3em] uppercase text-muted-foreground mt-1 sm:mt-2">
            Community Edition • Chat-Highlights & Diskussionen
          </p>
          
          {/* BTC Price Ticker */}
          {btcData && (
            <div className="mt-3 sm:mt-4 flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded">
                <span className="text-amber-500 font-bold text-sm sm:text-base">₿</span>
                <span className="font-mono font-semibold text-sm sm:text-base">
                  ${btcData.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs font-mono">
                <span className={`px-1.5 py-0.5 rounded ${btcData.change24h >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  24h: {btcData.change24h >= 0 ? '+' : ''}{btcData.change24h.toFixed(1)}%
                </span>
                <span className={`px-1.5 py-0.5 rounded ${btcData.change7d >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  7d: {btcData.change7d >= 0 ? '+' : ''}{btcData.change7d.toFixed(1)}%
                </span>
                <span className={`hidden sm:inline px-1.5 py-0.5 rounded ${btcData.change30d >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  30d: {btcData.change30d >= 0 ? '+' : ''}{btcData.change30d.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Date Timeline with integrated navigation */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
        <DateTimeline 
          availableDates={availableDates}
          selectedDate={selectedDate}
          isLoadingDates={isLoadingDates}
          isLoading={isLoading}
          onDateSelect={handleDateSelect}
          onDayRangeChange={handleDayRangeChange}
          onRefresh={handleRefresh}
          cumulativeUsers={cumulativeUsers}
        />
      </div>

      {/* Main Content Grid */}
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          
          {/* Left Sidebar */}
          <NewspaperSidebar 
            data={newspaperData} 
            isLoading={isLoading} 
          />

          {/* Main Content */}
          <main className="lg:col-span-7">
            {/* AI-Generated Newspaper Content */}
            <NewspaperContent 
              selectedDate={selectedDate}
              selectedDates={selectedDates}
              dayRange={dayRange}
              onLoadingChange={handleLoadingChange}
              onDataChange={handleDataChange}
              onCacheInfoChange={handleCacheInfoChange}
              forceRefresh={refreshKey}
            />
          </main>

          {/* Right Sidebar */}
          <aside className="lg:col-span-3">
            <div className="sticky top-20">
              {/* Fear & Greed Index */}
              <div className="p-4 border-2 border-foreground/20 bg-muted/30">
                <FearGreedWidget autoStart />
              </div>

              {/* Short News */}
              <div className="mt-6">
                <ShortNewsSidebar 
                  data={newspaperData} 
                  isLoading={isLoading} 
                />
              </div>

              {/* Live Chat */}
              <ChatSection />

              {/* Newsletter Signup */}
              <div className="mt-6 p-4 border-2 border-foreground/20 bg-muted/30">
                <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-2">
                  Newsletter
                </h4>
                <p className="text-xs text-muted-foreground font-body mb-3">
                  Die wichtigsten Chat-Highlights direkt in Ihr Postfach.
                </p>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    placeholder="E-Mail Adresse" 
                    className="flex-1 px-3 py-1.5 text-xs font-body bg-background border border-foreground/20 focus:outline-none focus:border-primary/50"
                  />
                  <button className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-headline tracking-wide hover:bg-primary/90 transition-colors">
                    OK
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t-2 border-foreground/20 mt-8 sm:mt-12">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
          {/* Links Row */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4 text-sm font-body">
            <span className="text-muted-foreground">Rubriken:</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Diskussionen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Analysen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Meinungen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Highlights</span>
            <span className="text-foreground/30">|</span>
            <span className="text-muted-foreground">Community:</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Top Beitragende</span>
          </div>
          
          {/* Copyright */}
          <div className="text-center text-xs text-muted-foreground font-body">
            <p>© 2025 Financial Retarded Times • „Keine Finanzberatung – nur Entertainment"</p>
          </div>
        </div>
      </footer>
    </main>
  )
}

