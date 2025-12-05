/**
 * HistoricTimeline.tsx
 * 
 * A beautiful horizontal timeline component for historic events.
 * 
 * LOCAL: Displays a scrollable horizontal timeline with events,
 * images, and descriptions. Supports different event types with
 * distinct styling.
 * 
 * GLOBAL: Reusable component that can be integrated into any page.
 * Perfect for showing Bitcoin/crypto history, market events, etc.
 * 
 * EXPORTS: HistoricTimeline (React component)
 */

'use client'

import { useRef, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Zap, TrendingUp, TrendingDown, AlertTriangle, Award, Globe } from 'lucide-react'

// Event types for different styling
export type EventType = 'milestone' | 'bullish' | 'bearish' | 'crisis' | 'adoption' | 'regulation'

export interface TimelineEvent {
  id: string
  date: string // Display date (e.g., "Jan 2009", "Nov 2021")
  year: number // For sorting
  title: string
  description: string
  type: EventType
  image?: string // Optional image URL
  price?: string // Optional BTC price at time
}

interface HistoricTimelineProps {
  events?: TimelineEvent[]
  title?: string
  className?: string
}

// Default crypto history events
const DEFAULT_EVENTS: TimelineEvent[] = [
  {
    id: '1',
    date: 'Jan 2009',
    year: 2009,
    title: 'Bitcoin Genesis Block',
    description: 'Satoshi Nakamoto mines the first Bitcoin block, embedding the headline "Chancellor on brink of second bailout for banks"',
    type: 'milestone',
    price: '$0'
  },
  {
    id: '2',
    date: 'Mai 2010',
    year: 2010,
    title: 'Pizza Day',
    description: 'Laszlo Hanyecz kauft 2 Pizzen für 10.000 BTC - die erste reale Bitcoin-Transaktion',
    type: 'milestone',
    price: '$0.0025'
  },
  {
    id: '3',
    date: 'Feb 2011',
    year: 2011,
    title: 'BTC = $1',
    description: 'Bitcoin erreicht zum ersten Mal Parität mit dem US-Dollar',
    type: 'bullish',
    price: '$1'
  },
  {
    id: '4',
    date: 'Jun 2011',
    year: 2011,
    title: 'Mt. Gox Hack',
    description: 'Erste große Exchange wird gehackt - 850.000 BTC gestohlen über die Jahre',
    type: 'crisis',
    price: '$31'
  },
  {
    id: '5',
    date: 'Nov 2013',
    year: 2013,
    title: 'Erster $1.000',
    description: 'Bitcoin durchbricht erstmals die $1.000-Marke',
    type: 'bullish',
    price: '$1,000'
  },
  {
    id: '6',
    date: 'Feb 2014',
    year: 2014,
    title: 'Mt. Gox Kollaps',
    description: 'Mt. Gox meldet Insolvenz an - größter Krypto-Skandal der Geschichte',
    type: 'crisis',
    price: '$550'
  },
  {
    id: '7',
    date: 'Jul 2016',
    year: 2016,
    title: '2. Halving',
    description: 'Block Reward halbiert sich von 25 auf 12.5 BTC',
    type: 'milestone',
    price: '$650'
  },
  {
    id: '8',
    date: 'Aug 2017',
    year: 2017,
    title: 'SegWit & BCH Fork',
    description: 'Bitcoin aktiviert SegWit, Bitcoin Cash spaltet sich ab',
    type: 'milestone',
    price: '$4,000'
  },
  {
    id: '9',
    date: 'Dez 2017',
    year: 2017,
    title: 'ATH $20.000',
    description: 'Bitcoin erreicht fast $20.000 - Mainstream-Medien berichten weltweit',
    type: 'bullish',
    price: '$19,783'
  },
  {
    id: '10',
    date: 'Dez 2018',
    year: 2018,
    title: 'Krypto-Winter',
    description: 'Bitcoin fällt auf $3.200 - 84% vom ATH, viele geben auf',
    type: 'bearish',
    price: '$3,200'
  },
  {
    id: '11',
    date: 'Mai 2020',
    year: 2020,
    title: '3. Halving',
    description: 'Block Reward halbiert sich auf 6.25 BTC während Corona-Pandemie',
    type: 'milestone',
    price: '$8,800'
  },
  {
    id: '12',
    date: 'Aug 2020',
    year: 2020,
    title: 'MicroStrategy kauft',
    description: 'MicroStrategy wird erstes börsennotiertes Unternehmen mit BTC-Treasury',
    type: 'adoption',
    price: '$11,800'
  },
  {
    id: '13',
    date: 'Feb 2021',
    year: 2021,
    title: 'Tesla kauft BTC',
    description: 'Tesla investiert $1.5 Mrd. in Bitcoin, akzeptiert BTC als Zahlungsmittel',
    type: 'adoption',
    price: '$48,000'
  },
  {
    id: '14',
    date: 'Apr 2021',
    year: 2021,
    title: 'Coinbase IPO',
    description: 'Coinbase geht an die Börse - $86 Mrd. Bewertung',
    type: 'adoption',
    price: '$64,000'
  },
  {
    id: '15',
    date: 'Sep 2021',
    year: 2021,
    title: 'El Salvador',
    description: 'El Salvador macht Bitcoin zum gesetzlichen Zahlungsmittel',
    type: 'adoption',
    price: '$45,000'
  },
  {
    id: '16',
    date: 'Nov 2021',
    year: 2021,
    title: 'ATH $69.000',
    description: 'Bitcoin erreicht Allzeithoch bei $69.044',
    type: 'bullish',
    price: '$69,044'
  },
  {
    id: '17',
    date: 'Mai 2022',
    year: 2022,
    title: 'LUNA/UST Crash',
    description: 'Terra/LUNA kollabiert - $60 Mrd. vernichtet, Contagion beginnt',
    type: 'crisis',
    price: '$30,000'
  },
  {
    id: '18',
    date: 'Nov 2022',
    year: 2022,
    title: 'FTX Kollaps',
    description: 'FTX meldet Insolvenz - SBF verhaftet, $8 Mrd. Kundengeld weg',
    type: 'crisis',
    price: '$16,000'
  },
  {
    id: '19',
    date: 'Jan 2024',
    year: 2024,
    title: 'Spot ETFs',
    description: 'SEC genehmigt Bitcoin Spot ETFs - Institutionelles Kapital fließt',
    type: 'adoption',
    price: '$46,000'
  },
  {
    id: '20',
    date: 'Apr 2024',
    year: 2024,
    title: '4. Halving',
    description: 'Block Reward halbiert sich auf 3.125 BTC',
    type: 'milestone',
    price: '$64,000'
  },
  {
    id: '21',
    date: 'Nov 2024',
    year: 2024,
    title: 'Trump gewinnt',
    description: 'Pro-Krypto Präsident gewählt - BTC steigt auf neue ATHs',
    type: 'bullish',
    price: '$75,000'
  },
  {
    id: '22',
    date: 'Dez 2024',
    year: 2024,
    title: '$100K durchbrochen',
    description: 'Bitcoin durchbricht erstmals die psychologische $100.000-Marke',
    type: 'bullish',
    price: '$100,000'
  }
]

