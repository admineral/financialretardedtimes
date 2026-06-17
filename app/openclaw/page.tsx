'use client'

import { experimental_useObject as useObject } from '@ai-sdk/react'
import {
AlertCircle,
Award,
Calendar,
ChevronRight,
ExternalLink,
GitBranch,
GitCommit,
GitMerge,
Newspaper,
RefreshCw,
Sparkles,
TrendingUp,
Zap
} from 'lucide-react'
import Link from 'next/link'
import { useCallback,useEffect,useRef,useState } from 'react'
import {
getCachedCommits,
getDailyStats,
getMostRecentNewspaper,
getSettings,
initializeCache,
syncCommits,
updateSettings,
type CachedCommit,
type CachedNewspaper,
type DailyStats,
type OpenClawSettings,
} from './actions/cache'
import { CategoryBadge,CommitChart,CommitTicker,CommitTimeline,getCategoryStyle,Skeleton,type DayRange } from './components'
import { CONFIG,getUIStrings,type Language } from './lib/config'
import { OpenClawNewspaperSchema,type OpenClawNewspaperData } from './lib/schemas'

type GenerationAttempt = {
  id: string
  startedAt: string
  force: boolean
  language: Language
  commitCount: number
  dayRange: number
  selectedDates: string[]
  trigger: 'auto' | 'manual' | 'retry' | 'language'
}

type CommitLoadStatus = {
  phase: 'idle' | 'fetching' | 'calculating' | 'ready' | 'error'
  message: string
  startDate: string | null
  endDate: string | null
  loadedCount: number
}

function StreamingCursor({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="inline-block w-0.5 h-[1em] bg-primary animate-pulse ml-1 align-middle" />
}

function isGitHubUnavailableMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('github api error: 403') || 
    normalized.includes('github is not available') ||
    normalized.includes('github ist gerade nicht erreichbar') ||
    normalized.includes('github_rate_limited')
}

function isOpenClawClientDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPENCLAW_DEBUG_LOGS === 'true'
}

