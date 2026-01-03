/**
 * ============================================================================
 * Admin Dashboard - Main Hub
 * ============================================================================
 * 
 * Central admin interface for TradingView chat sync management.
 * 
 * ## Features
 * - Quick stats: Total messages, users, profiles, last sync time
 * - Navigation to detailed admin sections (Cache, Chat Archive, Newspaper)
 * - Top chatters leaderboard (top 5 by message count)
 * - Sync status overview per room
 * - Recent sync history (last 5 runs)
 * - Quick sync trigger button
 * - System health indicator
 * 
 * ## Dependencies
 * - @/components/ui/* - UI components (Card, Button, Badge, Separator)
 * - @/lib/supabase/server - Database client (via API)
 * - date-fns - Date formatting
 * - lucide-react - Icons
 * 
 * ## API Endpoints Used
 * - GET /Test/admin/api/cache-stats - Fetch dashboard statistics
 * - POST /api/cron/sync-chat - Trigger manual sync
 * 
 * ## Auto-refresh
 * - Stats refresh every 60 seconds
 * 
 * @see /Test/admin/cache - Detailed cache management page
 * @see /Test/admin/README.md - Full documentation
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  DatabaseIcon,
  ActivityIcon,
  MessageSquareIcon,
  UsersIcon,
  ClockIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  ZapIcon,
  SettingsIcon,
  BarChart3Icon,
  ServerIcon,
  CalendarIcon
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

interface DashboardStats {
  totalMessages: number
  totalProfiles: number
  totalActivityRecords: number
  syncStatuses: Array<{
    room_id: string
    last_sync_at: string
    total_messages: number
    is_full_history: boolean
    newest_message_time: string | null
  }>
  syncHistory: Array<{
    id: number
    room_id: string
    started_at: string
    completed_at: string | null
    success: boolean
    messages_inserted: number
    trigger_type: string
  }>
  users: Array<{
    username: string
    message_count: number
  }>
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; synced: number } | null>(null)

  const fetchStats = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/Test/admin/api/cache-stats?messagesLimit=10')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const triggerSync = async () => {
    setIsSyncing(true)
    setSyncResult(null)
    
    try {
      const response = await fetch('/api/cron/sync-chat?trigger=manual', { method: 'POST' })
      const data = await response.json()
      setSyncResult({ success: data.success, synced: data.totalSynced || 0 })
      await fetchStats()
    } catch (error) {
      console.error('Sync failed:', error)
      setSyncResult({ success: false, synced: 0 })
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  const lastSync = stats?.syncHistory?.[0]
  const topUsers = stats?.users?.slice(0, 5) || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                <SettingsIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-sm text-slate-400">TradingView Chat Sync Management</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchStats}
                disabled={isLoading}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={triggerSync}
                disabled={isSyncing}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <ZapIcon className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-pulse' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Sync Result Alert */}
        {syncResult && (
          <div className={`p-4 rounded-xl border-2 flex items-center gap-3 ${
            syncResult.success 
              ? 'bg-green-500/10 border-green-500/30' 
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            {syncResult.success ? (
              <CheckCircleIcon className="h-5 w-5 text-green-500" />
            ) : (
              <XCircleIcon className="h-5 w-5 text-red-500" />
            )}
            <span className={syncResult.success ? 'text-green-400' : 'text-red-400'}>
              {syncResult.success 
                ? `Sync completed! ${syncResult.synced} new messages synced.`
                : 'Sync failed. Check the logs for details.'}
            </span>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 hover:border-blue-500/40 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-300/70">Total Messages</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {isLoading ? '...' : stats?.totalMessages?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <MessageSquareIcon className="h-6 w-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 hover:border-green-500/40 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-300/70">Unique Users</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {isLoading ? '...' : stats?.users?.length?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="p-3 bg-green-500/20 rounded-xl">
                  <UsersIcon className="h-6 w-6 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 hover:border-purple-500/40 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-300/70">Cached Profiles</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {isLoading ? '...' : stats?.totalProfiles?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="p-3 bg-purple-500/20 rounded-xl">
                  <DatabaseIcon className="h-6 w-6 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20 hover:border-orange-500/40 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-300/70">Last Sync</p>
                  <p className="text-xl font-bold text-white mt-1">
                    {isLoading ? '...' : lastSync ? formatDistanceToNow(new Date(lastSync.started_at), { addSuffix: true }) : 'Never'}
                  </p>
                </div>
                <div className="p-3 bg-orange-500/20 rounded-xl">
                  <ClockIcon className="h-6 w-6 text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Quick Actions & Navigation */}
          <div className="space-y-6">
            {/* Navigation Cards */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <ServerIcon className="h-5 w-5 text-blue-400" />
                  Admin Sections
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/Test/admin/cache" className="block">
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 hover:bg-slate-800 transition-all group cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                          <DatabaseIcon className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">Cache Dashboard</p>
                          <p className="text-sm text-slate-400">Messages, profiles, sync history</p>
                        </div>
                      </div>
                      <ArrowRightIcon className="h-5 w-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
                    </div>
                  </div>
                </Link>

                <Link href="/chat-archive" className="block">
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-green-500/50 hover:bg-slate-800 transition-all group cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                          <MessageSquareIcon className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">Chat Archive</p>
                          <p className="text-sm text-slate-400">Browse user chat history</p>
                        </div>
                      </div>
                      <ArrowRightIcon className="h-5 w-5 text-slate-500 group-hover:text-green-400 transition-colors" />
                    </div>
                  </div>
                </Link>

                <Link href="/newspaper" className="block">
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-purple-500/50 hover:bg-slate-800 transition-all group cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                          <BarChart3Icon className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">Newspaper</p>
                          <p className="text-sm text-slate-400">AI-generated summaries</p>
                        </div>
                      </div>
                      <ArrowRightIcon className="h-5 w-5 text-slate-500 group-hover:text-purple-400 transition-colors" />
                    </div>
                  </div>
                </Link>
              </CardContent>
            </Card>

            {/* Top Chatters */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <UsersIcon className="h-5 w-5 text-green-400" />
                  Top Chatters
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Most active users in the archive
                </CardDescription>
              </CardHeader>
              <CardContent>
                {topUsers.length > 0 ? (
                  <div className="space-y-3">
                    {topUsers.map((user, idx) => (
                      <div key={user.username} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            idx === 0 ? 'bg-yellow-500 text-yellow-950' :
                            idx === 1 ? 'bg-slate-300 text-slate-800' :
                            idx === 2 ? 'bg-orange-600 text-orange-100' :
                            'bg-slate-700 text-slate-300'
                          }`}>
                            {idx + 1}
                          </div>
                          <span className="text-white font-medium">{user.username}</span>
                        </div>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                          {user.message_count.toLocaleString()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-4">No data yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Sync Status & History */}
          <div className="lg:col-span-2 space-y-6">
            {/* Sync Status */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <ActivityIcon className="h-5 w-5 text-orange-400" />
                  Sync Status
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Current state of chat room synchronization
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.syncStatuses && stats.syncStatuses.length > 0 ? (
                  <div className="space-y-4">
                    {stats.syncStatuses.map(status => (
                      <div key={status.room_id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-white">{status.room_id}</span>
                            <Badge variant={status.is_full_history ? 'default' : 'secondary'} className={status.is_full_history ? 'bg-green-600' : ''}>
                              {status.is_full_history ? 'Full History' : 'Partial'}
                            </Badge>
                          </div>
                          <span className="text-sm text-slate-400">
                            {status.total_messages.toLocaleString()} messages
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-slate-500">Last Sync</span>
                            <p className="text-white">
                              {formatDistanceToNow(new Date(status.last_sync_at), { addSuffix: true })}
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-500">Newest Message</span>
                            <p className="text-white">
                              {status.newest_message_time 
                                ? format(new Date(status.newest_message_time), 'MMM d, HH:mm')
                                : 'N/A'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertTriangleIcon className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                    <p className="text-slate-400">No sync data yet. Trigger a sync to start.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Sync History */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-cyan-400" />
                  Recent Sync Runs
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Last 5 cron job executions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.syncHistory && stats.syncHistory.length > 0 ? (
                  <div className="space-y-3">
                    {stats.syncHistory.slice(0, 5).map(run => (
                      <div 
                        key={run.id} 
                        className={`p-3 rounded-lg border flex items-center justify-between ${
                          run.success 
                            ? 'bg-slate-800/30 border-slate-700' 
                            : 'bg-red-500/10 border-red-500/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {run.success ? (
                            <CheckCircleIcon className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircleIcon className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white">
                                {format(new Date(run.started_at), 'MMM d, HH:mm:ss')}
                              </span>
                              <Badge variant="outline" className={`text-xs ${
                                run.trigger_type === 'cron' 
                                  ? 'border-blue-500/50 text-blue-400' 
                                  : 'border-purple-500/50 text-purple-400'
                              }`}>
                                {run.trigger_type}
                              </Badge>
                            </div>
                            <span className="text-xs text-slate-500">
                              {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-lg font-bold ${
                            run.messages_inserted > 0 ? 'text-green-400' : 'text-slate-400'
                          }`}>
                            +{run.messages_inserted}
                          </span>
                          <p className="text-xs text-slate-500">messages</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-4">No sync history yet</p>
                )}
                
                <Separator className="my-4 bg-slate-800" />
                
                <Link href="/Test/admin/cache">
                  <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800">
                    View Full Sync History
                    <ArrowRightIcon className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Cron Info Footer */}
        <Card className="bg-slate-900/30 border-slate-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-400">Cron: Every 5 minutes</span>
                </div>
                <Separator orientation="vertical" className="h-4 bg-slate-700" />
                <div className="flex items-center gap-2">
                  <DatabaseIcon className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-400">30 messages per API page</span>
                </div>
                <Separator orientation="vertical" className="h-4 bg-slate-700" />
                <div className="flex items-center gap-2">
                  <ActivityIcon className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-400">Smart sync with 80% overlap stop</span>
                </div>
              </div>
              <Badge variant="outline" className="border-green-500/50 text-green-400">
                <CheckCircleIcon className="h-3 w-3 mr-1" />
                System Healthy
              </Badge>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