// Get icon and colors for event type
function getEventStyle(type: EventType) {
  switch (type) {
    case 'milestone':
      return {
        icon: Award,
        bg: 'bg-amber-500/20',
        border: 'border-amber-500/50',
        text: 'text-amber-500',
        glow: 'shadow-amber-500/20'
      }
    case 'bullish':
      return {
        icon: TrendingUp,
        bg: 'bg-emerald-500/20',
        border: 'border-emerald-500/50',
        text: 'text-emerald-500',
        glow: 'shadow-emerald-500/20'
      }
    case 'bearish':
      return {
        icon: TrendingDown,
        bg: 'bg-red-500/20',
        border: 'border-red-500/50',
        text: 'text-red-500',
        glow: 'shadow-red-500/20'
      }
    case 'crisis':
      return {
        icon: AlertTriangle,
        bg: 'bg-red-600/20',
        border: 'border-red-600/50',
        text: 'text-red-600',
        glow: 'shadow-red-600/20'
      }
    case 'adoption':
      return {
        icon: Globe,
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/50',
        text: 'text-blue-500',
        glow: 'shadow-blue-500/20'
      }
    case 'regulation':
      return {
        icon: Zap,
        bg: 'bg-purple-500/20',
        border: 'border-purple-500/50',
        text: 'text-purple-500',
        glow: 'shadow-purple-500/20'
      }
  }
}

/**
 * Single timeline event card
 */
