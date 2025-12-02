'use client'

import { useEffect, useState, memo, useCallback } from 'react'
import { ThemeSwitcher } from "@/components/theme-switcher"
import { GuestbookChat } from "@/components/guestbook-chat"
import Link from "next/link"
import { RefreshCwIcon, SparklesIcon } from 'lucide-react'
import {
  ReporterSection,
  DramaSection,
  MemeSection,
  AnalystSection,
  LeftSidebar,
  DateTimeline,
  ShortNewsSection,
  type DateStats,
  type ReporterData,
  type MemeData,
} from './components/newspaper'

// Memoized Chat Section to prevent re-renders during AI streaming
const ChatSection = memo(function ChatSection() {
  return (
    <div className="border-2 border-foreground/30 bg-card">
      <div className="px-4 py-3 border-b-2 border-foreground/30 bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider">Live-Ticker</h3>
            <p className="text-[10px] text-muted-foreground font-body">Echtzeit Community Chat</p>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            LIVE
          </span>
        </div>
      </div>
      <GuestbookChat />
    </div>
  )
})

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

// BTC Market Data interface
interface BTCData {
  price: number
  change24h: number
  change7d: number
  change30d: number
  high24h: number
  low24h: number
  ath: number
}

export default function Home() {
  const [availableDates, setAvailableDates] = useState<DateStats[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [isLoadingDates, setIsLoadingDates] = useState(true)
  const [btcData, setBtcData] = useState<BTCData | null>(null)
  
  // Track loading states from each section independently
  const [loadingStates, setLoadingStates] = useState({
    reporter: false,
    drama: false,
    meme: false,
    analyst: false
  })
  
  // Track reporter data for sidebar
  const [reporterData, setReporterData] = useState<Partial<ReporterData> | undefined>(undefined)
  
  // Track meme data for sidebar short news (shared from MemeSection)
  const [memeData, setMemeData] = useState<Partial<MemeData> | undefined>(undefined)
  
  // Calculate active editors count
  const activeEditors = Object.values(loadingStates).filter(Boolean).length
  const isAnyLoading = activeEditors > 0

  // Fetch BTC data
  useEffect(() => {
    const fetchBTC = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false')
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

  // Fetch available dates
  useEffect(() => {
    const fetchDates = async () => {
      try {
        const response = await fetch('/Test/admin/api/available-dates')
        if (response.ok) {
          const data = await response.json()
          setAvailableDates(data.dates || [])
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

  // Handle date selection - each section will auto-regenerate when date changes
  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date)
  }, [])

  // Callbacks for loading state updates
  const handleReporterLoading = useCallback((isLoading: boolean) => {
    setLoadingStates(prev => ({ ...prev, reporter: isLoading }))
  }, [])
  
  const handleDramaLoading = useCallback((isLoading: boolean) => {
    setLoadingStates(prev => ({ ...prev, drama: isLoading }))
  }, [])
  
  const handleMemeLoading = useCallback((isLoading: boolean) => {
    setLoadingStates(prev => ({ ...prev, meme: isLoading }))
  }, [])
  
  const handleAnalystLoading = useCallback((isLoading: boolean) => {
    setLoadingStates(prev => ({ ...prev, analyst: isLoading }))
  }, [])
  
  // Callback for reporter data (for sidebar)
  const handleReporterData = useCallback((data: Partial<ReporterData> | undefined) => {
    setReporterData(data)
  }, [])
  
  // Callback for meme data (for sidebar short news)
  const handleMemeData = useCallback((data: Partial<MemeData> | undefined) => {
    setMemeData(data)
  }, [])

  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-foreground/10 py-2">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center text-xs text-muted-foreground">
          <CurrentDate />
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">Vol. 1 • No. 1</span>
            {isAnyLoading && (
              <span className="flex items-center gap-1.5 text-amber-600">
                <SparklesIcon className="h-3 w-3 animate-pulse" />
                <span className="hidden sm:inline">{activeEditors}/4 Redakteure...</span>
              </span>
            )}
            <ThemeSwitcher />
          </div>
        </div>
      </div>

      {/* Masthead */}
      <header className="w-full py-4 sm:py-6 border-b-4 border-double border-foreground/60">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 text-center">
          <Link href="/" className="inline-block">
            <h1 className="font-masthead text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-wide text-foreground hover:text-primary transition-colors">
              Financial Retarded Times
            </h1>
          </Link>
          <p className="font-headline text-[10px] sm:text-xs md:text-sm lg:text-base tracking-[0.2em] sm:tracking-[0.3em] uppercase text-muted-foreground mt-1 sm:mt-2">
            Tradingview Edition • Die Stimme des Krypto-Chats
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

      {/* Navigation */}
      <nav className="w-full border-b border-foreground/20 py-2 sm:py-3 sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex gap-3 sm:gap-4 md:gap-6 font-headline text-xs sm:text-sm tracking-wide">
            <Link href="/Rate-Chart" className="hover:text-primary transition-colors font-semibold">Rate-Chart</Link>
            <Link href="/Test" className="hover:text-primary transition-colors">Chat</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <input 
              type="text" 
              placeholder="Suchen..." 
              className="hidden lg:block px-3 py-1.5 text-sm border border-foreground/20 bg-transparent rounded-sm font-body focus:outline-none focus:border-primary/50 w-40"
            />
            <button 
              disabled={isAnyLoading}
              className="px-2 sm:px-4 py-1 sm:py-1.5 bg-primary text-primary-foreground text-xs sm:text-sm font-headline tracking-wide hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isAnyLoading ? (
                <><RefreshCwIcon className="h-3 w-3 animate-spin" /> <span className="hidden sm:inline">GENERATING</span></>
              ) : (
                <><SparklesIcon className="h-3 w-3" /> REFRESH</>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Date Timeline */}
      <DateTimeline 
        availableDates={availableDates}
        selectedDate={selectedDate}
        isLoadingDates={isLoadingDates}
        isLoading={isAnyLoading}
        onDateSelect={handleDateSelect}
      />

      {/* Main Content Grid */}
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          
          {/* Left Sidebar - Uses reporter data */}
          <LeftSidebar 
            reporterData={reporterData} 
            isLoading={loadingStates.reporter} 
          />

          {/* Main Content */}
          <main className="lg:col-span-7">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6 pb-2 border-b-2 border-foreground/60">
              <h2 className="font-headline text-xl sm:text-2xl font-bold">Titelseite</h2>
              <div className="flex gap-1 sm:gap-2 text-[10px] sm:text-xs font-headline">
                <button className="px-2 sm:px-3 py-1 border border-foreground/40 hover:bg-muted transition-colors">NEUESTE</button>
                <button className="px-2 sm:px-3 py-1 border border-foreground/20 hover:bg-muted transition-colors text-muted-foreground hidden sm:block">TRENDING</button>
                <button className="px-2 sm:px-3 py-1 border border-foreground/20 hover:bg-muted transition-colors text-muted-foreground hidden sm:block">VERIFIZIERT</button>
              </div>
            </div>

            {/* Reporter Section - Featured & Secondary Articles */}
            <ReporterSection 
              selectedDate={selectedDate}
              onLoadingChange={handleReporterLoading}
              onDataChange={handleReporterData}
            />

            {/* Drama Section - Third Article & Events */}
            <DramaSection 
              selectedDate={selectedDate}
              onLoadingChange={handleDramaLoading}
            />

            {/* Meme Section - More Articles (also provides data for sidebar) */}
            <MemeSection 
              selectedDate={selectedDate}
              onLoadingChange={handleMemeLoading}
              onDataChange={handleMemeData}
            />

            {/* Analyst Section - Highlights */}
            <AnalystSection 
              selectedDate={selectedDate}
              onLoadingChange={handleAnalystLoading}
            />
          </main>

          {/* Right Sidebar - Chat */}
          <aside className="lg:col-span-3">
            <div className="sticky top-20">
              {/* Short News - uses meme data from MemeSection */}
              <ShortNewsSection 
                data={memeData} 
                isLoading={loadingStates.meme} 
              />

              {/* Chat Section */}
              <ChatSection />

              {/* Newsletter */}
              <div className="mt-6 p-4 border-2 border-foreground/20 bg-muted/30">
                <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-2">Newsletter</h4>
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
            <span className="hover:text-primary cursor-pointer transition-colors">Analysen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Meinungen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Kultur</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Marktstruktur</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Altcoins</span>
            <span className="text-foreground/30">|</span>
            <span className="text-muted-foreground">Community:</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Top Autoren</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Leaderboard</span>
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
