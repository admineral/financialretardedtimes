'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { 
  ArrowLeft,
  RefreshCw,
  Database,
  Clock,
  GitCommit,
  Users,
  Calendar,
  Settings,
  Save,
  CheckCircle,
  AlertCircle,
  Loader2,
  GitBranch,
  Zap,
  Globe,
} from 'lucide-react'
import { 
  getSettings, 
  updateSettings, 
  syncCommits, 
  initializeCache,
  getCacheStats,
  getDailyStats,
  getSyncLogs,
  getSyncStats,
  type OpenClawSettings,
  type DailyStats,
  type SyncLog,
  type SyncStats,
} from '../actions/cache'
import { CONFIG } from '../lib/config'

export default function OpenClawSettingsPage() {
  const [settings, setSettings] = useState<OpenClawSettings | null>(null)
  const [cacheStats, setCacheStats] = useState<{
    totalCommits: number
    totalDays: number
    oldestCommit: string | null
    newestCommit: string | null
    uniqueContributors: number
  } | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null)
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [syncResult, setSyncResult] = useState<{ newCommits: number; totalCached: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const [editedSettings, setEditedSettings] = useState<Partial<OpenClawSettings>>({})

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [settingsData, statsData, dailyStatsData, logsData, syncStatsData] = await Promise.all([
        getSettings(),
        getCacheStats(),
        getDailyStats(30),
        getSyncLogs(10),
        getSyncStats(),
      ])
      setSettings(settingsData)
      setCacheStats(statsData)
      setDailyStats(dailyStatsData)
      setSyncLogs(logsData)
      setSyncStats(syncStatsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async () => {
    if (Object.keys(editedSettings).length === 0) return
    
    setIsSaving(true)
    setSaveStatus('idle')
    
    try {
      const result = await updateSettings(editedSettings)
      if (result.success) {
        setSettings(prev => prev ? { ...prev, ...editedSettings } : null)
        setEditedSettings({})
        setSaveStatus('success')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveStatus('error')
        setError(result.error || 'Failed to save settings')
      }
    } catch (err) {
      setSaveStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSync = async (fullSync: boolean = false) => {
    setIsSyncing(true)
    setSyncResult(null)
    setError(null)
    
    try {
      const result = await syncCommits(fullSync)
      if (result.success) {
        setSyncResult({ newCommits: result.newCommits, totalCached: result.totalCached })
        await loadData()
      } else {
        setError(result.error || 'Sync failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleInitialize = async () => {
    const days = editedSettings.defaultDays ?? settings?.defaultDays ?? 7
    setIsInitializing(true)
    setError(null)
    
    try {
      const result = await initializeCache(days)
      if (result.success) {
        setSyncResult({ newCommits: result.commits, totalCached: result.commits })
        await loadData()
      } else {
        setError(result.error || 'Initialization failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initialization failed')
    } finally {
      setIsInitializing(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const hasChanges = Object.keys(editedSettings).length > 0

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />

      {/* Header */}
      <header className="relative border-b border-primary/20 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/openclaw"
                className="p-2 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="font-masthead text-2xl sm:text-3xl gold-text flex items-center gap-3">
                  <Settings className="w-6 h-6" />
                  OpenClaw Settings
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage commit caching and display preferences
                </p>
              </div>
            </div>
            
            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-sm font-headline text-sm transition-all
                ${hasChanges 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
                }
              `}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveStatus === 'success' ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 relative z-10">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-destructive hover:text-destructive/80"
            >
              ×
            </button>
          </div>
        )}

        {/* Sync Result */}
        {syncResult && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/30 rounded-sm flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-sm">
              <span className="font-semibold">{syncResult.newCommits}</span> new commits synced. 
              Total cached: <span className="font-semibold">{syncResult.totalCached}</span>
            </p>
            <button 
              onClick={() => setSyncResult(null)}
              className="ml-auto text-primary hover:text-primary/80"
            >
              ×
            </button>
          </div>
        )}

        <div className="grid gap-6">
          {/* Cache Statistics */}
          <section className="glass-card p-6 rounded-sm">
            <h2 className="font-headline text-lg font-bold mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Cache Statistics
            </h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-card/50 rounded-sm border border-primary/10">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <GitCommit className="w-3 h-3" />
                  Total Commits
                </div>
                <p className="font-mono text-2xl font-bold">{cacheStats?.totalCommits || 0}</p>
              </div>
              
              <div className="p-4 bg-card/50 rounded-sm border border-primary/10">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Calendar className="w-3 h-3" />
                  Days Cached
                </div>
                <p className="font-mono text-2xl font-bold">{cacheStats?.totalDays || 0}</p>
              </div>
              
              <div className="p-4 bg-card/50 rounded-sm border border-primary/10">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Users className="w-3 h-3" />
                  Contributors
                </div>
                <p className="font-mono text-2xl font-bold">{cacheStats?.uniqueContributors || 0}</p>
              </div>
              
              <div className="p-4 bg-card/50 rounded-sm border border-primary/10">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <GitBranch className="w-3 h-3" />
                  Repository
                </div>
                <p className="font-mono text-sm truncate">{CONFIG.repo.fullName}</p>
              </div>
            </div>

            {/* Date Range */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
              <div>
                <span className="text-muted-foreground/60">Oldest:</span>{' '}
                <span className="font-mono">{formatDate(cacheStats?.oldestCommit || null)}</span>
              </div>
              <div>
                <span className="text-muted-foreground/60">Newest:</span>{' '}
                <span className="font-mono">{formatDate(cacheStats?.newestCommit || null)}</span>
              </div>
            </div>

            {/* Daily Breakdown */}
            {dailyStats.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Daily Breakdown (Last {dailyStats.length} days)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-primary/10">
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Date</th>
                        <th className="text-right py-2 px-3 text-muted-foreground font-medium">Commits</th>
                        <th className="text-right py-2 px-3 text-muted-foreground font-medium">Merges</th>
                        <th className="text-right py-2 px-3 text-muted-foreground font-medium">Contributors</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium hidden sm:table-cell">Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyStats.slice(0, 14).map((day, idx) => {
                        const date = new Date(day.date + 'T12:00:00')
                        const isToday = day.date === new Date().toISOString().split('T')[0]
                        const maxCommits = Math.max(...dailyStats.map(d => d.commitCount))
                        const barWidth = maxCommits > 0 ? (day.commitCount / maxCommits) * 100 : 0
                        
                        return (
                          <tr 
                            key={day.date} 
                            className={`border-b border-primary/5 ${isToday ? 'bg-primary/5' : ''}`}
                          >
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                {isToday && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                                <span className="font-mono">
                                  {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            </td>
                            <td className="text-right py-2 px-3 font-mono font-semibold">{day.commitCount}</td>
                            <td className="text-right py-2 px-3 font-mono text-purple-400">{day.mergeCount}</td>
                            <td className="text-right py-2 px-3 font-mono text-muted-foreground">{day.uniqueContributors}</td>
                            <td className="py-2 px-3 hidden sm:table-cell">
                              <div className="w-full bg-muted/30 rounded-full h-2">
                                <div 
                                  className="bg-primary/60 h-2 rounded-full transition-all"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {dailyStats.length > 14 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing 14 of {dailyStats.length} days
                  </p>
                )}
              </div>
            )}

            {/* Sync Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleSync(false)}
                disabled={isSyncing || isInitializing}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-sm text-sm font-headline hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Sync New Commits
              </button>
              
              <button
                onClick={() => handleSync(true)}
                disabled={isSyncing || isInitializing}
                className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-sm text-sm font-headline hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="w-4 h-4" />
                Full Resync
              </button>
              
              {(!cacheStats?.totalCommits || cacheStats.totalCommits === 0) && (
                <button
                  onClick={handleInitialize}
                  disabled={isSyncing || isInitializing}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-sm text-sm font-headline hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isInitializing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4" />
                  )}
                  Initialize Cache (Last {editedSettings.defaultDays ?? settings?.defaultDays ?? 7} days)
                </button>
              )}
            </div>

            {/* Last Sync Info */}
            {settings?.lastSyncAt && (
              <p className="mt-4 text-xs text-muted-foreground">
                Last sync: {formatDate(settings.lastSyncAt)} ({formatRelativeTime(settings.lastSyncAt)})
                {settings.lastSyncCommitCount > 0 && (
                  <span> • {settings.lastSyncCommitCount} commits</span>
                )}
              </p>
            )}
          </section>

          {/* Display Settings */}
          <section className="glass-card p-6 rounded-sm">
            <h2 className="font-headline text-lg font-bold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Display Settings
            </h2>
            
            <div className="space-y-6">
              {/* Default Days */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Default Time Range (Days)
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  How many days of commits to load on initial page visit
                </p>
                <div className="flex items-center gap-2">
                  {[1, 3, 7, 14, 30].map(days => (
                    <button
                      key={days}
                      onClick={() => setEditedSettings(prev => ({ ...prev, defaultDays: days }))}
                      className={`
                        px-4 py-2 rounded-sm font-mono text-sm transition-all
                        ${(editedSettings.defaultDays ?? settings?.defaultDays) === days
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                        }
                      `}
                    >
                      {days}D
                    </button>
                  ))}
                </div>
              </div>

              {/* Cache Duration */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Cache Duration (Hours)
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  How long to cache data before refresh (for cheap Vercel hosting)
                </p>
                <div className="flex items-center gap-2">
                  {[1, 6, 12, 24, 48].map(hours => (
                    <button
                      key={hours}
                      onClick={() => setEditedSettings(prev => ({ ...prev, cacheDurationHours: hours }))}
                      className={`
                        px-4 py-2 rounded-sm font-mono text-sm transition-all
                        ${(editedSettings.cacheDurationHours ?? settings?.cacheDurationHours) === hours
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                        }
                      `}
                    >
                      {hours}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Commits Per Sync */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max Commits Per Sync
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Maximum number of commits to fetch from GitHub per sync operation
                </p>
                <div className="flex items-center gap-2">
                  {[30, 50, 100, 200].map(count => (
                    <button
                      key={count}
                      onClick={() => setEditedSettings(prev => ({ ...prev, maxCommitsPerSync: count }))}
                      className={`
                        px-4 py-2 rounded-sm font-mono text-sm transition-all
                        ${(editedSettings.maxCommitsPerSync ?? settings?.maxCommitsPerSync) === count
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                        }
                      `}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Language */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Default Language
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Language for the newspaper content and UI
                </p>
                <div className="flex items-center gap-2">
                  {[
                    { code: 'en', label: 'English' },
                    { code: 'de', label: 'Deutsch' },
                  ].map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => setEditedSettings(prev => ({ ...prev, defaultLanguage: lang.code as 'en' | 'de' }))}
                      className={`
                        px-4 py-2 rounded-sm text-sm transition-all
                        ${(editedSettings.defaultLanguage ?? settings?.defaultLanguage) === lang.code
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                        }
                      `}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Display Timezone
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Timezone for displaying commit times
                </p>
                <select
                  value={editedSettings.displayTimezone ?? settings?.displayTimezone ?? 'UTC'}
                  onChange={(e) => setEditedSettings(prev => ({ ...prev, displayTimezone: e.target.value }))}
                  className="w-full max-w-xs px-3 py-2 bg-muted border border-primary/20 rounded-sm text-sm"
                >
                  <option value="UTC">UTC</option>
                  <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Sync Logs */}
          <section className="glass-card p-6 rounded-sm">
            <h2 className="font-headline text-lg font-bold mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Sync History
            </h2>
            
            {/* Sync Stats */}
            {syncStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="p-3 bg-card/50 rounded-sm border border-primary/10">
                  <div className="text-xs text-muted-foreground mb-1">Total Syncs</div>
                  <p className="font-mono text-lg font-bold">{syncStats.totalSyncs}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-sm border border-emerald-500/20">
                  <div className="text-xs text-muted-foreground mb-1">Successful</div>
                  <p className="font-mono text-lg font-bold text-emerald-400">{syncStats.successfulSyncs}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-sm border border-red-500/20">
                  <div className="text-xs text-muted-foreground mb-1">Failed</div>
                  <p className="font-mono text-lg font-bold text-red-400">{syncStats.failedSyncs}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-sm border border-primary/10">
                  <div className="text-xs text-muted-foreground mb-1">Avg Duration</div>
                  <p className="font-mono text-lg font-bold">
                    {syncStats.avgDurationMs ? `${Math.round(syncStats.avgDurationMs)}ms` : 'N/A'}
                  </p>
                </div>
              </div>
            )}

            {/* Recent Logs */}
            {syncLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-primary/10">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Time</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Type</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">New</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncLogs.map((log) => (
                      <tr key={log.id} className="border-b border-primary/5">
                        <td className="py-2 px-3 font-mono text-xs">
                          {formatDate(log.startedAt)}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            log.syncType === 'full' 
                              ? 'bg-amber-500/20 text-amber-400'
                              : log.syncType === 'initialize'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-primary/20 text-primary'
                          }`}>
                            {log.syncType}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`flex items-center gap-1 ${
                            log.status === 'success' 
                              ? 'text-emerald-400'
                              : log.status === 'error'
                                ? 'text-red-400'
                                : 'text-muted-foreground'
                          }`}>
                            {log.status === 'success' && <CheckCircle className="w-3 h-3" />}
                            {log.status === 'error' && <AlertCircle className="w-3 h-3" />}
                            {log.status === 'pending' && <Loader2 className="w-3 h-3 animate-spin" />}
                            {log.status}
                          </span>
                        </td>
                        <td className="text-right py-2 px-3 font-mono">
                          {log.commitsNew > 0 ? `+${log.commitsNew}` : '0'}
                        </td>
                        <td className="text-right py-2 px-3 font-mono text-muted-foreground">
                          {log.durationMs ? `${log.durationMs}ms` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sync logs yet. Run a sync to see history.</p>
            )}
          </section>

          {/* About */}
          <section className="glass-card p-6 rounded-sm">
            <h2 className="font-headline text-lg font-bold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              How Caching Works
            </h2>
            
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Incremental Sync:</strong> When you click "Sync New Commits", 
                only commits newer than your most recent cached commit are fetched from GitHub.
              </p>
              <p>
                <strong className="text-foreground">Full Resync:</strong> Re-fetches the last {settings?.maxCommitsPerSync || 100} commits 
                from GitHub, useful if you suspect missing data.
              </p>
              <p>
                <strong className="text-foreground">Cache Duration:</strong> Uses Next.js <code className="px-1 py-0.5 bg-muted rounded">use cache</code> directive 
                with <code className="px-1 py-0.5 bg-muted rounded">cacheLife</code> for cheap Vercel hosting. 
                The page will revalidate after {settings?.cacheDurationHours || 24} hours.
              </p>
              <p>
                <strong className="text-foreground">Database Storage:</strong> Commits are stored in Supabase, 
                allowing visualization by day, contributor stats, and historical analysis.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
