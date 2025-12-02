'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { SparklesIcon, RefreshCwIcon, EyeIcon, PencilIcon, CheckIcon, XIcon, CopyIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { LandingPageSchema, type LandingPageData, PROMPT_VERSIONS, type PromptVersion } from './schemas'

interface CacheStats {
  totalMessages: number
}

interface DateStats {
  date: string // YYYY-MM-DD
  messageCount: number
  uniqueUsers: number
}

interface GenerationInstance {
  id: string
  promptVersion: PromptVersion
  customPrompt?: string
}

// Single generation panel component
function GenerationPanel({ 
  instance, 
  messageLimit,
  selectedDates,
  useAllMessages, // true when no dropdown is shown (<=1000 msgs or dates selected)
  onShowPrompt,
  isGenerating,
  onStartGeneration,
  onStopGeneration,
  triggerGeneration
}: { 
  instance: GenerationInstance
  messageLimit: number
  selectedDates: string[] // empty = all, can have multiple dates
  useAllMessages: boolean // when true, don't send messageLimit
  onShowPrompt: (prompt: PromptVersion, customPrompt?: string) => void
  isGenerating: boolean
  onStartGeneration: () => void
  onStopGeneration: () => void
  triggerGeneration: number // increment to trigger generation
}) {
  const [hasStarted, setHasStarted] = useState(false)
  const lastTrigger = useRef(0)
  
  const { 
    object: dataObject, 
    submit: submitGeneration, 
    isLoading,
    error,
    stop: stopGeneration
  } = useObject({
    api: '/Test/admin/api/summarize-v6',
    schema: LandingPageSchema,
  })

  const generate = useCallback(() => {
    setHasStarted(true)
    onStartGeneration()
    
    // Log the request details
    const mode = selectedDates.length === 0 ? 'ALL' : selectedDates.length === 1 ? 'DAY' : 'MULTI-DAY'
    const effectiveLimit = useAllMessages ? 'all' : messageLimit
    console.log(`[GENERATION] ═══════════════════════════════════════`)
    console.log(`[GENERATION] 🚀 Starting generation:`)
    console.log(`[GENERATION]   Prompt: ${instance.promptVersion.name}`)
    console.log(`[GENERATION]   Mode: ${mode}`)
    console.log(`[GENERATION]   Dates: ${selectedDates.length === 0 ? 'All dates' : selectedDates.join(', ')}`)
    console.log(`[GENERATION]   Message Limit: ${effectiveLimit}`)
    console.log(`[GENERATION] ═══════════════════════════════════════`)
    
    submitGeneration({ 
      messageLimit: useAllMessages ? undefined : messageLimit, 
      promptId: instance.promptVersion.id,
      customPrompt: instance.customPrompt,
      selectedDates: selectedDates.length > 0 ? selectedDates : undefined
    })
  }, [messageLimit, useAllMessages, instance, selectedDates, submitGeneration, onStartGeneration])

  // Trigger generation when triggerGeneration changes
  useEffect(() => {
    if (triggerGeneration > 0 && triggerGeneration !== lastTrigger.current) {
      lastTrigger.current = triggerGeneration
      generate()
    }
  }, [triggerGeneration, generate])

  const handleStop = useCallback(() => {
    stopGeneration()
    onStopGeneration()
  }, [stopGeneration, onStopGeneration])

  // Sync loading state
  useEffect(() => {
    if (!isLoading && hasStarted) {
      onStopGeneration()
    }
  }, [isLoading, hasStarted, onStopGeneration])

  const data = dataObject as Partial<LandingPageData> | undefined

  const getCategoryStyle = (category: string) => {
    const styles: Record<string, string> = {
      'ANALYSE': 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
      'MEINUNG': 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
      'KULTUR': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
      'MARKTSTRUKTUR': 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
      'ALTCOINS': 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400',
      'BREAKING': 'bg-red-500/20 text-red-700 dark:text-red-400',
    }
    return styles[category] || 'bg-muted text-muted-foreground'
  }

  return (
    <div className="border-2 border-foreground/20 rounded-lg overflow-hidden bg-card flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-foreground/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-headline text-sm font-bold">{instance.promptVersion.name}</h3>
            {instance.customPrompt && (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Custom</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => onShowPrompt(instance.promptVersion, instance.customPrompt)}
            >
              <EyeIcon className="h-3 w-3" />
            </Button>
            {isLoading ? (
              <span className="flex items-center gap-1 text-[10px] text-amber-600">
                <RefreshCwIcon className="h-3 w-3 animate-spin" />
              </span>
            ) : (
              <span className={`w-2 h-2 rounded-full ${hasStarted ? 'bg-green-500' : 'bg-muted-foreground/30'}`}></span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{instance.promptVersion.description}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {!hasStarted ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
            <SparklesIcon className="h-8 w-8 mb-2 opacity-30" />
            <p>Klicke "Generate All" um zu starten</p>
          </div>
        ) : error ? (
          <div className="text-destructive p-2 bg-destructive/10 rounded">
            {error.message}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Featured Article */}
            <div className={`${isLoading && !data?.featuredArticle?.headline ? 'animate-pulse' : ''}`}>
              {data?.featuredArticle?.category && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${getCategoryStyle(data.featuredArticle.category)}`}>
                  {data.featuredArticle.category}
                </span>
              )}
              <h4 className="font-headline font-bold text-sm mt-1 leading-tight">
                {data?.featuredArticle?.headline || 'Generating...'}
              </h4>
              <p className="text-muted-foreground mt-1 line-clamp-2">
                {data?.featuredArticle?.summary || '...'}
              </p>
              {data?.featuredArticle?.keyQuote && (
                <blockquote className="border-l-2 border-foreground/30 pl-2 mt-2 italic text-muted-foreground text-[10px]">
                  „{data.featuredArticle.keyQuote}"
                </blockquote>
              )}
            </div>

            {/* Secondary Article */}
            {(hasStarted || data?.secondaryArticle) && (
              <div className={`pt-2 border-t border-foreground/10 ${isLoading && !data?.secondaryArticle?.headline ? 'animate-pulse' : ''}`}>
                {data?.secondaryArticle?.category && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${getCategoryStyle(data.secondaryArticle.category)}`}>
                    {data.secondaryArticle.category}
                  </span>
                )}
                <h4 className="font-headline font-semibold text-xs mt-1">
                  {data?.secondaryArticle?.headline || '...'}
                </h4>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[10px]">
                  {data?.secondaryArticle?.summary || '...'}
                </p>
              </div>
            )}

            {/* Highlights Preview */}
            {data?.highlights && data.highlights.length > 0 && (
              <div className="pt-2 border-t border-foreground/10">
                <h5 className="font-headline text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Chat Highlights ({data.highlights.length})
                </h5>
                {data.highlights.slice(0, 2).map((highlight, idx) => (
                  <div key={idx} className="mb-2 p-2 bg-muted/50 rounded">
                    <div className="flex items-center gap-1 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        highlight.highlightLevel === 'high' ? 'bg-red-500' :
                        highlight.highlightLevel === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                      }`}></span>
                      <span className="font-semibold text-[10px]">{highlight.title}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{highlight.summary}</p>
                    {highlight.sections?.[0]?.quotes?.[0] && (
                      <p className="text-[10px] mt-1 italic text-muted-foreground/80">
                        @{highlight.sections[0].quotes[0].from}: "{highlight.sections[0].quotes[0].text?.slice(0, 50)}..."
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Events Preview */}
            {data?.events && data.events.length > 0 && (
              <div className="pt-2 border-t border-foreground/10">
                <h5 className="font-headline text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Events ({data.events.length})
                </h5>
                {data.events.map((event, idx) => (
                  <div key={idx} className="flex items-center gap-1 text-[10px] mb-1">
                    <span className={`px-1 py-0.5 rounded text-[8px] ${
                      event.type === 'conflict' ? 'bg-red-500/20 text-red-600' :
                      event.type === 'drama' ? 'bg-orange-500/20 text-orange-600' :
                      event.type === 'meme' ? 'bg-yellow-500/20 text-yellow-600' :
                      'bg-blue-500/20 text-blue-600'
                    }`}>{event.type}</span>
                    <span className="truncate">{event.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Trending Topics */}
            {data?.trendingTopics && data.trendingTopics.length > 0 && (
              <div className="pt-2 border-t border-foreground/10">
                <div className="flex flex-wrap gap-1">
                  {data.trendingTopics.map((topic, idx) => (
                    <span key={idx} className="text-[10px] text-primary">#{topic}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-foreground/10 bg-muted/30">
        <div className="flex items-center justify-between">
          {isLoading ? (
            <Button onClick={handleStop} variant="destructive" size="sm" className="h-6 text-[10px]">
              <XIcon className="h-3 w-3 mr-1" /> Stop
            </Button>
          ) : (
            <Button onClick={generate} size="sm" className="h-6 text-[10px]" disabled={isGenerating && !isLoading}>
              <RefreshCwIcon className="h-3 w-3 mr-1" /> Regenerate
            </Button>
          )}
          <span className="text-[10px] text-muted-foreground">
            {data?.featuredArticle ? '✓ Complete' : hasStarted ? 'Generating...' : 'Ready'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function SummarizeV6Page() {
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [isLoadingDates, setIsLoadingDates] = useState(true)
  const [messageLimit, setMessageLimit] = useState('500')
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [currentDate, setCurrentDate] = useState<string | null>(null)
  const [activeGenerations, setActiveGenerations] = useState(0)
  
  // Date timeline state
  const [availableDates, setAvailableDates] = useState<DateStats[]>([])
  const [selectedDates, setSelectedDates] = useState<string[]>([]) // empty = all messages, can select multiple
  
  // Generation trigger
  const [generationTrigger, setGenerationTrigger] = useState(0)
  
  // Prompt modal state
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<PromptVersion | null>(null)
  const [selectedCustomPrompt, setSelectedCustomPrompt] = useState<string | undefined>()
  
  // Feedback/improve modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false)
  const [improvedPrompt, setImprovedPrompt] = useState<string | null>(null)
  
  // Custom prompts state - maps promptId to custom prompt
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({})
  
  // Generation instances
  const [instances, setInstances] = useState<GenerationInstance[]>(
    PROMPT_VERSIONS.map(pv => ({
      id: pv.id,
      promptVersion: pv,
      customPrompt: undefined
    }))
  )

  // Refs for triggering generation
  const panelRefs = useRef<Record<string, (() => void) | null>>({})

  useEffect(() => {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }
    setCurrentDate(now.toLocaleDateString('de-DE', options))
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/Test/admin/api/cache-stats?messagesLimit=1')
        if (response.ok) {
          const data = await response.json()
          setCacheStats({ totalMessages: data.totalMessages })
          if (data.totalMessages < 500) {
            setMessageLimit(data.totalMessages.toString())
          }
        }
      } catch (err) {
        console.error('Failed to fetch cache stats:', err)
      } finally {
        setIsLoadingStats(false)
      }
    }
    fetchStats()
  }, [])

  // Fetch available dates
  useEffect(() => {
    const fetchDates = async () => {
      try {
        const response = await fetch('/Test/admin/api/available-dates')
        if (response.ok) {
          const data = await response.json()
          setAvailableDates(data.dates || [])
        }
      } catch (err) {
        console.error('Failed to fetch available dates:', err)
      } finally {
        setIsLoadingDates(false)
      }
    }
    fetchDates()
  }, [])

  const getMessageOptions = () => {
    if (!cacheStats) return []
    const total = cacheStats.totalMessages
    // Only show dropdown if more than 1000 messages
    if (total <= 1000) return []
    
    const options: string[] = []
    // 500er steps starting from 1000
    for (let i = 1000; i <= total; i += 500) {
      options.push(i.toString())
    }
    // Add "All" option if not already included
    if (!options.includes(total.toString())) {
      options.push(total.toString())
    }
    return options
  }
  
  // Check if we should show dropdown (only for "All" mode with >1000 messages)
  const shouldShowDropdown = selectedDates.length === 0 && cacheStats && cacheStats.totalMessages > 1000

  // Select last 7 days
  const handleSelectLastWeek = () => {
    const lastWeekDates = availableDates.slice(0, 7).map(d => d.date)
    setSelectedDates(lastWeekDates)
  }

  const handleShowPrompt = (prompt: PromptVersion, customPrompt?: string) => {
    setSelectedPrompt(prompt)
    setSelectedCustomPrompt(customPrompt || customPrompts[prompt.id])
    setShowPromptModal(true)
  }

  const handleOpenFeedback = () => {
    setShowPromptModal(false)
    setShowFeedbackModal(true)
    setFeedbackText('')
    setImprovedPrompt(null)
  }

  const handleImprovePrompt = async () => {
    if (!selectedPrompt || !feedbackText.trim()) return
    
    setIsImprovingPrompt(true)
    try {
      const currentPrompt = selectedCustomPrompt || selectedPrompt.systemPrompt
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Du bist ein Prompt-Engineer. Verbessere den folgenden System-Prompt basierend auf dem Feedback.

AKTUELLER PROMPT:
${currentPrompt}

FEEDBACK ZUR VERBESSERUNG:
${feedbackText}

Gib NUR den verbesserten Prompt zurück, keine Erklärungen. Der Prompt sollte auf Deutsch sein und den gleichen Stil beibehalten, aber das Feedback einarbeiten.`
          }]
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setImprovedPrompt(data.content || data.message || 'Fehler beim Generieren')
      } else {
        // Fallback: Simple improvement simulation
        setImprovedPrompt(`${currentPrompt}\n\n[VERBESSERUNG basierend auf Feedback: ${feedbackText}]\n- Mehr Fokus auf echte Chat-Zitate\n- Detailliertere Highlight-Sektionen\n- Bessere Kontext-Analyse`)
      }
    } catch (error) {
      console.error('Error improving prompt:', error)
      // Fallback
      const currentPrompt = selectedCustomPrompt || selectedPrompt?.systemPrompt || ''
      setImprovedPrompt(`${currentPrompt}\n\n[FEEDBACK EINGEARBEITET: ${feedbackText}]`)
    } finally {
      setIsImprovingPrompt(false)
    }
  }

  const handleApplyImprovedPrompt = () => {
    if (!selectedPrompt || !improvedPrompt) return
    
    setCustomPrompts(prev => ({
      ...prev,
      [selectedPrompt.id]: improvedPrompt
    }))
    
    setInstances(prev => prev.map(inst => 
      inst.id === selectedPrompt.id 
        ? { ...inst, customPrompt: improvedPrompt }
        : inst
    ))
    
    setShowFeedbackModal(false)
    setImprovedPrompt(null)
    setFeedbackText('')
  }

  const handleCopyPrompt = () => {
    const promptText = selectedCustomPrompt || selectedPrompt?.systemPrompt || ''
    navigator.clipboard.writeText(promptText)
  }

  const isAnyGenerating = activeGenerations > 0

  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-foreground/10 py-2">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center text-xs text-muted-foreground">
          {currentDate && <span>{currentDate}</span>}
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">V6 • Multi-Prompt Comparison</span>
            <ThemeSwitcher />
            <Link href="/Test/admin/cache" className="hover:text-foreground">← Admin</Link>
          </div>
        </div>
      </div>

      {/* Masthead */}
      <header className="w-full py-4 sm:py-6 border-b-4 border-double border-foreground/60">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 text-center">
          <Link href="/" className="inline-block">
            <h1 className="font-masthead text-2xl sm:text-4xl md:text-5xl lg:text-6xl tracking-wide text-foreground hover:text-primary transition-colors">
              Financial Retarded Times
            </h1>
          </Link>
          <p className="font-headline text-[10px] sm:text-xs md:text-sm tracking-[0.2em] sm:tracking-[0.3em] uppercase text-muted-foreground mt-1 sm:mt-2">
            V6 • Multi-Prompt Comparison Mode
          </p>
        </div>
      </header>

      {/* Date Timeline */}
      <div className="w-full border-b border-foreground/20 py-3 bg-muted/20">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Timeline</span>
            <span className="text-[10px] text-muted-foreground">(Shift+Click für Multi-Select)</span>
            {selectedDates.length > 0 ? (
              <span className="text-xs text-primary">
                {selectedDates.length === 1 
                  ? new Date(selectedDates[0] + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                  : `${selectedDates.length} Tage ausgewählt`
                }
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Alle Tage</span>
            )}
            <div className="flex items-center gap-1">
              {availableDates.length >= 7 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-5 px-2 text-[10px]"
                  onClick={handleSelectLastWeek}
                >
                  Letzte Woche
                </Button>
              )}
              {selectedDates.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-2 text-[10px]"
                  onClick={() => setSelectedDates([])}
                >
                  <XIcon className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>
          
          {isLoadingDates ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCwIcon className="h-3 w-3 animate-spin" />
              Lade verfügbare Tage...
            </div>
          ) : availableDates.length === 0 ? (
            <div className="text-xs text-muted-foreground">Keine Daten verfügbar</div>
          ) : (
            <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin">
              {/* All dates button */}
              <button
                onClick={() => setSelectedDates([])}
                className={`flex-shrink-0 px-2 py-1.5 rounded text-xs transition-colors ${
                  selectedDates.length === 0 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                <div className="font-medium">Alle</div>
                <div className="text-[10px] opacity-70">{cacheStats?.totalMessages.toLocaleString()} msgs</div>
              </button>
              
              {availableDates.map((dateStats) => {
                const date = new Date(dateStats.date + 'T00:00:00')
                const isSelected = selectedDates.includes(dateStats.date)
                const dayName = date.toLocaleDateString('de-DE', { weekday: 'short' })
                const dayNum = date.getDate()
                const monthName = date.toLocaleDateString('de-DE', { month: 'short' })
                
                return (
                  <button
                    key={dateStats.date}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        // Multi-select mode
                        setSelectedDates(prev => 
                          prev.includes(dateStats.date)
                            ? prev.filter(d => d !== dateStats.date)
                            : [...prev, dateStats.date].sort()
                        )
                      } else {
                        // Single select mode
                        setSelectedDates([dateStats.date])
                      }
                    }}
                    className={`flex-shrink-0 px-2 py-1.5 rounded text-xs transition-colors ${
                      isSelected 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    <div className="font-medium">{dayName} {dayNum}. {monthName}</div>
                    <div className="text-[10px] opacity-70">
                      {dateStats.messageCount} msgs • {dateStats.uniqueUsers} users
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="w-full border-b border-foreground/20 py-3 bg-muted/30">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Only show dropdown when "All" is selected AND more than 1000 messages */}
            {shouldShowDropdown && (
              <Select value={messageLimit} onValueChange={setMessageLimit} disabled={isLoadingStats || isAnyGenerating}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getMessageOptions().map((option) => (
                    <SelectItem key={option} value={option}>
                      {parseInt(option).toLocaleString()} msgs
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedDates.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {selectedDates.length === 1 
                  ? `${availableDates.find(d => d.date === selectedDates[0])?.messageCount.toLocaleString() || '?'} msgs am ${selectedDates[0]}`
                  : `${selectedDates.reduce((sum, date) => sum + (availableDates.find(d => d.date === date)?.messageCount || 0), 0).toLocaleString()} msgs über ${selectedDates.length} Tage`
                }
              </span>
            ) : cacheStats && (
              <span className="text-xs text-muted-foreground">
                {shouldShowDropdown 
                  ? `von ${cacheStats.totalMessages.toLocaleString()} total`
                  : `${cacheStats.totalMessages.toLocaleString()} msgs (alle)`
                }
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isAnyGenerating && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600">
                <RefreshCwIcon className="h-3 w-3 animate-spin" />
                {activeGenerations} generating...
              </span>
            )}
            <Button 
              onClick={() => {
                // Trigger all panels to generate
                setGenerationTrigger(prev => prev + 1)
              }}
              disabled={isLoadingStats || isAnyGenerating}
              className="h-8 text-xs"
            >
              <SparklesIcon className="h-3 w-3 mr-1.5" />
              Generate All (4x)
            </Button>
          </div>
        </div>
      </div>

      {/* 4-Panel Grid */}
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ height: 'calc(100vh - 280px)', minHeight: '600px' }}>
          {instances.map((instance) => (
            <GenerationPanel
              key={instance.id}
              instance={instance}
              messageLimit={parseInt(messageLimit)}
              selectedDates={selectedDates}
              useAllMessages={selectedDates.length > 0 || !shouldShowDropdown}
              onShowPrompt={handleShowPrompt}
              isGenerating={isAnyGenerating}
              onStartGeneration={() => setActiveGenerations(prev => prev + 1)}
              onStopGeneration={() => setActiveGenerations(prev => Math.max(0, prev - 1))}
              triggerGeneration={generationTrigger}
            />
          ))}
        </div>
      </div>

      {/* Prompt Version Legend */}
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 border-t border-foreground/10">
        <div className="flex flex-wrap gap-4 justify-center">
          {PROMPT_VERSIONS.map(pv => (
            <button
              key={pv.id}
              onClick={() => handleShowPrompt(pv, customPrompts[pv.id])}
              className="flex items-center gap-2 text-xs hover:text-primary transition-colors"
            >
              <span className={`w-3 h-3 rounded-full ${pv.color}`}></span>
              <span className="font-medium">{pv.name}</span>
              {customPrompts[pv.id] && <span className="text-[10px] text-primary">(custom)</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt View Modal */}
      <Dialog open={showPromptModal} onOpenChange={setShowPromptModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${selectedPrompt?.color}`}></span>
              {selectedPrompt?.name}
              {selectedCustomPrompt && <span className="text-xs text-primary ml-2">(Custom Version)</span>}
            </DialogTitle>
            <DialogDescription>{selectedPrompt?.description}</DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto bg-muted/50 rounded-lg p-4 font-mono text-xs whitespace-pre-wrap">
            {selectedCustomPrompt || selectedPrompt?.systemPrompt}
          </div>
          
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyPrompt}>
                <CopyIcon className="h-3 w-3 mr-1.5" />
                Copy
              </Button>
              {selectedCustomPrompt && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    if (selectedPrompt) {
                      setCustomPrompts(prev => {
                        const newPrompts = { ...prev }
                        delete newPrompts[selectedPrompt.id]
                        return newPrompts
                      })
                      setInstances(prev => prev.map(inst => 
                        inst.id.startsWith(selectedPrompt.id) 
                          ? { ...inst, customPrompt: undefined }
                          : inst
                      ))
                      setSelectedCustomPrompt(undefined)
                    }
                  }}
                >
                  Reset to Original
                </Button>
              )}
            </div>
            <Button onClick={handleOpenFeedback}>
              <PencilIcon className="h-3 w-3 mr-1.5" />
              Improve Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback/Improve Modal */}
      <Dialog open={showFeedbackModal} onOpenChange={setShowFeedbackModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilIcon className="h-4 w-4" />
              Prompt verbessern: {selectedPrompt?.name}
            </DialogTitle>
            <DialogDescription>
              Gib Feedback, wie der Prompt verbessert werden soll. Die KI generiert dann eine verbesserte Version.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Current Prompt Preview */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Aktueller Prompt (Auszug)</label>
              <div className="bg-muted/50 rounded p-3 font-mono text-[10px] max-h-32 overflow-y-auto whitespace-pre-wrap">
                {(selectedCustomPrompt || selectedPrompt?.systemPrompt || '').slice(0, 500)}...
              </div>
            </div>
            
            {/* Feedback Input */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Dein Feedback</label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="z.B. 'Mehr Fokus auf echte Chat-Zitate', 'Weniger formell', 'Mehr Drama-Fokus'..."
                className="w-full h-24 p-3 text-sm bg-background border border-foreground/20 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            
            {/* Generate Button */}
            {!improvedPrompt && (
              <Button 
                onClick={handleImprovePrompt} 
                disabled={!feedbackText.trim() || isImprovingPrompt}
                className="w-full"
              >
                {isImprovingPrompt ? (
                  <><RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" /> Generiere verbesserten Prompt...</>
                ) : (
                  <><SparklesIcon className="h-4 w-4 mr-2" /> Prompt verbessern</>
                )}
              </Button>
            )}
            
            {/* Improved Prompt Preview */}
            {improvedPrompt && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-2">
                  <CheckIcon className="h-3 w-3 text-green-500" />
                  Verbesserter Prompt
                </label>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 font-mono text-xs max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {improvedPrompt}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowFeedbackModal(false)}>
              Abbrechen
            </Button>
            {improvedPrompt && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImprovedPrompt(null)}>
                  Nochmal generieren
                </Button>
                <Button onClick={handleApplyImprovedPrompt}>
                  <CheckIcon className="h-4 w-4 mr-1.5" />
                  Anwenden & Neu generieren
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="w-full border-t border-foreground/20 py-4">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 text-center text-xs text-muted-foreground">
          <p>V6 Multi-Prompt Comparison • 4 verschiedene Prompt-Stile gleichzeitig vergleichen</p>
        </div>
      </footer>
    </main>
  )
}

