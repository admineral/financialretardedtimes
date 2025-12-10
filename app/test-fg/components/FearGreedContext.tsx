'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'

/**
 * Single period sentiment
 */
export interface PeriodSentiment {
  index: number
  classification: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  classificationDE: 'Extreme Angst' | 'Angst' | 'Neutral' | 'Gier' | 'Extreme Gier'
}

/**
 * Fear & Greed Data Interface
 */
export interface FearGreedData {
  today: PeriodSentiment
  last3Days: PeriodSentiment
  last7Days: PeriodSentiment
  trend: 'rising' | 'falling' | 'stable'
  insight: string
  topDrivers: string[]
}

/**
 * Cache info for displaying date/time
 */
export interface CacheInfo {
  updatedAt: string
  isFromToday: boolean
  isStale: boolean
  dateRange?: {
    oldestDate: string
    newestDate: string
    todayMessageCount: number
  }
}

// Schema for streaming validation
const PeriodSentimentSchema = z.object({
  index: z.number().min(0).max(100),
  classification: z.enum(['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed']),
  classificationDE: z.enum(['Extreme Angst', 'Angst', 'Neutral', 'Gier', 'Extreme Gier']),
})

const FearGreedSchema = z.object({
  today: PeriodSentimentSchema,
  last3Days: PeriodSentimentSchema,
  last7Days: PeriodSentimentSchema,
  trend: z.enum(['rising', 'falling', 'stable']),
  insight: z.string(),
  topDrivers: z.array(z.string()).min(2).max(3),
})

/**
 * Check if date is from today
 */
function isFromToday(dateString: string): boolean {
  const date = new Date(dateString)
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

/**
 * Check if cache is stale (older than 4 hours)
 */
function isCacheStale(dateString: string): boolean {
  const cacheTime = new Date(dateString).getTime()
  const now = Date.now()
  const fourHoursMs = 4 * 60 * 60 * 1000
  return (now - cacheTime) >= fourHoursMs
}

interface FearGreedContextValue {
  data: Partial<FearGreedData> | null
  cacheInfo: CacheInfo | null
  isLoading: boolean
  error: Error | undefined
  hasData: boolean
  hasFetched: boolean
  refresh: () => void
}

const FearGreedContext = createContext<FearGreedContextValue | null>(null)

export function useFearGreed() {
  const context = useContext(FearGreedContext)
  if (!context) {
    throw new Error('useFearGreed must be used within a FearGreedProvider')
  }
  return context
}

interface FearGreedProviderProps {
  children: ReactNode
  /** Auto-start analysis on mount (checks cache first) */
  autoStart?: boolean
}

/**
 * Fear & Greed Provider - Shared state for all FearGreed widgets
 */
export function FearGreedProvider({ children, autoStart = true }: FearGreedProviderProps) {
  const [cachedData, setCachedData] = useState<FearGreedData | null>(null)
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null)
  const [isLoadingCache, setIsLoadingCache] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  
  const { object, isLoading: isLoadingAI, error, submit } = useObject({
    api: '/test-fg/api/analyze',
    schema: FearGreedSchema,
  })

  const streamingData = object as Partial<FearGreedData> | undefined
  const data = cachedData || streamingData || null
  const isLoading = isLoadingCache || isLoadingAI
  const hasData = !!(data?.today || data?.last3Days || data?.last7Days)

  // Update cache info when streaming completes
  useEffect(() => {
    if (streamingData?.today && streamingData?.last3Days && streamingData?.last7Days && 
        streamingData?.trend && streamingData?.insight && streamingData?.topDrivers && !isLoadingAI) {
      const now = new Date().toISOString()
      setCacheInfo({
        updatedAt: now,
        isFromToday: true,
        isStale: false,
      })
      
      // Store completed data as cached data
      setCachedData(streamingData as FearGreedData)
      
      // Fetch updated cache to get dateRange info
      setTimeout(() => {
        fetch('/test-fg/api/cache')
          .then(res => res.json())
          .then(result => {
            if (result.cached && result.dateRange) {
              setCacheInfo(prev => prev ? { ...prev, dateRange: result.dateRange } : null)
            }
          })
          .catch(console.error)
      }, 500)
    }
  }, [streamingData, isLoadingAI])

  // Check cache
  const checkCache = useCallback(async (): Promise<{ cached: boolean; needsRefresh: boolean }> => {
    setIsLoadingCache(true)
    try {
      const response = await fetch('/test-fg/api/cache')
      if (response.ok) {
        const result = await response.json()
        if (result.cached && result.data && result.updatedAt) {
          const updatedAt = result.updatedAt
          const fromToday = isFromToday(updatedAt)
          const stale = isCacheStale(updatedAt)
          
          setCachedData(result.data as FearGreedData)
          setCacheInfo({
            updatedAt,
            isFromToday: fromToday,
            isStale: stale,
            dateRange: result.dateRange || undefined
          })
          setHasFetched(true)
          
          const needsRefresh = !fromToday || stale
          
          console.log(`[FearGreedProvider] Cache loaded:`, {
            updatedAt,
            fromToday,
            stale,
            needsRefresh,
            dateRange: result.dateRange
          })
          
          return { cached: true, needsRefresh }
        }
      }
    } catch (err) {
      console.error('[FearGreedProvider] Cache check failed:', err)
    } finally {
      setIsLoadingCache(false)
    }
    return { cached: false, needsRefresh: true }
  }, [])

  // Generate new data
  const refresh = useCallback(() => {
    setCachedData(null)
    setCacheInfo(null)
    setHasFetched(true)
    submit({})
  }, [submit])

  // Auto-start: check cache first, then generate if needed or stale
  useEffect(() => {
    if (autoStart && !hasFetched && !isLoading) {
      checkCache().then(({ cached, needsRefresh }) => {
        if (!cached || needsRefresh) {
          if (cached && needsRefresh) {
            console.log('[FearGreedProvider] Cache is stale or not from today, refreshing...')
          }
          refresh()
        }
      })
    }
  }, [autoStart, hasFetched, isLoading, checkCache, refresh])

  const value: FearGreedContextValue = {
    data,
    cacheInfo,
    isLoading,
    error,
    hasData,
    hasFetched,
    refresh,
  }

  return (
    <FearGreedContext.Provider value={value}>
      {children}
    </FearGreedContext.Provider>
  )
}
