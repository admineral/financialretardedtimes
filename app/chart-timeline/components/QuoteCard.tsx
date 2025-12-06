'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface QuoteCardProps {
  type: 'pump_call' | 'dump_call' | 'top_call' | 'bottom_call' | 'fomo' | 'panic' | 'diamond_hands' | 'reversal' | 'analysis' | 'sideways'
  quote: string
  username: string
  time: string
  price?: number
  wasCorrect?: boolean
  isCompact?: boolean
  style?: React.CSSProperties
  onHover?: (hovered: boolean) => void
}

const typeConfig = {
  pump_call: {
    icon: '📈',
    label: 'PUMP CALL',
    gradient: 'from-emerald-600/90 to-emerald-800/90',
    border: '#10b981',
    glow: 'shadow-emerald-500/30',
    accent: '#10b981',
    dotColor: '#10b981',
    bg: '#064e3b',
    text: '#6ee7b7',
  },
  bottom_call: {
    icon: '⬇️',
    label: 'BOTTOM CALL',
    gradient: 'from-emerald-600/90 to-teal-800/90',
    border: '#14b8a6',
    glow: 'shadow-emerald-500/30',
    accent: '#14b8a6',
    dotColor: '#14b8a6',
    bg: '#134e4a',
    text: '#5eead4',
  },
  dump_call: {
    icon: '📉',
    label: 'DUMP CALL',
    gradient: 'from-red-600/90 to-red-900/90',
    border: '#ef4444',
    glow: 'shadow-red-500/30',
    accent: '#ef4444',
    dotColor: '#ef4444',
    bg: '#7f1d1d',
    text: '#fca5a5',
  },
  top_call: {
    icon: '⬆️',
    label: 'TOP CALL',
    gradient: 'from-red-600/90 to-rose-900/90',
    border: '#f43f5e',
    glow: 'shadow-red-500/30',
    accent: '#f43f5e',
    dotColor: '#f43f5e',
    bg: '#881337',
    text: '#fda4af',
  },
  fomo: {
    icon: '🚀',
    label: 'FOMO',
    gradient: 'from-amber-500/90 to-orange-700/90',
    border: '#f59e0b',
    glow: 'shadow-amber-500/30',
    accent: '#f59e0b',
    dotColor: '#f59e0b',
    bg: '#78350f',
    text: '#fcd34d',
  },
  panic: {
    icon: '😱',
    label: 'PANIK',
    gradient: 'from-orange-600/90 to-red-800/90',
    border: '#f97316',
    glow: 'shadow-orange-500/30',
    accent: '#f97316',
    dotColor: '#f97316',
    bg: '#7c2d12',
    text: '#fdba74',
  },
  diamond_hands: {
    icon: '💎',
    label: 'DIAMOND HANDS',
    gradient: 'from-blue-600/90 to-indigo-800/90',
    border: '#3b82f6',
    glow: 'shadow-blue-500/30',
    accent: '#3b82f6',
    dotColor: '#3b82f6',
    bg: '#1e3a8a',
    text: '#93c5fd',
  },
  reversal: {
    icon: '🔄',
    label: 'REVERSAL',
    gradient: 'from-purple-600/90 to-violet-800/90',
    border: '#a855f7',
    glow: 'shadow-purple-500/30',
    accent: '#a855f7',
    dotColor: '#a855f7',
    bg: '#581c87',
    text: '#d8b4fe',
  },
  analysis: {
    icon: '📊',
    label: 'ANALYSE',
    gradient: 'from-cyan-600/90 to-blue-800/90',
    border: '#06b6d4',
    glow: 'shadow-cyan-500/30',
    accent: '#06b6d4',
    dotColor: '#06b6d4',
    bg: '#164e63',
    text: '#67e8f9',
  },
  sideways: {
    icon: '↔️',
    label: 'SEITWÄRTS',
    gradient: 'from-slate-600/90 to-slate-800/90',
    border: '#64748b',
    glow: 'shadow-slate-500/30',
    accent: '#64748b',
    dotColor: '#64748b',
    bg: '#334155',
    text: '#cbd5e1',
  },
}

export function QuoteCard({ 
  type, 
  quote, 
  username, 
  time, 
  price, 
  wasCorrect,
  isCompact = false,
  style,
  onHover 
}: QuoteCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const config = typeConfig[type] || typeConfig.analysis
  
  const handleMouseEnter = () => {
    setIsHovered(true)
    onHover?.(true)
  }
  
  const handleMouseLeave = () => {
    setIsHovered(false)
    onHover?.(false)
  }

  const truncatedQuote = quote.length > 60 ? quote.slice(0, 60) + '...' : quote

  if (isCompact) {
    return (
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.15, zIndex: 100 }}
        className="cursor-pointer"
        style={style}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div 
          className="w-3 h-3 rounded-full shadow-lg ring-2 ring-black/50"
          style={{ 
            backgroundColor: config.dotColor,
            boxShadow: `0 0 8px ${config.dotColor}80`
          }}
        />
        
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50"
              style={{ minWidth: 200, maxWidth: 280 }}
            >
              <QuoteCard 
                type={type}
                quote={quote}
                username={username}
                time={time}
                price={price}
                wasCorrect={wasCorrect}
                isCompact={false}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={style}
      className={`
        relative backdrop-blur-md rounded-lg overflow-hidden
        bg-gradient-to-br ${config.gradient}
        border ${config.border}
        shadow-xl ${config.glow}
      `}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Noise texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ 
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
        }}
      />
      
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{config.icon}</span>
          <span className="text-[10px] font-bold tracking-wider text-white/90">
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {wasCorrect !== undefined && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
              wasCorrect 
                ? 'bg-emerald-500/30 text-emerald-200' 
                : 'bg-red-500/30 text-red-200'
            }`}>
              {wasCorrect ? '✓' : '✗'}
            </span>
          )}
          <span className="text-[10px] font-mono text-white/60">{time}</span>
        </div>
      </div>
      
      {/* Quote */}
      <div className="px-3 py-2">
        <p className="text-[11px] leading-relaxed text-white font-medium">
          „{truncatedQuote}"
        </p>
      </div>
      
      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/20 border-t border-white/5">
        <span className="text-[10px] text-white/70">@{username}</span>
        {price && (
          <span className="text-[10px] font-mono text-white/50">
            ${price.toLocaleString()}
          </span>
        )}
      </div>
      
      {/* Glow effect on hover */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        style={{
          background: `radial-gradient(ellipse at center, ${config.accent}20 0%, transparent 70%)`
        }}
      />
    </motion.div>
  )
}

// Dot marker for compact view
export function QuoteDot({ 
  type, 
  style,
  onClick
}: { 
  type: string
  style?: React.CSSProperties
  onClick?: () => void
}) {
  const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.analysis
  
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.3 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="cursor-pointer"
      style={style}
    >
      <div 
        className="w-2.5 h-2.5 rounded-full ring-1 ring-black/30"
        style={{ 
          backgroundColor: config.dotColor,
          boxShadow: `0 0 6px ${config.dotColor}60`
        }}
      />
    </motion.div>
  )
}

export { typeConfig }