export default function OpenClawTodayPage() {
  const lastAutoGenerateKey = useRef<string | null>(null)
  const [commits, setCommits] = useState<CachedCommit[]>([])
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [settings, setSettings] = useState<OpenClawSettings | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [cachedNewspaper, setCachedNewspaper] = useState<CachedNewspaper | null>(null)
  const [staleNewspaper, setStaleNewspaper] = useState<CachedNewspaper | null>(null)
  
  const [isLoadingCommits, setIsLoadingCommits] = useState(true)
  const [isLoadingDates, setIsLoadingDates] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [forceRegenerate, setForceRegenerate] = useState(false)
  const [today, setToday] = useState<string>('')
  const [language, setLanguage] = useState<Language>('en')
  const [initError, setInitError] = useState<string | null>(null)
  const [generationAttempt, setGenerationAttempt] = useState<GenerationAttempt | null>(null)
  const [commitLoadStatus, setCommitLoadStatus] = useState<CommitLoadStatus>({
    phase: 'idle',
    message: 'Waiting for date selection',
    startDate: null,
    endDate: null,
    loadedCount: 0,
  })
  
  const strings = getUIStrings(language)
  
  const { 
    object: newspaperData, 
    submit, 
    isLoading: isGenerating,
    error,
  } = useObject({
    api: '/openclaw/api/generate',
    schema: OpenClawNewspaperSchema,
  })
  const isInitGitHubUnavailable = initError ? isGitHubUnavailableMessage(initError) : false
  const isGenerateGitHubUnavailable = error?.message ? isGitHubUnavailableMessage(error.message) : false
  const displayInitError = initError
    ? isInitGitHubUnavailable ? strings.githubUnavailable : initError
    : null
  const displayGenerateError = error?.message
    ? isGenerateGitHubUnavailable ? strings.githubUnavailable : error.message
    : null
  const stalePreviewNewspaper = !cachedNewspaper && staleNewspaper ? staleNewspaper : null
  const shouldShowStalePreview = !!stalePreviewNewspaper && (!!displayGenerateError || !newspaperData)

  const generateNewspaper = useCallback((force: boolean = false, trigger: GenerationAttempt['trigger'] = 'manual') => {
    const dayRange = selectedDates.length || 1
    const attempt: GenerationAttempt = {
      id: `${Date.now().toString(36)}-${trigger}`,
      startedAt: new Date().toISOString(),
      force,
      language,
      commitCount: commits.length || CONFIG.newspaper.defaultCommitCount,
      dayRange,
      selectedDates,
      trigger,
    }

    setGenerationAttempt(attempt)
    console.info(
      `[OPENCLAW UI] Generation ${attempt.id} started (${trigger}, ${language.toUpperCase()}, ${dayRange}d, ${attempt.commitCount} commits)`
    )

    if (isOpenClawClientDebugEnabled()) {
      console.groupCollapsed(
        `[OPENCLAW UI DEBUG] ${trigger} generation ${attempt.id}: ${language.toUpperCase()}, ${dayRange} day(s), ${attempt.commitCount} commit(s), force=${force}`
      )
      console.info('[OPENCLAW UI DEBUG] Attempt details', attempt)
      console.info('[OPENCLAW UI DEBUG] Request target', '/openclaw/api/generate')
      console.info('[OPENCLAW UI DEBUG] Expected steps', [
        force ? 'Sync latest commits before generation' : 'Check generated newspaper cache first',
        'Load cached commits for the requested day range',
        'Build an AI prompt from commit stats and recent commit messages',
        `Stream a newspaper object with ${CONFIG.ai.model}`,
        'Save the finished newspaper to Supabase cache',
      ])
      console.groupEnd()
    }

    submit({ 
      language, 
      commitCount: attempt.commitCount, 
      dayRange, 
      forceRegenerate: force,
      selectedDates,
      attemptId: attempt.id,
    })
  }, [commits.length, language, selectedDates, submit])

  // Use streamed data if available, otherwise use cached newspaper
  const data = (!displayGenerateError ? newspaperData as Partial<OpenClawNewspaperData> | undefined : undefined) || 
    (cachedNewspaper?.data as Partial<OpenClawNewspaperData> | undefined) ||
    (stalePreviewNewspaper?.data as Partial<OpenClawNewspaperData> | undefined)

  // Set today's date based on current language
  useEffect(() => {
    setToday(new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }))
  }, [language])

  const loadData = useCallback(async () => {
    setIsLoadingDates(true)
    setIsLoadingCommits(true)
    setInitError(null)
    
    try {
      // Fetch ALL daily stats from database (no limit)
      const [settingsData, statsData] = await Promise.all([
        getSettings(),
        getDailyStats(), // No limit - get all available data
      ])
      
      setSettings(settingsData)
      setDailyStats(statsData)
      
      // Set language from settings (English default)
      const lang = settingsData.defaultLanguage || 'en'
      setLanguage(lang)
      
      // Try to load cached newspaper for current language
      const cached = await getMostRecentNewspaper(lang)
      let shouldAutoGenerate = false
      
      if (cached) {
        // Check if cache is older than configured duration (default 24h)
        const cacheAgeHours = (Date.now() - new Date(cached.updatedAt).getTime()) / (1000 * 60 * 60)
        const maxCacheHours = settingsData.cacheDurationHours || 24
        
        if (cacheAgeHours < maxCacheHours) {
          console.log(`[OPENCLAW] Using cached newspaper from ${cached.updatedAt} (${cacheAgeHours.toFixed(1)}h old)`)
          setCachedNewspaper(cached)
          setStaleNewspaper(null)
          setHasGenerated(true)
        } else {
          console.log(`[OPENCLAW] Cached newspaper too old (${cacheAgeHours.toFixed(1)}h > ${maxCacheHours}h), will auto-generate`)
          setStaleNewspaper(cached)
          shouldAutoGenerate = true
        }
      } else {
        console.log(`[OPENCLAW] No cached newspaper found for ${lang}, will auto-generate`)
        const fallback = await getMostRecentNewspaper()
        setStaleNewspaper(fallback)
        shouldAutoGenerate = true
      }
      
      if (statsData.length === 0) {
        const initResult = await initializeCache(settingsData.defaultDays)
        if (!initResult.success) {
          setInitError(initResult.error || 'Failed to initialize cache')
        } else {
          const newStats = await getDailyStats() // No limit - get all
          setDailyStats(newStats)
          if (newStats.length > 0) {
            setSelectedDate(newStats[0].date)
            setSelectedDates([newStats[0].date])
          }
        }
      } else {
        setSelectedDate(statsData[0].date)
        setSelectedDates([statsData[0].date])
      }
      
      // Auto-generate if needed and we have commits
      if (shouldAutoGenerate) {
        setHasGenerated(true)
        setForceRegenerate(true)
      }
    } catch (err) {
      setInitError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoadingDates(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (selectedDates.length === 0) {
      setCommits([])
      setIsLoadingCommits(false)
      setCommitLoadStatus({
        phase: 'idle',
        message: language === 'de' ? 'Warte auf Datumsauswahl' : 'Waiting for date selection',
        startDate: null,
        endDate: null,
        loadedCount: 0,
      })
      return
    }

    let cancelled = false
    
    async function loadCommits() {
      setIsLoadingCommits(true)
      const startDate = selectedDates[selectedDates.length - 1]
      const endDate = selectedDates[0]
      setCommitLoadStatus({
        phase: 'fetching',
        message: language === 'de'
          ? `Lade Commit-Cache fuer ${startDate} bis ${endDate}`
          : `Loading commit cache for ${startDate} to ${endDate}`,
        startDate,
        endDate,
        loadedCount: 0,
      })

      try {
        const cachedCommits = await getCachedCommits({
          startDate,
          endDate,
        })

        if (cancelled) return
        setCommits(cachedCommits)
        setCommitLoadStatus({
          phase: 'ready',
          message: language === 'de'
            ? `${cachedCommits.length} Commits geladen und bereit fuer die Analyse`
            : `${cachedCommits.length} commits loaded and ready for analysis`,
          startDate,
          endDate,
          loadedCount: cachedCommits.length,
        })
      } catch (err) {
        console.error('Failed to load commits:', err)
        if (!cancelled) {
          setCommitLoadStatus({
            phase: 'error',
            message: err instanceof Error ? err.message : 'Failed to load commits',
            startDate,
            endDate,
            loadedCount: 0,
          })
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCommits(false)
        }
      }
    }
    
    loadCommits()
    return () => {
      cancelled = true
    }
  }, [language, selectedDates])

  // Auto-generate newspaper if needed
  useEffect(() => {
    if (!isLoadingCommits && commits.length > 0 && hasGenerated && !cachedNewspaper && !isGenerating && !newspaperData && !error) {
      const dayRange = selectedDates.length || 1
      const autoGenerateKey = `${language}:${selectedDates.join(',')}:${dayRange}:${forceRegenerate}`
      
      if (lastAutoGenerateKey.current === autoGenerateKey) {
        return
      }
      
      lastAutoGenerateKey.current = autoGenerateKey
      console.log(`[OPENCLAW] Auto-generating newspaper... (forceRegenerate: ${forceRegenerate}, dayRange: ${dayRange}, commits: ${commits.length})`)
      generateNewspaper(forceRegenerate, 'auto')
      // Reset force flag after triggering
      if (forceRegenerate) {
        setForceRegenerate(false)
      }
    }
  }, [isLoadingCommits, commits.length, hasGenerated, cachedNewspaper, isGenerating, newspaperData, error, language, forceRegenerate, selectedDates, generateNewspaper])

  useEffect(() => {
    if (!generationAttempt) return

    if (isGenerating) {
      if (isOpenClawClientDebugEnabled()) {
        console.info(`[OPENCLAW UI DEBUG] Generation ${generationAttempt.id} is streaming`)
      }
      return
    }

    if (error) {
      console.error(`[OPENCLAW UI] Generation ${generationAttempt.id} failed`, error)
      return
    }

    if (newspaperData) {
      console.info(`[OPENCLAW UI] Generation ${generationAttempt.id} received newspaper data`)
    }
  }, [error, generationAttempt, isGenerating, newspaperData])

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date)
  }, [])

  const handleDayRangeChange = useCallback((days: DayRange, dates: string[]) => {
    setSelectedDates(dates)
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsSyncing(true)
    try {
      await syncCommits(false)
      await loadData()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setIsSyncing(false)
    }
  }, [loadData])

  const formatTime = (dateString: string) => {
    const tz = settings?.displayTimezone || 'UTC'
    try {
      return new Date(dateString).toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
      })
    } catch {
      return new Date(dateString).toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    }
  }

  const commitLoadRangeLabel = commitLoadStatus.startDate && commitLoadStatus.endDate
    ? commitLoadStatus.startDate === commitLoadStatus.endDate
      ? commitLoadStatus.startDate
      : `${commitLoadStatus.startDate} -> ${commitLoadStatus.endDate}`
    : language === 'de' ? 'kein Zeitraum' : 'no range'

  const generationSteps = generationAttempt ? [
    {
      label: generationAttempt.force
        ? (language === 'de' ? 'Synchronisiere frische GitHub-Commits' : 'Sync fresh GitHub commits')
        : (language === 'de' ? 'Pruefe vorhandenen Zeitungscache' : 'Check existing newspaper cache'),
      detail: generationAttempt.force
        ? (language === 'de' ? 'Erzwungene Regeneration aktualisiert zuerst den lokalen Commit-Cache.' : 'Forced regeneration refreshes the local commit cache first.')
        : (language === 'de' ? 'Wenn ein frischer Cache existiert, wird keine neue KI-Anfrage gebraucht.' : 'If a fresh cache exists, no new AI request is needed.'),
      done: generationAttempt.force ? !isGenerating && !!newspaperData : true,
    },
    {
      label: language === 'de' ? 'Lade Commit-Daten fuer den Zeitraum' : 'Load commit data for the range',
      detail: `${commitLoadStatus.message} · ${commitLoadRangeLabel}`,
      done: !isLoadingCommits,
    },
    {
      label: language === 'de' ? 'Baue Prompt aus Commit-Statistiken' : 'Build prompt from commit statistics',
      detail: language === 'de'
        ? 'Der Server nutzt Gesamtstatistiken und bis zu 200 aktuelle Commits als Kontext.'
        : 'The server uses aggregate stats and up to 200 recent commits as context.',
      done: !!data?.headline || !!data?.leadStory,
    },
    {
      label: language === 'de' ? 'Streame Zeitung vom KI-Modell' : 'Stream newspaper from the AI model',
      detail: `${CONFIG.ai.model} · ${generationAttempt.language.toUpperCase()} · ${generationAttempt.trigger} trigger · attempt ${generationAttempt.id}`,
      done: !!newspaperData && !isGenerating,
    },
    {
      label: language === 'de' ? 'Speichere fertige Zeitung im Cache' : 'Save finished newspaper to cache',
      detail: language === 'de'
        ? 'Nach Abschluss schreibt der API-Handler die Ausgabe in Supabase.'
        : 'When streaming finishes, the API handler writes the output to Supabase.',
      done: !!newspaperData && !isGenerating && !error,
    },
  ] : []
  const isGenerationComplete = !!generationAttempt &&
    !isGenerating &&
    !error &&
    generationSteps.length > 0 &&
    generationSteps.every(step => step.done)

  return (
    <main className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />

      {/* Header */}
      <header className="relative border-b border-primary/20 z-10">
        <div className="w-full border-b border-primary/10 bg-card/50 backdrop-blur-sm">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-between items-center">
            <div className="flex items-center gap-3 text-xs">
              <Link href="/newspaper" className="text-muted-foreground hover:text-primary transition-colors">
                {strings.backLink}
              </Link>
              <span className="text-muted-foreground/40">|</span>
              <span className="text-muted-foreground">{today || '...'}</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Cache Info + Regenerate Button */}
              {cachedNewspaper && !isGenerating ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-emerald-500/80">●</span>
                  <span>
                    {new Date(cachedNewspaper.updatedAt).toLocaleString(language === 'de' ? 'de-DE' : 'en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                  <button
                    onClick={() => {
                      console.log('[OPENCLAW] User requested regeneration')
                      lastAutoGenerateKey.current = null
                      setCachedNewspaper(null)
                      setHasGenerated(true)
                      generateNewspaper(true, 'manual')
                    }}
                    className="flex items-center gap-1 ml-1 text-muted-foreground hover:text-primary transition-colors"
                    title="Regenerate newspaper"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              ) : isGenerating ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                  <span className="hidden sm:inline">Generating...</span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    console.log('[OPENCLAW] Full refresh triggered by user')
                    lastAutoGenerateKey.current = null
                    setCachedNewspaper(null)
                    setHasGenerated(true)
                    generateNewspaper(true, 'manual')
                  }}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Generate newspaper"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Generate</span>
                </button>
              )}
              <span className="text-muted-foreground/40">|</span>
              {/* Language Toggle */}
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={async () => {
                    setLanguage('en')
                    updateSettings({ defaultLanguage: 'en' })
                    const cached = await getMostRecentNewspaper('en')
                    if (cached && settings) {
                      const cacheAgeHours = (Date.now() - new Date(cached.updatedAt).getTime()) / (1000 * 60 * 60)
                      const maxCacheHours = settings.cacheDurationHours || 24
                      
                      if (cacheAgeHours < maxCacheHours) {
                        console.log(`[OPENCLAW] Loaded EN cached newspaper from ${cached.updatedAt} (${cacheAgeHours.toFixed(1)}h old)`)
                        setCachedNewspaper(cached)
                        setStaleNewspaper(null)
                        setHasGenerated(true)
                      } else {
                        console.log(`[OPENCLAW] EN cache too old (${cacheAgeHours.toFixed(1)}h), will auto-generate`)
                        setCachedNewspaper(null)
                        setStaleNewspaper(cached)
                        setHasGenerated(true)
                        setForceRegenerate(true)
                      }
                    } else {
                      console.log(`[OPENCLAW] No EN cached newspaper, will auto-generate`)
                      const fallback = await getMostRecentNewspaper()
                      setCachedNewspaper(null)
                      setStaleNewspaper(fallback)
                      setHasGenerated(true)
                      setForceRegenerate(true)
                    }
                  }}
                  className={`px-2 py-1 rounded ${language === 'en' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  EN
                </button>
                <button
                  onClick={async () => {
                    setLanguage('de')
                    updateSettings({ defaultLanguage: 'de' })
                    const cached = await getMostRecentNewspaper('de')
                    if (cached && settings) {
                      const cacheAgeHours = (Date.now() - new Date(cached.updatedAt).getTime()) / (1000 * 60 * 60)
                      const maxCacheHours = settings.cacheDurationHours || 24
                      
                      if (cacheAgeHours < maxCacheHours) {
                        console.log(`[OPENCLAW] Loaded DE cached newspaper from ${cached.updatedAt} (${cacheAgeHours.toFixed(1)}h old)`)
                        setCachedNewspaper(cached)
                        setStaleNewspaper(null)
                        setHasGenerated(true)
                      } else {
                        console.log(`[OPENCLAW] DE cache too old (${cacheAgeHours.toFixed(1)}h), will auto-generate`)
                        setCachedNewspaper(null)
                        setStaleNewspaper(cached)
                        setHasGenerated(true)
                        setForceRegenerate(true)
                      }
                    } else {
                      console.log(`[OPENCLAW] No DE cached newspaper, will auto-generate`)
                      const fallback = await getMostRecentNewspaper()
                      setCachedNewspaper(null)
                      setStaleNewspaper(fallback)
                      setHasGenerated(true)
                      setForceRegenerate(true)
                    }
                  }}
                  className={`px-2 py-1 rounded ${language === 'de' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  DE
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Masthead */}
        <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/60" />
              <span className="text-3xl">{CONFIG.newspaper.emoji}</span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-primary/60" />
            </div>
            <h1 className="font-masthead text-4xl sm:text-5xl md:text-6xl lg:text-7xl gold-text tracking-wide mb-4">
              {CONFIG.newspaper.title}
            </h1>
            <div className="flex items-center justify-center gap-6 mt-6 text-sm text-muted-foreground">
              <a 
                href={CONFIG.repo.url}
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-primary transition-colors"
              >
                <GitBranch className="w-4 h-4" />
                {CONFIG.repo.fullName}
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-muted-foreground/40">|</span>
              <Link
                href="/openclaw/issues"
                className="flex items-center gap-2 hover:text-primary transition-colors"
              >
                <AlertCircle className="w-4 h-4" />
                Issues & PRs
              </Link>
            </div>
          </div>
        </div>
        <div className="newspaper-rule-gold" />
      </header>

      {/* Commit Ticker - like stock prices */}
      <div className="w-full bg-card/50 border-b border-primary/10 relative z-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <CommitTicker dailyStats={dailyStats} isLoading={isLoadingDates} />
        </div>
      </div>

      {/* Timeline */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-primary/10">
        <CommitTimeline
          dailyStats={dailyStats}
          selectedDate={selectedDate}
          isLoadingDates={isLoadingDates}
          isLoading={isLoadingCommits || isSyncing}
          onDateSelect={handleDateSelect}
          onDayRangeChange={handleDayRangeChange}
          onRefresh={handleRefresh}
          timezone={settings?.displayTimezone}
        />
      </div>

      {/* Init Error */}
      {displayInitError && (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className={`p-4 rounded-sm flex items-center gap-3 ${
            isInitGitHubUnavailable
              ? 'bg-amber-500/10 border border-amber-500/30'
              : 'bg-destructive/10 border border-destructive/30'
          }`}>
            <AlertCircle className={`w-5 h-5 flex-shrink-0 ${isInitGitHubUnavailable ? 'text-amber-500' : 'text-destructive'}`} />
            <p className={`text-sm ${isInitGitHubUnavailable ? 'text-amber-200' : 'text-destructive'}`}>{displayInitError}</p>
            <button 
              onClick={loadData}
              className={`ml-auto hover:underline text-sm ${isInitGitHubUnavailable ? 'text-amber-200' : 'text-destructive'}`}
            >
              {strings.retry}
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
        {/* Generation Status */}
        {(isGenerating || generationAttempt) && !cachedNewspaper && !displayGenerateError && (
          <div className={`mb-8 glass-card-gold rounded-sm border border-primary/30 shadow-[0_0_30px_rgba(234,179,8,0.08)] ${isGenerationComplete ? 'p-3' : 'p-5'}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className={`flex items-center gap-2 ${isGenerationComplete ? '' : 'mb-2'}`}>
                  {isGenerationComplete ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] text-emerald-300">✓</span>
                  ) : (
                    <RefreshCw className={`w-4 h-4 text-primary ${isGenerating ? 'animate-spin' : ''}`} />
                  )}
                  <span className="font-headline text-sm font-semibold uppercase tracking-wider text-primary">
                    {isGenerating
                      ? (language === 'de' ? 'Generierung laeuft im Hintergrund' : 'Generating in the background')
                      : (language === 'de' ? 'Letzte Generierung' : 'Last generation attempt')}
                  </span>
                </div>
                {!isGenerationComplete && (
                  <p className="text-sm text-muted-foreground">
                    {language === 'de'
                      ? 'OpenClaw prueft Cache und Commit-Daten, baut daraus einen Prompt und streamt dann die Zeitung.'
                      : 'OpenClaw is checking cache and commit data, building the prompt, then streaming the newspaper.'}
                  </p>
                )}
              </div>

              {generationAttempt && (
                <div className={`grid gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground sm:text-right ${isGenerationComplete ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
                  <span>{language === 'de' ? 'Sprache' : 'Language'}: {generationAttempt.language.toUpperCase()}</span>
                  <span>{language === 'de' ? 'Zeitraum' : 'Range'}: {generationAttempt.dayRange}d</span>
                  <span>{language === 'de' ? 'Commits' : 'Commits'}: {generationAttempt.commitCount}</span>
                  <span>{language === 'de' ? 'Trigger' : 'Trigger'}: {generationAttempt.trigger}</span>
                </div>
              )}
            </div>

            {generationAttempt && isGenerationComplete && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground font-mono">
                <span>{CONFIG.ai.model}</span>
                <span>{commitLoadRangeLabel}</span>
                <span>{language === 'de' ? 'Versuch' : 'attempt'} {generationAttempt.id}</span>
                <span className="text-emerald-300">{language === 'de' ? 'alle Schritte abgeschlossen' : 'all steps complete'}</span>
              </div>
            )}

            {generationAttempt && !isGenerationComplete && (
              <div className="mt-5 grid gap-2">
                {generationSteps.map((step, idx) => (
                  <div key={`${generationAttempt.id}-${idx}`} className="flex items-start gap-3 rounded-sm bg-background/40 p-3 border border-primary/10">
                    <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      step.done
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : isGenerating
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {step.done ? '✓' : idx + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(isLoadingCommits || commitLoadStatus.phase === 'calculating') && (
          <div className="p-5 bg-amber-500/10 border-2 border-amber-500/40 rounded-sm mb-8 shadow-[0_0_30px_rgba(245,158,11,0.08)]">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <RefreshCw className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5 animate-spin" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-headline text-sm font-semibold uppercase tracking-wider text-amber-200">
                    {language === 'de' ? 'Hinweis: Commit-Daten werden geladen' : 'Notice: loading commit data'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-[11px] text-amber-200 border border-amber-500/20 font-mono">
                    {commitLoadStatus.phase}
                  </span>
                </div>
                <p className="text-sm text-amber-100/90 mb-2">
                  {commitLoadStatus.message}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-100/70 font-mono">
                  <span>{language === 'de' ? 'Zeitraum' : 'Range'}: {commitLoadRangeLabel}</span>
                  <span>{language === 'de' ? 'Geladen' : 'Loaded'}: {commitLoadStatus.loadedCount} commits</span>
                  <span>{language === 'de' ? 'Quelle' : 'Source'}: Supabase cache</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {displayGenerateError && (
          <div className={`p-6 rounded-sm text-sm mb-8 flex flex-col sm:flex-row sm:items-center gap-3 ${
            isGenerateGitHubUnavailable
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
              : 'bg-destructive/10 border border-destructive/30 text-destructive'
          }`}>
            <div className="flex items-center gap-2">
              <AlertCircle className={`w-5 h-5 flex-shrink-0 ${isGenerateGitHubUnavailable ? 'text-amber-500' : 'text-destructive'}`} />
              {!isGenerateGitHubUnavailable && <span className="font-semibold">{strings.error}:</span>}
              <span>{displayGenerateError}</span>
            </div>
            <button 
              onClick={() => {
                lastAutoGenerateKey.current = null
                setCachedNewspaper(null)
                setHasGenerated(true)
                generateNewspaper(true, 'retry')
              }} 
              className="sm:ml-auto underline hover:no-underline"
            >
              {strings.retry}
            </button>
          </div>
        )}

        {shouldShowStalePreview && stalePreviewNewspaper && (
          <div className="p-5 bg-amber-500/10 border-2 border-amber-500/40 rounded-sm mb-8 shadow-[0_0_30px_rgba(245,158,11,0.08)]">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-headline text-sm font-semibold uppercase tracking-wider text-amber-200">
                    {strings.stalePreview}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-[11px] text-amber-200 border border-amber-500/20">
                    {language === 'de' ? 'Generiert: ' : 'Generated: '}
                    {new Date(stalePreviewNewspaper.updatedAt).toLocaleString(language === 'de' ? 'de-DE' : 'en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-amber-100/90 mb-2">
                  {strings.stalePreviewDescription}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-100/70 font-mono">
                  <span>{language === 'de' ? 'Datenstand' : 'Data date'}: {stalePreviewNewspaper.cacheDate}</span>
                  <span>{language === 'de' ? 'Zeitraum' : 'Range'}: {stalePreviewNewspaper.dayRange} day{stalePreviewNewspaper.dayRange === 1 ? '' : 's'}</span>
                  <span>{stalePreviewNewspaper.commitCount} commits</span>
                  <span>{stalePreviewNewspaper.language.toUpperCase()}</span>
                </div>
                {typeof stalePreviewNewspaper.data.headline === 'string' && (
                  <p className="mt-3 text-sm text-muted-foreground italic truncate">
                    {language === 'de' ? 'Vorschau' : 'Preview'}: {stalePreviewNewspaper.data.headline}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Newspaper Content - show skeletons during initial load or generation */}
        {(data || isGenerating || cachedNewspaper || isLoadingCommits || isLoadingDates) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Main Column */}
            <div className="lg:col-span-8">
              {/* Headline */}
              <div className="mb-8">
                {data?.headline ? (
                  <h2 className="font-masthead text-3xl sm:text-4xl lg:text-5xl gold-text leading-tight mb-3">
                    {data.headline}
                    <StreamingCursor show={isGenerating && !data?.subheadline} />
                  </h2>
                ) : (
                  <Skeleton className="w-full h-12 mb-3" />
                )}
                {data?.subheadline ? (
                  <p className="font-headline text-lg sm:text-xl text-muted-foreground">
                    {data.subheadline}
                  </p>
                ) : (
                  <Skeleton className="w-3/4 h-6" />
                )}
              </div>

              {/* Lead Story */}
              <article className="glass-card-gold p-6 sm:p-8 rounded-sm mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Newspaper className="w-5 h-5 text-primary" />
                  <span className="text-xs font-headline uppercase tracking-wider text-primary">
                    {strings.leadArticle}
                  </span>
                </div>
                
                {data?.leadStory?.title ? (
                  <h3 className="font-headline text-2xl sm:text-3xl font-bold mb-4 text-foreground">
                    {data.leadStory.title}
                    <StreamingCursor show={isGenerating && !data?.leadStory?.summary} />
                  </h3>
                ) : (
                  <Skeleton className="w-full h-8 mb-4" />
                )}
                
                <div className="font-body text-base sm:text-lg leading-relaxed text-muted-foreground mb-6 whitespace-pre-line">
                  {data?.leadStory?.summary || (
                    <>
                      <Skeleton className="w-full h-5 mb-2" />
                      <Skeleton className="w-full h-5 mb-2" />
                      <Skeleton className="w-full h-5 mb-2" />
                      <Skeleton className="w-3/4 h-5" />
                    </>
                  )}
                </div>

                {data?.leadStory?.impact && (
                  <div className="pl-5 py-3 border-l-2 border-primary/40 bg-primary/5 rounded-r-sm mb-5">
                    <p className="text-sm text-muted-foreground font-body">
                      <span className="font-semibold text-primary">{strings.impact}:</span> {data.leadStory.impact}
                    </p>
                  </div>
                )}

                {data?.leadStory?.contributors && data.leadStory.contributors.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-primary/20">
                    <span className="text-xs text-muted-foreground">{strings.involved}:</span>
                    {data.leadStory.contributors.map((contributor, idx) => (
                      <span 
                        key={idx}
                        className="px-3 py-1 bg-card/80 text-xs font-mono rounded-full border border-primary/10"
                      >
                        @{contributor}
                      </span>
                    ))}
                  </div>
                )}

                {data?.leadStory?.title && (
                  <div className="mt-6 pt-4 border-t border-primary/20 flex justify-end">
                    <Link 
                      href={`/openclaw/article/${encodeURIComponent((data.leadStory.title || '').toLowerCase().replace(/\s+/g, '-'))}?title=${encodeURIComponent(data.leadStory.title || '')}&type=leadStory&language=${language}&dayRange=${selectedDates.length || 1}&selectedDate=${selectedDate || ''}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-sm transition-colors text-sm font-headline"
                    >
                      {strings.readFullArticle}
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </article>

              {/* Technical Highlights */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-5">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
                    {strings.technicalHighlights}
                  </h3>
                  <div className="flex-1 h-px bg-gradient-to-r from-amber-500/30 to-transparent" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {data?.technicalHighlights ? (
                    data.technicalHighlights.slice(0, 6).filter(h => h?.title).map((highlight, idx) => {
                      const slug = (highlight.title || '').toLowerCase().replace(/\s+/g, '-')
                      const articleUrl = `/openclaw/article/${encodeURIComponent(slug)}?title=${encodeURIComponent(highlight.title || '')}&type=technicalHighlight&category=${encodeURIComponent(highlight.category || '')}&language=${language}&dayRange=${selectedDates.length || 1}&selectedDate=${selectedDate || ''}`
                      return (
                        <div 
                          key={idx}
                          className="glass-card p-4 rounded-sm border-l-2 border-primary/40 group hover:border-primary/60 transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <CategoryBadge category={highlight.category} />
                            {highlight.commitSha && (
                              <code className="text-[10px] text-muted-foreground font-mono">
                                {highlight.commitSha.substring(0, 7)}
                              </code>
                            )}
                          </div>
                          <h4 className="font-headline text-sm font-semibold mb-1">{highlight.title}</h4>
                          <p className="text-xs text-muted-foreground mb-3">{highlight.description}</p>
                          <Link 
                            href={articleUrl}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            {strings.readFullArticle || 'Read Full Article'}
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        </div>
                      )
                    })
                  ) : isGenerating ? (
                    Array(4).fill(0).map((_, idx) => (
                      <div key={idx} className="glass-card p-4 rounded-sm">
                        <Skeleton className="w-20 h-4 mb-2" />
                        <Skeleton className="w-full h-5 mb-2" />
                        <Skeleton className="w-3/4 h-4" />
                      </div>
                    ))
                  ) : null}
                </div>
              </div>

              {/* Brief News (Kurzmeldungen) - Thematic summaries */}
              {data?.briefNews && data.briefNews.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-headline text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      {strings.briefNews}
                    </h3>
                    <div className="flex-1 h-px bg-gradient-to-r from-muted-foreground/20 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.briefNews.filter(item => item?.title).map((item, idx) => {
                      const slug = (item.title || '').toLowerCase().replace(/\s+/g, '-')
                      const articleUrl = `/openclaw/article/${encodeURIComponent(slug)}?title=${encodeURIComponent(item.title || '')}&type=briefNews&language=${language}&dayRange=${selectedDates.length || 1}&selectedDate=${selectedDate || ''}`
                      return (
                        <div key={idx} className="p-3 bg-card/50 rounded-sm border border-primary/5 group hover:border-primary/20 transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-headline text-sm font-semibold text-foreground">
                              {item.title}
                            </h4>
                            {item.relatedCommits && (
                              <span className="text-[10px] text-muted-foreground/60 font-mono">
                                {item.relatedCommits} commits
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{item.text}</p>
                          <Link 
                            href={articleUrl}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            {strings.readFullArticle || 'Read Full Article'}
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Week Ahead */}
              {data?.weekAhead && (
                <div className="glass-card p-5 rounded-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-primary" />
                    <h4 className="font-headline text-sm font-bold uppercase tracking-wider">
                      {strings.outlook}
                    </h4>
                  </div>
                  <p className="font-body text-sm text-muted-foreground">{data.weekAhead}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="lg:col-span-4">
              <div className="sticky top-24 space-y-6">
                {/* Developer Spotlight */}
                {data?.developerSpotlight?.username ? (
                  <div className="glass-card-gold p-5 rounded-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <Award className="w-5 h-5 text-amber-400" />
                      <h4 className="font-headline text-sm font-bold uppercase tracking-wider gold-text">
                        {strings.developerSpotlight}
                      </h4>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                        {data.developerSpotlight.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-mono text-sm font-semibold">@{data.developerSpotlight.username}</p>
                        <p className="text-xs text-muted-foreground">{data.developerSpotlight.commitCount} Commits</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{data.developerSpotlight.contribution}</p>
                  </div>
                ) : (isLoadingCommits || isGenerating) && (
                  <div className="glass-card-gold p-5 rounded-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <Award className="w-5 h-5 text-amber-400" />
                      <Skeleton className="w-32 h-4" />
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div>
                        <Skeleton className="w-24 h-4 mb-1" />
                        <Skeleton className="w-16 h-3" />
                      </div>
                    </div>
                    <Skeleton className="w-full h-4" />
                  </div>
                )}

                {/* Code Insights */}
                {data?.codeInsights ? (
                  <div className="glass-card p-5 rounded-sm">
                    <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      {strings.codeInsights}
                    </h4>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{strings.totalCommits}</span>
                        <span className="font-mono font-semibold">{data.codeInsights.totalCommits}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{strings.mergeCommits}</span>
                        <span className="font-mono font-semibold">{data.codeInsights.mergeCommits}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{strings.contributors}</span>
                        <span className="font-mono font-semibold">{data.codeInsights.uniqueContributors}</span>
                      </div>
                      {data.codeInsights.mostActiveDay && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{strings.mostActiveDay}</span>
                          <span className="font-mono font-semibold text-xs">{data.codeInsights.mostActiveDay}</span>
                        </div>
                      )}
                      <div className="pt-3 border-t border-primary/10">
                        <span className="text-xs text-muted-foreground">{strings.dominantCategory}:</span>
                        <span className={`ml-2 px-2 py-0.5 text-xs rounded-sm ${getCategoryStyle(data.codeInsights.dominantCategory)}`}>
                          {data.codeInsights.dominantCategory}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (isLoadingCommits || isGenerating) && (
                  <div className="glass-card p-5 rounded-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <Skeleton className="w-24 h-4" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <Skeleton className="w-20 h-4" />
                        <Skeleton className="w-8 h-4" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="w-24 h-4" />
                        <Skeleton className="w-8 h-4" />
                      </div>
                      <div className="flex justify-between">
                        <Skeleton className="w-20 h-4" />
                        <Skeleton className="w-8 h-4" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Fun Fact */}
                {data?.funFact && (
                  <div className="glass-card p-5 rounded-sm border-l-2 border-amber-500/40">
                    <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      {strings.funFact}
                    </h4>
                    <p className="text-sm text-muted-foreground italic">{data.funFact}</p>
                  </div>
                )}

                {/* Recent Commits */}
                <div className="glass-card p-5 rounded-sm">
                  <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <GitCommit className="w-4 h-4 text-primary" />
                    {strings.recentCommits}
                  </h4>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {isLoadingCommits ? (
                      Array(5).fill(0).map((_, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Skeleton className="w-5 h-5 rounded-full flex-shrink-0" />
                          <div className="flex-1">
                            <Skeleton className="w-full h-4 mb-1" />
                            <Skeleton className="w-24 h-3" />
                          </div>
                        </div>
                      ))
                    ) : (
                      commits.slice(0, 8).map((commit) => (
                        <a
                          key={commit.sha}
                          href={commit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block group"
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${
                              commit.isMerge 
                                ? 'bg-purple-500/20 text-purple-400' 
                                : 'bg-primary/20 text-primary'
                            }`}>
                              {commit.isMerge ? (
                                <GitMerge className="w-3 h-3" />
                              ) : (
                                <GitCommit className="w-3 h-3" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                                {commit.message.split('\n')[0]}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {commit.author.username || commit.author.name} • {formatTime(commit.date)}
                              </p>
                            </div>
                          </div>
                        </a>
                      ))
                    )}
                  </div>
                  <Link
                    href="/git-history"
                    className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-primary/10 text-xs text-primary hover:underline"
                  >
                    {strings.viewAllCommits}
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* Commit Chart Section */}
      {(isLoadingCommits || commits.length > 0) && (
        <section className="border-t border-primary/10 mt-8 bg-card/20 relative z-10">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <CommitChart 
              dailyStats={dailyStats}
              commits={commits}
              isLoading={isLoadingCommits}
              loadingMessage={commitLoadStatus.message}
              loadingRange={commitLoadRangeLabel}
              loadedCount={commitLoadStatus.loadedCount}
            />
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-primary/20 bg-card/50 mt-auto relative z-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <div className="text-xs text-muted-foreground/50">
            {strings.footer}
          </div>
        </div>
      </footer>
    </main>
  )
}
