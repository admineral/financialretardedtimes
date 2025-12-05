/**
 * page.tsx (Newspaper Landing Page)
 * 
 * REDESIGNED: Premium Dark Edition
 * A dramatic, cinematic newspaper experience with gold accents
 * 
 * Features:
 * - Live BTC ticker with animated price display
 * - Glassmorphism cards with depth
 * - Gold accent color scheme
 * - Staggered reveal animations
 * - Responsive newspaper grid
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { SparklesIcon, TrendingUp, TrendingDown, Zap, Newspaper } from 'lucide-react'
import { track } from '@vercel/analytics'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  NewspaperContent,
  NewspaperSidebar,
  ShortNewsSidebar,
  DateTimeline,
  ChatSection,
  NewspaperTimeline,
  AvatarProvider,
} from './components'
import { ChatHistoryTimeline } from '@/app/test-timeline/components'
import { FearGreedWidget } from '@/app/test-fg/components'
import type { CacheInfo } from './components'
import type { DayRange } from './components/DateTimeline'
import type { DateStats, UnifiedNewspaperData } from './lib/types'

interface BTCData {
  price: number
  change24h: number
  change7d: number
  change30d: number
  high24h: number
  low24h: number
  ath: number
  cachedAt: number
}

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
  
  return <span className="text-muted-foreground">{date || '...'}</span>
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'gerade eben'
  if (diffMins < 60) return `vor ${diffMins}m`
  if (diffHours < 24) return `vor ${diffHours}h`
  return `vor ${diffDays}d`
}

/**
 * Animated BTC Price Display
 */