function TimelineEventCard({ event, isTop }: { event: TimelineEvent; isTop: boolean }) {
  const style = getEventStyle(event.type)
  const Icon = style.icon
  
  return (
    <div className={`relative flex flex-col ${isTop ? 'items-center pb-8' : 'items-center pt-8'}`}>
      {/* Connector line */}
      <div className={`absolute ${isTop ? 'bottom-0' : 'top-0'} left-1/2 w-px h-8 bg-gradient-to-b ${
        isTop ? 'from-transparent to-foreground/30' : 'from-foreground/30 to-transparent'
      }`} />
      
      {/* Event card */}
      <div className={`relative w-48 p-3 rounded-lg border ${style.bg} ${style.border} shadow-lg ${style.glow} transition-all hover:scale-105 hover:shadow-xl cursor-default`}>
        {/* Type badge */}
        <div className={`absolute -top-2 left-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${style.bg} ${style.text} border ${style.border}`}>
          {event.type}
        </div>
        
        {/* Icon */}
        <div className={`absolute -top-3 right-3 p-1.5 rounded-full ${style.bg} border ${style.border}`}>
          <Icon className={`w-3 h-3 ${style.text}`} />
        </div>
        
        {/* Date */}
        <div className={`text-xs font-mono ${style.text} mt-1`}>
          {event.date}
        </div>
        
        {/* Title */}
        <h4 className="font-headline text-sm font-bold mt-1 leading-tight">
          {event.title}
        </h4>
        
        {/* Description */}
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-3">
          {event.description}
        </p>
        
        {/* Price */}
        {event.price && (
          <div className="mt-2 pt-2 border-t border-foreground/10">
            <span className="text-[10px] text-muted-foreground">BTC: </span>
            <span className={`text-xs font-mono font-bold ${style.text}`}>
              {event.price}
            </span>
          </div>
        )}
      </div>
      
      {/* Dot on timeline */}
      <div className={`absolute ${isTop ? '-bottom-2' : '-top-2'} left-1/2 -translate-x-1/2 w-4 h-4 rounded-full ${style.bg} border-2 ${style.border} z-10`} />
    </div>
  )
}

/**
 * Year marker on timeline
 */
function YearMarker({ year }: { year: number }) {
  return (
    <div className="flex flex-col items-center mx-4">
      <div className="w-px h-6 bg-foreground/20" />
      <div className="px-3 py-1 bg-muted rounded-full border border-foreground/20">
        <span className="text-sm font-mono font-bold text-foreground/70">
          {year}
        </span>
      </div>
      <div className="w-px h-6 bg-foreground/20" />
    </div>
  )
}

/**
 * Main Timeline Component
 */
export function HistoricTimeline({ 
  events = DEFAULT_EVENTS, 
  title = 'Bitcoin Geschichte',
  className = ''
}: HistoricTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  
  // Check scroll position
  const checkScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }
  
  useEffect(() => {
    checkScroll()
    const ref = scrollRef.current
    ref?.addEventListener('scroll', checkScroll)
    window.addEventListener('resize', checkScroll)
    return () => {
      ref?.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [])
  
  // Scroll handlers
  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = 400
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth'
    })
  }
  
  // Group events by year
  const sortedEvents = [...events].sort((a, b) => a.year - b.year)
  const years = [...new Set(sortedEvents.map(e => e.year))]
  
  return (
    <div className={`relative ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-headline text-lg font-bold flex items-center gap-2">
          <span className="text-amber-500">₿</span>
          {title}
        </h3>
        
        {/* Scroll buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="p-2 rounded-full border border-foreground/20 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="p-2 rounded-full border border-foreground/20 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-[10px]">
        {(['milestone', 'bullish', 'bearish', 'crisis', 'adoption'] as EventType[]).map(type => {
          const style = getEventStyle(type)
          return (
            <div key={type} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${style.bg} border ${style.border}`} />
              <span className="text-muted-foreground capitalize">{type}</span>
            </div>
          )
        })}
      </div>
      
      {/* Timeline container */}
      <div className="relative">
        {/* Gradient overlays */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-20 pointer-events-none" />
        )}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-20 pointer-events-none" />
        )}
        
        {/* Scrollable content */}
        <div 
          ref={scrollRef}
          className="overflow-x-auto scrollbar-hide pb-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="relative min-w-max px-8">
            {/* Center timeline line */}
            <div className="absolute left-0 right-0 top-1/2 h-1 bg-gradient-to-r from-foreground/5 via-foreground/20 to-foreground/5 rounded-full" />
            
            {/* Events grid */}
            <div className="relative flex items-center">
              {years.map((year, yearIdx) => {
                const yearEvents = sortedEvents.filter(e => e.year === year)
                
                return (
                  <div key={year} className="flex items-center">
                    {/* Year marker */}
                    {yearIdx === 0 || years[yearIdx - 1] !== year - 1 ? (
                      <YearMarker year={year} />
                    ) : null}
                    
                    {/* Events for this year */}
                    <div className="flex items-center">
                      {yearEvents.map((event, idx) => (
                        <div key={event.id} className="relative" style={{ marginLeft: idx === 0 ? 0 : -20 }}>
                          <TimelineEventCard 
                            event={event} 
                            isTop={idx % 2 === 0}
                          />
                        </div>
                      ))}
                    </div>
                    
                    {/* Spacer between years */}
                    {yearIdx < years.length - 1 && (
                      <div className="w-8" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      
      {/* Hint text */}
      <p className="text-center text-[10px] text-muted-foreground mt-4">
        ← Scrolle horizontal für mehr Events →
      </p>
    </div>
  )
}

