'use client'

import { experimental_useObject as useObject } from '@ai-sdk/react'
import {
AlertCircle,
AlertTriangle,
ArrowRight,
Check,
CheckCircle2,
ChevronDown,
ChevronRight,
Circle,
Clock,
Copy,
ExternalLink,
GitPullRequest,
Layers,
RefreshCw,
Sparkles,
Target,
TrendingUp,
Users,
Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback,useEffect,useState } from 'react'
import { Skeleton } from '../components'
import { CONFIG,getUIStrings,type Language } from '../lib/config'
import { OpenClawIssuesNewspaperSchema,type IssueCluster } from '../lib/schemas'

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy Prompt'}
    </button>
  )
}

function PriorityBadge({ priority }: { priority: IssueCluster['priority'] }) {
  const styles = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-green-500/20 text-green-400 border-green-500/30',
  }
  
  return (
    <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded border ${styles[priority]}`}>
      {priority}
    </span>
  )
}

function ScopeBadge({ scope }: { scope: IssueCluster['estimatedScope'] }) {
  const styles = {
    small: 'bg-emerald-500/10 text-emerald-400',
    medium: 'bg-blue-500/10 text-blue-400',
    large: 'bg-purple-500/10 text-purple-400',
    epic: 'bg-pink-500/10 text-pink-400',
  }
  
  return (
    <span className={`px-2 py-0.5 text-[10px] rounded ${styles[scope]}`}>
      {scope}
    </span>
  )
}

function HealthBadge({ health, reason }: { health: string; reason: string }) {
  const styles: Record<string, string> = {
    healthy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'attention-needed': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    concerning: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  }
  
  const icons: Record<string, React.ReactNode> = {
    healthy: <CheckCircle2 className="w-4 h-4" />,
    'attention-needed': <AlertCircle className="w-4 h-4" />,
    concerning: <AlertTriangle className="w-4 h-4" />,
    critical: <AlertCircle className="w-4 h-4" />,
  }
  
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded border ${styles[health] || styles.healthy}`}>
      {icons[health]}
      <div>
        <span className="font-semibold capitalize">{health.replace('-', ' ')}</span>
        <p className="text-xs opacity-80">{reason}</p>
      </div>
    </div>
  )
}