function BTCPriceTicker({ btcData }: { btcData: BTCData | null }) {
  if (!btcData) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        <div className="w-24 h-8 bg-muted/50 rounded" />
        <div className="w-16 h-6 bg-muted/50 rounded" />
      </div>
    )
  }

  const isPositive = btcData.change24h >= 0

  return (
    <div className="flex items-center gap-4">
      {/* Main Price */}
      <div className="flex items-center gap-2">
        <span className="text-2xl sm:text-3xl font-bold gold-text font-mono tracking-tight">
          ${btcData.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
        <div className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-mono font-semibold ${
          isPositive 
            ? 'bg-emerald-500/20 text-emerald-400' 
            : 'bg-red-500/20 text-red-400'
        }`}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {isPositive ? '+' : ''}{btcData.change24h.toFixed(2)}%
        </div>
      </div>
      
      {/* Extended Stats */}
      <div className="hidden lg:flex items-center gap-3 text-xs font-mono text-muted-foreground border-l border-primary/20 pl-4">
        <span className={btcData.change7d >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>
          7d: {btcData.change7d >= 0 ? '+' : ''}{btcData.change7d.toFixed(1)}%
        </span>
        <span className={btcData.change30d >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>
          30d: {btcData.change30d >= 0 ? '+' : ''}{btcData.change30d.toFixed(1)}%
        </span>
        <span className="text-muted-foreground/60">
          ATH: ${btcData.ath.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  )
}

export default function NewspaperPage() {
  const [availableDates, setAvailableDates] = useState<DateStats[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [dayRange, setDayRange] = useState<DayRange>(1)
  const [isLoadingDates, setIsLoadingDates] = useState(true)
  const [cumulativeUsers, setCumulativeUsers] = useState<Record<number, number> | undefined>(undefined)
  const [btcData, setBtcData] = useState<BTCData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [newspaperData, setNewspaperData] = useState<Partial<UnifiedNewspaperData> | undefined>(undefined)
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null)

  useEffect(() => {
    track('newspaper_page_view', { source: 'direct' })
  }, [])

  useEffect(() => {
    const fetchBTC = async () => {
      try {
        const response = await fetch('/newspaper/api/btc-price')
        if (response.ok) {
          const data = await response.json()
          if (!data.error) setBtcData(data)
        }
      } catch (err) {
        console.error('Failed to fetch BTC data:', err)
      }
    }
    fetchBTC()
    const interval = setInterval(fetchBTC, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchDates = async () => {
      try {
        const response = await fetch('/newspaper/api/available-dates')
        if (response.ok) {
          const data = await response.json()
          setAvailableDates(data.dates || [])
          if (data.cumulativeUsers) setCumulativeUsers(data.cumulativeUsers)
          if (data.dates && data.dates.length > 0) setSelectedDate(data.dates[0].date)
        }
      } catch (err) {
        console.error('Failed to fetch available dates:', err)
      } finally {
        setIsLoadingDates(false)
      }
    }
    fetchDates()
  }, [])

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date)
    if (dayRange === 1) setSelectedDates([date])
    track('newspaper_date_select', { date, dayRange, source: 'timeline' })
  }, [dayRange])
  
  const handleDayRangeChange = useCallback((days: DayRange, dates: string[]) => {
    setDayRange(days)
    setSelectedDates(dates)
    track('newspaper_day_range_change', { dayRange: days, datesCount: dates.length })
  }, [])

  const handleLoadingChange = useCallback((loading: boolean) => setIsLoading(loading), [])
  const handleDataChange = useCallback((data: Partial<UnifiedNewspaperData> | undefined) => setNewspaperData(data), [])
  
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
    track('newspaper_refresh', { selectedDate: selectedDate || 'none', dayRange })
  }, [selectedDate, dayRange])
  
  const handleCacheInfoChange = useCallback((info: CacheInfo | null) => setCacheInfo(info), [])

  return (
    <AvatarProvider>
      <main className="min-h-screen bg-background relative">
        {/* Subtle gradient background - z-0 to stay behind content */}
        <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />
        
        {/* Hero Masthead Section */}
        <header className="relative border-b border-primary/20 z-10">
          {/* Top utility bar */}
          <div className="w-full border-b border-primary/10 bg-card/50 backdrop-blur-sm">
            <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-between items-center">
              <div className="flex items-center gap-3 text-xs">
                <CurrentDate />
                {cacheInfo && !isLoading && (
                  <span className="hidden md:flex items-center gap-1.5 text-muted-foreground/60 border-l border-primary/20 pl-3">
                    <span className="text-primary">{cacheInfo.dayRange}d</span>
                    <span>•</span>
                    <span>{formatTimeAgo(cacheInfo.updatedAt)}</span>
                    {cacheInfo.isFromCache && <span className="text-emerald-500/60">(cache)</span>}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isLoading && (
                  <span className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
                    <SparklesIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Kuratiere...</span>
                  </span>
                )}
                <ThemeSwitcher />
              </div>
            </div>
          </div>

          {/* Main Masthead */}
          <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              {/* Title Section */}
              <div className="text-center lg:text-left">
                <Link href="/newspaper" className="inline-block group">
                  <div className="flex items-center justify-center lg:justify-start gap-3 mb-2">
                    <Newspaper className="w-8 h-8 text-primary opacity-60" />
                    <div className="h-px w-12 bg-gradient-to-r from-primary/60 to-transparent" />
                  </div>
                  <h1 className="font-masthead text-4xl sm:text-5xl md:text-6xl lg:text-7xl gold-text tracking-wide transition-all duration-300 group-hover:tracking-wider">
                    Financial Retarded Times
                  </h1>
                </Link>
                <div className="flex items-center justify-center lg:justify-start gap-4 mt-3">
                  <p className="text-xs sm:text-sm tracking-[0.2em] uppercase text-muted-foreground/60 font-headline">
                    Community Edition
                  </p>
                  <span className="text-primary/40">•</span>
                  <p className="text-xs sm:text-sm tracking-[0.15em] uppercase text-muted-foreground/60 font-headline">
                    Chat-Highlights & Analysen
                  </p>
                </div>
              </div>

              {/* BTC Price Section */}
              <div className="flex justify-center lg:justify-end">
                <div className="glass-card-gold px-6 py-4 rounded-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">₿</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Bitcoin</span>
                    {btcData?.cachedAt && (
                      <span className="text-[10px] text-muted-foreground/40 font-mono ml-auto">
                        {new Date(btcData.cachedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span className={`w-2 h-2 rounded-full bg-emerald-500 animate-pulse ${!btcData?.cachedAt ? 'ml-auto' : ''}`} />
                  </div>
                  <BTCPriceTicker btcData={btcData} />
                </div>
              </div>
            </div>
          </div>

          {/* Golden rule */}
          <div className="newspaper-rule-gold" />
        </header>

        {/* Date Navigation - Sticky */}
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-primary/10">
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

        {/* Chat Activity Timeline - Always visible for dayRange 1 */}
        {dayRange === 1 && (
          <div className="w-full border-b border-primary/10 bg-card/30 relative z-10">
            <ChatHistoryTimeline autoStart compact />
          </div>
        )}

        {/* Main Content Area */}
        <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            
            {/* Left Sidebar - Contributors & Topics */}
            <aside className="lg:col-span-2 hidden lg:block">
              <div className="sticky top-24">
                <NewspaperSidebar 
                  data={newspaperData} 
                  isLoading={isLoading}
                  selectedDate={selectedDate}
                  selectedDates={selectedDates}
                />
              </div>
            </aside>

            {/* Main Content Column */}
            <main className="lg:col-span-7">
              {/* Section Header */}
              <div className="flex items-center gap-4 mb-8">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <h2 className="font-headline text-lg uppercase tracking-wider text-foreground">
                    Tages-Highlights
                  </h2>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-primary/40 to-transparent" />
              </div>

              {/* AI-Generated Content */}
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
              <div className="sticky top-24 space-y-6">
                {/* Fear & Greed Index */}
                <div className="glass-card-gold p-5 rounded-sm">
                  <FearGreedWidget autoStart />
                </div>

                {/* Short News */}
                <ShortNewsSidebar 
                  data={newspaperData} 
                  isLoading={isLoading} 
                />

                {/* Live Chat */}
                <ChatSection />

                {/* Newsletter Signup */}
                <div className="glass-card p-5 rounded-sm">
                  <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-3 gold-text">
                    Newsletter
                  </h4>
                  <p className="text-xs text-muted-foreground font-body mb-4 leading-relaxed">
                    Die wichtigsten Chat-Highlights direkt in Ihr Postfach. Täglich kuratiert.
                  </p>
                  <div className="flex gap-2">
                    <input 
                      type="email" 
                      placeholder="E-Mail Adresse" 
                      className="flex-1 px-3 py-2 text-xs font-body bg-background/50 border border-primary/20 focus:outline-none focus:border-primary/50 transition-colors rounded-sm"
                    />
                    <button 
                      onClick={() => track('newspaper_newsletter_click', { location: 'sidebar' })}
                      className="px-4 py-2 bg-primary text-primary-foreground text-xs font-headline font-semibold tracking-wide hover:bg-primary/90 transition-all rounded-sm hover:shadow-lg hover:shadow-primary/20"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Older Editions Section */}
        {dayRange === 1 && !isLoading && (
          <section className="border-t-2 border-primary/20 mt-12 bg-card/30 relative z-10">
            <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
              {/* Section Header */}
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-4 mb-4">
                  <div className="w-16 h-px bg-gradient-to-r from-transparent to-primary/40" />
                  <Newspaper className="w-6 h-6 text-primary/60" />
                  <div className="w-16 h-px bg-gradient-to-l from-transparent to-primary/40" />
                </div>
                <h2 className="font-masthead text-3xl sm:text-4xl gold-text mb-3">
                  Ältere Ausgaben
                </h2>
                <p className="text-sm text-muted-foreground font-body max-w-md mx-auto">
                  Stöbern Sie durch die Archive vergangener Tage
                </p>
              </div>
              
              {/* Timeline */}
              <div className="max-w-5xl mx-auto">
                <NewspaperTimeline currentDate={selectedDate} />
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-primary/20 bg-card/50 mt-auto relative z-10">
          <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Navigation Links */}
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-6">
              <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Rubriken:</span>
              {['Diskussionen', 'Analysen', 'Meinungen', 'Highlights'].map((item) => (
                <span 
                  key={item}
                  onClick={() => track('newspaper_nav_click', { section: item.toLowerCase() })}
                  className="text-sm text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                >
                  {item}
                </span>
              ))}
              <span className="text-primary/20">|</span>
              <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Community:</span>
              <span 
                onClick={() => track('newspaper_nav_click', { section: 'top_beitragende' })}
                className="text-sm text-muted-foreground hover:text-primary cursor-pointer transition-colors"
              >
                Top Beitragende
              </span>
            </div>
            
            {/* Copyright */}
            <div className="text-center">
              <div className="inline-flex items-center gap-3 text-xs text-muted-foreground/50">
                <span>© 2024-2025 Financial Retarded Times</span>
                <span className="text-primary/30">•</span>
                <span className="italic">„Keine Finanzberatung – nur Entertainment"</span>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </AvatarProvider>
  )
}
