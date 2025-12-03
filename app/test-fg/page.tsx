'use client'

import { useState, useCallback } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import { SparklesIcon, RefreshCw } from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { FearGreedGauge, type FearGreedData } from './components/FearGreedGauge'

// Schema for streaming validation
const FearGreedSchema = z.object({
  index: z.number().min(0).max(100),
  classification: z.enum([
    'Extreme Fear',
    'Fear', 
    'Neutral',
    'Greed',
    'Extreme Greed'
  ]),
  classificationDE: z.enum([
    'Extreme Angst',
    'Angst',
    'Neutral', 
    'Gier',
    'Extreme Gier'
  ]),
  trend: z.enum(['rising', 'falling', 'stable']),
  drivers: z.array(z.object({
    factor: z.string(),
    sentiment: z.enum(['bullish', 'bearish', 'neutral']),
    weight: z.number().min(0).max(100),
    insight: z.string()
  })).min(3).max(6),
  quotes: z.array(z.object({
    username: z.string(),
    text: z.string(),
    sentiment: z.enum(['bullish', 'bearish', 'neutral'])
  })).min(2).max(5),
  summary: z.string(),
  periodComparison: z.object({
    today: z.number().min(0).max(100).optional(),
    last3Days: z.number().min(0).max(100).optional(),
    last7Days: z.number().min(0).max(100).optional(),
    insight: z.string()
  }).optional()
})

type DayRange = 1 | 3 | 7

/**
 * Fear & Greed Test Page
 * 
 * Test page for the Fear & Greed sentiment analysis component.
 * Allows selecting different time ranges (1, 3, or 7 days) and
 * displays the AI-generated sentiment analysis.
 */
export default function FearGreedTestPage() {
  const [selectedDays, setSelectedDays] = useState<DayRange>(7)
  const [hasStarted, setHasStarted] = useState(false)
  
  const { object, isLoading, error, submit } = useObject({
    api: '/test-fg/api/analyze',
    schema: FearGreedSchema,
  })
  
  const handleAnalyze = useCallback((days: DayRange) => {
    setSelectedDays(days)
    setHasStarted(true)
    submit({ days })
  }, [submit])
  
  const handleRefresh = useCallback(() => {
    submit({ days: selectedDays })
  }, [submit, selectedDays])

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="w-full border-b border-foreground/10 py-3">
        <div className="max-w-4xl mx-auto px-4 flex justify-between items-center">
          <h1 className="font-headline text-lg font-bold tracking-wide">
            Fear & Greed Index Test
          </h1>
          <div className="flex items-center gap-3">
            {isLoading && (
              <span className="flex items-center gap-1.5 text-amber-600 text-sm">
                <SparklesIcon className="h-4 w-4 animate-pulse" />
                <span>Analysiere...</span>
              </span>
            )}
            <ThemeSwitcher />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Day Range Selector */}
        <div className="flex flex-col items-center gap-6 mb-8">
          <p className="text-muted-foreground text-center max-w-md">
            Analysiere die Stimmung im TradingView Bitcoin-Chat und erhalte einen Fear & Greed Index basierend auf echten Diskussionen.
          </p>
          
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Zeitraum:</span>
            <div className="flex rounded-lg overflow-hidden border border-border">
              {([1, 3, 7] as DayRange[]).map((days) => (
                <button
                  key={days}
                  onClick={() => handleAnalyze(days)}
                  disabled={isLoading}
                  className={`px-4 py-2 text-sm font-medium transition-colors
                    ${selectedDays === days && hasStarted
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-background hover:bg-muted'
                    }
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                    border-r border-border last:border-r-0
                  `}
                >
                  {days === 1 ? 'Heute' : `${days} Tage`}
                </button>
              ))}
            </div>
            
            {hasStarted && !isLoading && (
              <button
                onClick={handleRefresh}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                title="Neu analysieren"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-center">
            <p className="text-red-500 text-sm">
              Fehler bei der Analyse: {error.message}
            </p>
          </div>
        )}

        {/* Initial State */}
        {!hasStarted && !isLoading && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-xl font-semibold mb-2">Bereit zur Analyse</h2>
            <p className="text-muted-foreground mb-6">
              Wähle einen Zeitraum oben aus, um die Sentiment-Analyse zu starten.
            </p>
          </div>
        )}

        {/* Fear & Greed Gauge */}
        {hasStarted && (
          <div className="max-w-md mx-auto">
            <FearGreedGauge 
              data={object as Partial<FearGreedData> | undefined}
              isLoading={isLoading}
              days={selectedDays}
            />
          </div>
        )}

        {/* Debug Info */}
        {hasStarted && object && (
          <details className="mt-8 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Raw JSON Response
            </summary>
            <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto max-h-96">
              {JSON.stringify(object, null, 2)}
            </pre>
          </details>
        )}
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-sm py-3">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-muted-foreground">
          <p>
            Diese Komponente kann in die Newspaper-Seite eingebunden werden.
            <br />
            Pfad: <code className="bg-muted px-1.5 py-0.5 rounded">/test-fg</code>
          </p>
        </div>
      </footer>
    </main>
  )
}