function ClusterCard({ cluster, repoUrl, expanded, onToggle }: { 
  cluster: IssueCluster
  repoUrl: string
  expanded: boolean
  onToggle: () => void 
}) {
  return (
    <div className="glass-card rounded-sm overflow-hidden">
      <button 
        onClick={onToggle}
        className="w-full p-4 flex items-start gap-3 text-left hover:bg-primary/5 transition-colors"
      >
        <div className="mt-1">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="font-headline font-semibold">{cluster.name}</h4>
            <PriorityBadge priority={cluster.priority} />
            <ScopeBadge scope={cluster.estimatedScope} />
          </div>
          <p className="text-sm text-muted-foreground">{cluster.theme}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {cluster.issues?.length ?? 0} issues
            </span>
            {cluster.pullRequests && cluster.pullRequests.length > 0 && (
              <span className="flex items-center gap-1">
                <GitPullRequest className="w-3 h-3" />
                {cluster.pullRequests.length} PRs
              </span>
            )}
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {cluster.affectedAreas?.length ?? 0} areas
            </span>
          </div>
        </div>
      </button>
      
      {expanded && (
        <div className="border-t border-primary/10 p-4 space-y-4 bg-card/30">
          {/* Action Prompt */}
          {cluster.actionPrompt && (
            <div className="p-4 bg-primary/5 rounded border-l-2 border-primary">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase text-primary flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  Action Prompt
                </span>
                <CopyButton text={cluster.actionPrompt || ''} />
              </div>
              <p className="text-sm font-mono whitespace-pre-wrap">{cluster.actionPrompt}</p>
            </div>
          )}
          
          {/* Suggested Approach */}
          {cluster.suggestedApproach && cluster.suggestedApproach.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Suggested Approach</h5>
              <ol className="space-y-1">
                {cluster.suggestedApproach.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span className="text-primary font-mono text-xs mt-0.5">{idx + 1}.</span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          
          {/* Related Issues */}
          {cluster.issues && cluster.issues.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Related Issues</h5>
              <div className="space-y-1">
                {cluster.issues.map((issue) => {
                  if (!issue?.number) return null
                  return (
                    <a
                      key={issue.number}
                      href={`${repoUrl}/issues/${issue.number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 p-2 rounded hover:bg-primary/5 transition-colors group"
                    >
                      <Circle className="w-3 h-3 mt-1 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm group-hover:text-primary transition-colors">
                          #{issue.number}: {issue.title}
                        </span>
                        <p className="text-xs text-muted-foreground/70">{issue.relevance}</p>
                      </div>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  )
                })}
              </div>
            </div>
          )}
          
          {/* Related PRs */}
          {cluster.pullRequests && cluster.pullRequests.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Related Pull Requests</h5>
              <div className="space-y-1">
                {cluster.pullRequests.map((pr) => {
                  if (!pr?.number) return null
                  return (
                    <a
                      key={pr.number}
                      href={`${repoUrl}/pull/${pr.number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 p-2 rounded hover:bg-primary/5 transition-colors group"
                    >
                      <GitPullRequest className={`w-3 h-3 mt-1 ${
                        pr.status === 'merged' ? 'text-purple-400' : 
                        pr.status === 'draft' ? 'text-muted-foreground' : 'text-green-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm group-hover:text-primary transition-colors">
                          #{pr.number}: {pr.title}
                          {pr.status === 'draft' && <span className="text-xs text-muted-foreground ml-2">[DRAFT]</span>}
                          {pr.status === 'merged' && <span className="text-xs text-purple-400 ml-2">[MERGED]</span>}
                        </span>
                        <p className="text-xs text-muted-foreground/70">{pr.relevance}</p>
                      </div>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  )
                })}
              </div>
            </div>
          )}
          
          {/* Affected Areas */}
          {cluster.affectedAreas && cluster.affectedAreas.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Affected Areas</h5>
              <div className="flex flex-wrap gap-1">
                {cluster.affectedAreas.map((area, idx) => (
                  <span key={idx} className="px-2 py-1 text-xs bg-card rounded font-mono">
                    {area}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Dependencies */}
          {cluster.dependencies && cluster.dependencies.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Dependencies</h5>
              <div className="flex flex-wrap gap-1">
                {cluster.dependencies.map((dep, idx) => (
                  <span key={idx} className="px-2 py-1 text-xs bg-yellow-500/10 text-yellow-400 rounded">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function OpenClawIssuesPage() {
  const [language, setLanguage] = useState<Language>('en')
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  const [showBatchPrompt, setShowBatchPrompt] = useState(false)
  const [today, setToday] = useState<string>('')
  
  const strings = getUIStrings(language)
  
  const { 
    object: data, 
    submit, 
    isLoading,
    error,
  } = useObject({
    api: '/openclaw/api/issues',
    schema: OpenClawIssuesNewspaperSchema,
  })

  useEffect(() => {
    setToday(new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }))
  }, [language])

  const handleGenerate = useCallback(() => {
    submit({ language })
  }, [submit, language])

  const toggleCluster = useCallback((id: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  return (
    <main className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />

      {/* Header */}
      <header className="relative border-b border-primary/20 z-10">
        <div className="w-full border-b border-primary/10 bg-card/50 backdrop-blur-sm">
          <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-between items-center">
            <div className="flex items-center gap-3 text-xs">
              <Link href="/openclaw" className="text-muted-foreground hover:text-primary transition-colors">
                {strings.backLink}
              </Link>
              <span className="text-muted-foreground/40">|</span>
              <span className="text-muted-foreground">{today}</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Language Toggle */}
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setLanguage('en')}
                  className={`px-2 py-1 rounded ${language === 'en' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  EN
                </button>
                <button
                  onClick={() => setLanguage('de')}
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
              <GitPullRequest className="w-8 h-8 text-primary" />
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-primary/60" />
            </div>
            <h1 className="font-masthead text-4xl sm:text-5xl md:text-6xl gold-text tracking-wide mb-2">
              OpenClaw Issues Today
            </h1>
            <p className="text-muted-foreground">
              {language === 'de' 
                ? 'Cluster-Analyse • Schnittpunkte • Action Prompts'
                : 'Cluster Analysis • Intersections • Action Prompts'
              }
            </p>
            <div className="flex items-center justify-center gap-6 mt-6 text-sm text-muted-foreground">
              <a 
                href={CONFIG.repo.url}
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-primary transition-colors"
              >
                <AlertCircle className="w-4 h-4" />
                {CONFIG.repo.fullName}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
        <div className="newspaper-rule-gold" />
      </header>

      {/* Main Content */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
        
        {/* Generate Button */}
        {!data && !isLoading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-6">
              {language === 'de'
                ? 'Analysiert alle Issues und PRs, findet Schnittpunkte und erstellt actionable Prompts.'
                : 'Analyzes all issues and PRs, finds intersections, and creates actionable prompts.'
              }
            </p>
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-5 h-5" />
              {language === 'de' ? 'Analyse starten' : 'Start Analysis'}
            </button>
            <p className="text-xs text-muted-foreground mt-4">
              {language === 'de'
                ? 'Dies kann 1-2 Minuten dauern bei großen Repos'
                : 'This may take 1-2 minutes for large repos'
              }
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !data?.headline && (
          <div className="space-y-8">
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">
                {language === 'de' ? 'Analysiere Issues und PRs...' : 'Analyzing issues and PRs...'}
              </p>
            </div>
            <Skeleton className="h-12 w-3/4 mx-auto" />
            <Skeleton className="h-6 w-1/2 mx-auto" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive mb-8">
            <span className="font-semibold">{strings.error}:</span> {error.message}
            <button onClick={handleGenerate} className="ml-3 underline hover:no-underline">
              {strings.retry}
            </button>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-8">
            {/* Headline */}
            <div className="text-center mb-8">
              {data.headline && (
                <h2 className="font-masthead text-3xl sm:text-4xl lg:text-5xl gold-text leading-tight mb-3">
                  {data.headline}
                </h2>
              )}
              {data.subheadline && (
                <p className="font-headline text-lg sm:text-xl text-muted-foreground">
                  {data.subheadline}
                </p>
              )}
            </div>

            {/* Health & Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {data.summary?.healthScore && (
                <HealthBadge health={data.summary.healthScore} reason={data.summary.healthReason || ''} />
              )}
              
              {data.stats && (
                <>
                  <div className="glass-card p-4 rounded-sm">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-xs uppercase">Issues</span>
                    </div>
                    <p className="text-2xl font-bold">{data.stats.openIssues} <span className="text-sm font-normal text-muted-foreground">/ {data.stats.totalIssues}</span></p>
                  </div>
                  
                  <div className="glass-card p-4 rounded-sm">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <GitPullRequest className="w-4 h-4" />
                      <span className="text-xs uppercase">Pull Requests</span>
                    </div>
                    <p className="text-2xl font-bold">{data.stats.openPRs} <span className="text-sm font-normal text-muted-foreground">/ {data.stats.totalPRs}</span></p>
                  </div>
                  
                  {data.stats.avgIssueAge && (
                    <div className="glass-card p-4 rounded-sm">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs uppercase">Avg Issue Age</span>
                      </div>
                      <p className="text-2xl font-bold">{data.stats.avgIssueAge} <span className="text-sm font-normal text-muted-foreground">days</span></p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Summary */}
            {data.summary?.overview && (
              <div className="glass-card-gold p-6 rounded-sm">
                <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Overview
                </h3>
                <div className="prose prose-sm prose-invert max-w-none">
                  <p className="text-muted-foreground whitespace-pre-wrap">{data.summary.overview}</p>
                </div>
              </div>
            )}

            {/* Batch Prompt */}
            {data.batchPrompt && (
              <div className="glass-card p-6 rounded-sm border-2 border-primary/30">
                <button 
                  onClick={() => setShowBatchPrompt(!showBatchPrompt)}
                  className="w-full flex items-center justify-between"
                >
                  <h3 className="font-headline text-lg font-bold flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    {language === 'de' ? 'Sammel-Prompt' : 'Batch Prompt'}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({language === 'de' ? 'Mehrere Cluster auf einmal' : 'Multiple clusters at once'})
                    </span>
                  </h3>
                  {showBatchPrompt ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
                
                {showBatchPrompt && (
                  <div className="mt-4 space-y-3">
                    <div className="flex justify-end">
                      <CopyButton text={data.batchPrompt} />
                    </div>
                    <div className="p-4 bg-card/50 rounded font-mono text-sm whitespace-pre-wrap">
                      {data.batchPrompt}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick Wins */}
            {data.quickWins && data.quickWins.length > 0 && (
              <div>
                <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  {language === 'de' ? 'Quick Wins' : 'Quick Wins'}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({language === 'de' ? 'Niedriger Aufwand, hoher Wert' : 'Low effort, high value'})
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.quickWins.map((item) => {
                    if (!item?.number) return null
                    return (
                      <div key={item.number} className="glass-card p-4 rounded-sm border-l-2 border-emerald-500/40">
                        <div className="flex items-center gap-2 mb-2">
                          {item.type === 'issue' ? (
                            <AlertCircle className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <GitPullRequest className="w-4 h-4 text-muted-foreground" />
                          )}
                          <a 
                            href={`${CONFIG.repo.url}/${item.type === 'issue' ? 'issues' : 'pull'}/${item.number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold hover:text-primary transition-colors"
                          >
                            #{item.number}
                          </a>
                        </div>
                        <p className="text-sm mb-2">{item.title}</p>
                        <p className="text-xs text-muted-foreground mb-3">{item.reason}</p>
                        <div className="p-2 bg-emerald-500/5 rounded text-xs font-mono">
                          {item.actionPrompt}
                        </div>
                        <CopyButton text={item.actionPrompt || ''} className="mt-2" />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Clusters */}
            {data.clusters && data.clusters.length > 0 && (
              <div>
                <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  {language === 'de' ? 'Thematische Cluster' : 'Thematic Clusters'}
                  <span className="text-xs font-normal text-muted-foreground">({data.clusters.length})</span>
                </h3>
                <div className="space-y-3">
                  {data.clusters
                    .filter((c): c is IssueCluster => Boolean(c?.id && c?.name && c?.priority))
                    .sort((a, b) => {
                      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
                      return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
                    })
                    .map((cluster) => (
                      <ClusterCard
                        key={cluster.id}
                        cluster={cluster}
                        repoUrl={CONFIG.repo.url}
                        expanded={expandedClusters.has(cluster.id)}
                        onToggle={() => toggleCluster(cluster.id)}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Hotspots */}
            {data.hotspots && data.hotspots.length > 0 && (
              <div>
                <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-400" />
                  {language === 'de' ? 'Hotspots' : 'Hotspots'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.hotspots.map((hotspot, idx) => {
                    if (!hotspot?.area) return null
                    return (
                      <div key={idx} className="glass-card p-4 rounded-sm">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{hotspot.area}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            hotspot.trend === 'increasing' ? 'bg-red-500/20 text-red-400' :
                            hotspot.trend === 'decreasing' ? 'bg-green-500/20 text-green-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {hotspot.trend === 'increasing' ? '↑' : hotspot.trend === 'decreasing' ? '↓' : '→'} {hotspot.trend}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                          <span>{hotspot.issueCount} issues</span>
                          <span>{hotspot.prCount} PRs</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{hotspot.insight}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Stale Items */}
            {data.staleItems && ((data.staleItems.issues?.length ?? 0) > 0 || (data.staleItems.pullRequests?.length ?? 0) > 0) && (
              <div>
                <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  {language === 'de' ? 'Veraltete Items' : 'Stale Items'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.staleItems.issues && data.staleItems.issues.length > 0 && (
                    <div className="glass-card p-4 rounded-sm">
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Stale Issues
                      </h4>
                      <div className="space-y-2">
                        {data.staleItems.issues.map((issue) => {
                          if (!issue?.number) return null
                          return (
                            <div key={issue.number} className="text-sm">
                              <a 
                                href={`${CONFIG.repo.url}/issues/${issue.number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary transition-colors"
                              >
                                #{issue.number}: {issue.title}
                              </a>
                              <p className="text-xs text-muted-foreground">
                                {issue.daysSinceUpdate} days • {issue.suggestion}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  
                  {data.staleItems.pullRequests && data.staleItems.pullRequests.length > 0 && (
                    <div className="glass-card p-4 rounded-sm">
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <GitPullRequest className="w-4 h-4" />
                        Stale PRs
                      </h4>
                      <div className="space-y-2">
                        {data.staleItems.pullRequests.map((pr) => {
                          if (!pr?.number) return null
                          return (
                            <div key={pr.number} className="text-sm">
                              <a 
                                href={`${CONFIG.repo.url}/pull/${pr.number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary transition-colors"
                              >
                                #{pr.number}: {pr.title}
                              </a>
                              <p className="text-xs text-muted-foreground">
                                {pr.daysSinceUpdate} days • {pr.suggestion}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Contributor Insights */}
            {data.contributorInsights?.mostActive && data.contributorInsights.mostActive.length > 0 && (
              <div>
                <h3 className="font-headline text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  {language === 'de' ? 'Top Contributors' : 'Top Contributors'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.contributorInsights.mostActive.map((contributor) => {
                    if (!contributor?.username) return null
                    return (
                      <div key={contributor.username} className="glass-card p-4 rounded-sm">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {contributor.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                              <a 
                                href={`https://github.com/${contributor.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-sm hover:text-primary transition-colors"
                              >
                                @{contributor.username}
                              </a>
                              <p className="text-xs text-muted-foreground">
                                {contributor.issuesOpened} issues • {contributor.prsOpened} PRs
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">{contributor.focus}</p>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Outlook */}
            {data.outlook && (
              <div className="glass-card p-5 rounded-sm border-l-2 border-primary/40">
                <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-primary" />
                  {strings.outlook}
                </h4>
                <p className="text-sm text-muted-foreground">{data.outlook}</p>
              </div>
            )}

            {/* Regenerate Button */}
            <div className="text-center pt-8">
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                {language === 'de' ? 'Neu analysieren' : 'Re-analyze'}
              </button>
            </div>
          </div>
        )}
      </div>

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
