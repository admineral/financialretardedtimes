'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { 
  RefreshCwIcon, 
  DatabaseIcon, 
  MessageSquareIcon, 
  UsersIcon, 
  ActivityIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  SearchIcon,
  PlayIcon,
  CodeIcon,
  HistoryIcon,
  ZapIcon,
  DownloadIcon
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

interface SyncStatus {
  room_id: string
  last_sync_at: string
  newest_message_time: string | null
  oldest_message_time: string | null
  total_messages: number
  is_full_history: boolean
  updated_at: string
}

interface ChatMessage {
  id: string
  room_id: string
  username: string
  text: string
  time: string
  user_pic: string | null
  is_moderator: boolean
  created_at: string
}

interface UserProfile {
  username: string
  user_id: number | null
  display_name: string | null
  followers: number | null
  following: number | null
  ideas_count: number | null
  reputation: number | null
  avatar: string | null
  fetched_at: string
}

interface UserActivity {
  room_id: string
  username: string
  date: string
  message_count: number
  hour_distribution: Record<string, number> | null
  updated_at: string
}

interface UserSummary {
  username: string
  message_count: number
  first_message: string
  last_message: string
  avatar: string | null
  has_profile: boolean
  // Profile stats (if available)
  followers: number | null
  following: number | null
  ideas_count: number | null
  reputation: number | null
  display_name: string | null
}

interface SyncHistoryRecord {
  id: number
  room_id: string
  started_at: string
  completed_at: string | null
  success: boolean
  messages_fetched: number
  messages_inserted: number
  duplicates_skipped: number
  error_message: string | null
  trigger_type: 'cron' | 'manual'
  created_at: string
}

interface CacheStats {
  totalMessages: number
  totalProfiles: number
  totalActivityRecords: number
  syncStatuses: SyncStatus[]
  recentMessages: ChatMessage[]
  profiles: UserProfile[]
  recentActivity: UserActivity[]
  users: UserSummary[]
  syncHistory: SyncHistoryRecord[]
}

interface QueryResult {
  data: Record<string, unknown>[] | null
  error: string | null
  rowCount: number
  executionTime: number
}

export default function CacheAdminPage() {
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; synced: number } | null>(null)
  
  // Query state
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM tv_chat_messages ORDER BY time DESC LIMIT 10')
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [isQueryRunning, setIsQueryRunning] = useState(false)
  
  // User filter
  const [userFilter, setUserFilter] = useState<string>('')
  
  // Messages filter and loading all
  const [messageFilter, setMessageFilter] = useState<string>('')
  const [isLoadingAllMessages, setIsLoadingAllMessages] = useState(false)
  const [allMessagesLoaded, setAllMessagesLoaded] = useState(false)

  const fetchStats = useCallback(async (loadAllMessages: boolean = false) => {
    if (loadAllMessages) {
      setIsLoadingAllMessages(true)
    } else {
      setIsLoading(true)
    }
    setError(null)
    
    try {
      const messagesLimit = loadAllMessages ? 0 : 300
      const response = await fetch(`/Test/admin/api/cache-stats?messagesLimit=${messagesLimit}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      setStats(data)
      setLastRefresh(new Date())
      if (loadAllMessages) {
        setAllMessagesLoaded(true)
      }
    } catch (err) {
      console.error('Error fetching cache stats:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch stats')
    } finally {
      setIsLoading(false)
      setIsLoadingAllMessages(false)
    }
  }, [])

  const triggerSync = async () => {
    setIsSyncing(true)
    setSyncResult(null)
    
    try {
      const response = await fetch('/api/cron/sync-chat?trigger=manual', {
        method: 'POST'
      })
      const data = await response.json()
      setSyncResult({ success: data.success, synced: data.totalSynced || 0 })
      // Refresh stats after sync
      await fetchStats()
    } catch (err) {
      console.error('Error triggering sync:', err)
      setSyncResult({ success: false, synced: 0 })
    } finally {
      setIsSyncing(false)
    }
  }

  const runQuery = async () => {
    if (!sqlQuery.trim()) return
    
    setIsQueryRunning(true)
    setQueryResult(null)
    
    try {
      const response = await fetch('/Test/admin/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlQuery })
      })
      const data = await response.json()
      setQueryResult(data)
    } catch (err) {
      console.error('Error running query:', err)
      setQueryResult({
        data: null,
        error: err instanceof Error ? err.message : 'Query failed',
        rowCount: 0,
        executionTime: 0
      })
    } finally {
      setIsQueryRunning(false)
    }
  }

  // Filter users based on search
  const filteredUsers = stats?.users?.filter(user => 
    user.username.toLowerCase().includes(userFilter.toLowerCase())
  ) || []
  
  // Filter messages based on search
  const filteredMessages = stats?.recentMessages?.filter(msg => 
    msg.username.toLowerCase().includes(messageFilter.toLowerCase()) ||
    msg.text.toLowerCase().includes(messageFilter.toLowerCase())
  ) || []
  
  // Export messages to CSV
  const exportMessagesToCSV = () => {
    if (!stats?.recentMessages || stats.recentMessages.length === 0) return
    
    const messages = messageFilter ? filteredMessages : stats.recentMessages
    
    // CSV headers
    const headers = ['#', 'Username', 'Time', 'Text']
    
    // CSV rows with rolling counter
    const rows = messages.map((msg, idx) => [
      idx + 1,
      msg.username,
      // Format time as HH:MM DD.MM.YYYY
      format(new Date(msg.time), 'HH:mm dd.MM.yyyy'),
      // Escape quotes and wrap text in quotes
      `"${(msg.text || '').replace(/"/g, '""')}"`
    ])
    
    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `chat_messages_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    fetchStats()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [fetchStats])

  if (isLoading && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <RefreshCwIcon className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-3 text-lg text-slate-300">Loading cache statistics...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <DatabaseIcon className="h-8 w-8 text-blue-500" />
              Cache Admin Dashboard
            </h1>
            <p className="text-slate-400 mt-1">
              Monitor and manage TradingView data cache
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-sm text-slate-500">
                Last refresh: {formatDistanceToNow(lastRefresh, { addSuffix: true })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats(false)}
              disabled={isLoading}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={triggerSync}
              disabled={isSyncing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <ActivityIcon className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-pulse' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Trigger Sync'}
            </Button>
          </div>
        </div>

        {/* Sync Result */}
        {syncResult && (
          <Card className={`border-2 ${syncResult.success ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
            <CardContent className="py-3 flex items-center gap-3">
              {syncResult.success ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
              ) : (
                <XCircleIcon className="h-5 w-5 text-red-500" />
              )}
              <span className={syncResult.success ? 'text-green-400' : 'text-red-400'}>
                {syncResult.success 
                  ? `Sync completed! ${syncResult.synced} new messages synced.`
                  : 'Sync failed. Check console for details.'}
              </span>
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <Card className="border-2 border-red-500/50 bg-red-500/10">
            <CardContent className="py-3 flex items-center gap-3">
              <AlertCircleIcon className="h-5 w-5 text-red-500" />
              <span className="text-red-400">{error}</span>
            </CardContent>
          </Card>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Messages</p>
                  <p className="text-3xl font-bold text-white">
                    {stats?.totalMessages.toLocaleString() || 0}
                  </p>
                </div>
                <MessageSquareIcon className="h-10 w-10 text-blue-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Cached Profiles</p>
                  <p className="text-3xl font-bold text-white">
                    {stats?.totalProfiles.toLocaleString() || 0}
                  </p>
                </div>
                <UsersIcon className="h-10 w-10 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Activity Records</p>
                  <p className="text-3xl font-bold text-white">
                    {stats?.totalActivityRecords.toLocaleString() || 0}
                  </p>
                </div>
                <TrendingUpIcon className="h-10 w-10 text-purple-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Sync Status</p>
                  <p className="text-3xl font-bold text-white">
                    {stats?.syncStatuses.filter(s => s.is_full_history).length || 0}
                    <span className="text-lg text-slate-500">/{stats?.syncStatuses.length || 0}</span>
                  </p>
                </div>
                <ClockIcon className="h-10 w-10 text-orange-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sync Status Cards */}
        {stats?.syncStatuses && stats.syncStatuses.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-orange-500" />
                Sync Status by Room
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stats.syncStatuses.map(status => (
                  <Card key={status.room_id} className="bg-slate-900/50 border-slate-600">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-mono text-sm text-slate-300">{status.room_id}</span>
                        <Badge variant={status.is_full_history ? 'default' : 'secondary'}>
                          {status.is_full_history ? 'Full History' : 'Partial'}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Total Messages:</span>
                          <span className="text-white font-mono">{status.total_messages.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Last Sync:</span>
                          <span className="text-slate-300">
                            {formatDistanceToNow(new Date(status.last_sync_at), { addSuffix: true })}
                          </span>
                        </div>
                        {status.newest_message_time && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Newest Message:</span>
                            <span className="text-slate-300">
                              {format(new Date(status.newest_message_time), 'MMM d, HH:mm')}
                            </span>
                          </div>
                        )}
                        {status.oldest_message_time && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Oldest Message:</span>
                            <span className="text-slate-300">
                              {format(new Date(status.oldest_message_time), 'MMM d, HH:mm')}
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for detailed data */}
        <Tabs defaultValue="history" className="space-y-4">
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="history" className="data-[state=active]:bg-slate-700">
              <HistoryIcon className="h-4 w-4 mr-2" />
              Sync History ({stats?.syncHistory?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-slate-700">
              <UsersIcon className="h-4 w-4 mr-2" />
              All Users ({stats?.users?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="messages" className="data-[state=active]:bg-slate-700">
              <MessageSquareIcon className="h-4 w-4 mr-2" />
              Recent Messages
            </TabsTrigger>
            <TabsTrigger value="profiles" className="data-[state=active]:bg-slate-700">
              <UsersIcon className="h-4 w-4 mr-2" />
              Cached Profiles
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-slate-700">
              <ActivityIcon className="h-4 w-4 mr-2" />
              Activity Data
            </TabsTrigger>
            <TabsTrigger value="query" className="data-[state=active]:bg-slate-700">
              <CodeIcon className="h-4 w-4 mr-2" />
              SQL Query
            </TabsTrigger>
          </TabsList>

          {/* Sync History Tab */}
          <TabsContent value="history">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <HistoryIcon className="h-5 w-5 text-cyan-500" />
                  Sync History
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Recent cron job runs and their results
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {stats?.syncHistory && stats.syncHistory.length > 0 ? (
                      stats.syncHistory.map((record) => (
                        <div 
                          key={record.id} 
                          className={`p-4 rounded-lg border transition-colors ${
                            record.success 
                              ? 'bg-slate-900/50 border-slate-700 hover:border-slate-600' 
                              : 'bg-red-500/5 border-red-500/30 hover:border-red-500/50'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              {record.success ? (
                                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                              ) : (
                                <XCircleIcon className="h-5 w-5 text-red-500" />
                              )}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm text-slate-300">{record.room_id}</span>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${
                                      record.trigger_type === 'cron' 
                                        ? 'border-blue-500 text-blue-500' 
                                        : 'border-purple-500 text-purple-500'
                                    }`}
                                  >
                                    {record.trigger_type === 'cron' ? (
                                      <><ClockIcon className="h-3 w-3 mr-1" /> Cron</>
                                    ) : (
                                      <><ZapIcon className="h-3 w-3 mr-1" /> Manual</>
                                    )}
                                  </Badge>
                                </div>
                                <span className="text-xs text-slate-500">
                                  {format(new Date(record.started_at), 'MMM d, yyyy HH:mm:ss')}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              {record.completed_at && (
                                <span className="text-xs text-slate-500">
                                  Duration: {Math.round((new Date(record.completed_at).getTime() - new Date(record.started_at).getTime()) / 1000)}s
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {record.success ? (
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div className="bg-slate-800/50 rounded p-2">
                                <span className="text-slate-500 text-xs block">Fetched</span>
                                <span className="text-white font-mono text-lg">{record.messages_fetched}</span>
                              </div>
                              <div className="bg-slate-800/50 rounded p-2">
                                <span className="text-slate-500 text-xs block">Inserted</span>
                                <span className={`font-mono text-lg ${record.messages_inserted > 0 ? 'text-green-400' : 'text-slate-400'}`}>
                                  {record.messages_inserted}
                                </span>
                              </div>
                              <div className="bg-slate-800/50 rounded p-2">
                                <span className="text-slate-500 text-xs block">Duplicates</span>
                                <span className="text-slate-400 font-mono text-lg">{record.duplicates_skipped}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-red-500/10 rounded p-3 mt-2">
                              <span className="text-red-400 text-sm">{record.error_message || 'Unknown error'}</span>
                            </div>
                          )}
                          
                          <div className="mt-2 text-xs text-slate-500">
                            {formatDistanceToNow(new Date(record.started_at), { addSuffix: true })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        No sync history yet. Trigger a sync or wait for the next cron run.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <span>All Users with Cached Data</span>
                  <div className="relative w-64">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      placeholder="Search users..."
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                      className="pl-9 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {filteredUsers.length} users found • Sorted by message count
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {filteredUsers.length > 0 ? (
                      filteredUsers
                        .sort((a, b) => b.message_count - a.message_count)
                        .map((user, idx) => (
                          <div 
                            key={user.username} 
                            className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <span className="text-slate-500 font-mono text-sm w-8">#{idx + 1}</span>
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={user.avatar || undefined} />
                                <AvatarFallback className="bg-slate-700 text-sm">
                                  {user.username.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-white">{user.username}</span>
                                  {user.display_name && (
                                    <span className="text-slate-400 text-sm">({user.display_name})</span>
                                  )}
                                  {user.has_profile && (
                                    <Badge variant="outline" className="text-xs border-green-500 text-green-500">
                                      Profile
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                                  <span>First: {format(new Date(user.first_message), 'MMM d, HH:mm')}</span>
                                  <span>Last: {format(new Date(user.last_message), 'MMM d, HH:mm')}</span>
                                </div>
                                {/* Profile Stats Row */}
                                {user.has_profile && (
                                  <div className="flex items-center gap-3 mt-2 text-xs">
                                    {user.followers !== null && (
                                      <span className="text-blue-400">
                                        <span className="text-slate-500">Followers:</span> {user.followers.toLocaleString()}
                                      </span>
                                    )}
                                    {user.following !== null && (
                                      <span className="text-green-400">
                                        <span className="text-slate-500">Following:</span> {user.following.toLocaleString()}
                                      </span>
                                    )}
                                    {user.ideas_count !== null && (
                                      <span className="text-purple-400">
                                        <span className="text-slate-500">Ideas:</span> {user.ideas_count.toLocaleString()}
                                      </span>
                                    )}
                                    {user.reputation !== null && (
                                      <span className="text-yellow-400">
                                        <span className="text-slate-500">Rep:</span> {user.reputation.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold text-white">{user.message_count.toLocaleString()}</p>
                                <p className="text-xs text-slate-500">messages</p>
                              </div>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        {userFilter ? 'No users match your search' : 'No users with cached data yet'}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <span>Cached Messages</span>
                  <div className="flex items-center gap-3">
                    <div className="relative w-64">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        placeholder="Search messages..."
                        value={messageFilter}
                        onChange={(e) => setMessageFilter(e.target.value)}
                        className="pl-9 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                      />
                    </div>
                    {!allMessagesLoaded && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchStats(true)}
                        disabled={isLoadingAllMessages}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        {isLoadingAllMessages ? (
                          <>
                            <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                            Loading All...
                          </>
                        ) : (
                          <>
                            <DatabaseIcon className="h-4 w-4 mr-2" />
                            Load All ({stats?.totalMessages.toLocaleString() || 0})
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportMessagesToCSV}
                      disabled={!stats?.recentMessages || stats.recentMessages.length === 0}
                      className="border-green-600 text-green-400 hover:bg-green-600/20"
                    >
                      <DownloadIcon className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {allMessagesLoaded ? (
                    <>All {stats?.recentMessages?.length.toLocaleString() || 0} messages loaded</>
                  ) : (
                    <>Latest 300 messages from the database cache (showing {filteredMessages.length.toLocaleString()} of {stats?.recentMessages?.length || 0})</>
                  )}
                  {messageFilter && ` • Filtered: ${filteredMessages.length.toLocaleString()} matches`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {filteredMessages.length > 0 ? (
                      filteredMessages.map((msg, idx) => (
                        <div key={`${msg.id}-${idx}`} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                          <div className="flex items-start gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={msg.user_pic || undefined} />
                              <AvatarFallback className="bg-slate-700 text-xs">
                                {msg.username.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-white">{msg.username}</span>
                                {msg.is_moderator && (
                                  <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">
                                    MOD
                                  </Badge>
                                )}
                                <span className="text-xs text-slate-500">
                                  {format(new Date(msg.time), 'MMM d, HH:mm:ss')}
                                </span>
                              </div>
                              <p className="text-sm text-slate-300 break-words">{msg.text}</p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                                <span>Room: {msg.room_id}</span>
                                <span>•</span>
                                <span>ID: {msg.id.slice(0, 20)}...</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        {messageFilter ? 'No messages match your search' : 'No messages cached yet'}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profiles Tab */}
          <TabsContent value="profiles">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Cached User Profiles</CardTitle>
                <CardDescription className="text-slate-400">
                  All user profiles stored in the database (24h cache)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stats?.profiles && stats.profiles.length > 0 ? (
                      stats.profiles.map(profile => (
                        <Card key={profile.username} className="bg-slate-900/50 border-slate-600">
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-3 mb-3">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={profile.avatar || undefined} />
                                <AvatarFallback className="bg-slate-700">
                                  {profile.username.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-white">{profile.username}</p>
                                {profile.display_name && (
                                  <p className="text-sm text-slate-400">{profile.display_name}</p>
                                )}
                              </div>
                            </div>
                            <Separator className="my-3 bg-slate-700" />
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-slate-500">Followers</span>
                                <p className="text-white font-mono">
                                  {profile.followers?.toLocaleString() ?? '-'}
                                </p>
                              </div>
                              <div>
                                <span className="text-slate-500">Following</span>
                                <p className="text-white font-mono">
                                  {profile.following?.toLocaleString() ?? '-'}
                                </p>
                              </div>
                              <div>
                                <span className="text-slate-500">Ideas</span>
                                <p className="text-white font-mono">
                                  {profile.ideas_count?.toLocaleString() ?? '-'}
                                </p>
                              </div>
                              <div>
                                <span className="text-slate-500">Reputation</span>
                                <p className="text-white font-mono">
                                  {profile.reputation?.toLocaleString() ?? '-'}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 text-xs text-slate-500">
                              Cached: {formatDistanceToNow(new Date(profile.fetched_at), { addSuffix: true })}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-8 text-slate-500">
                        No profiles cached yet
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">User Activity Data</CardTitle>
                <CardDescription className="text-slate-400">
                  Daily activity aggregations from cached messages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                      stats.recentActivity.map((activity, idx) => (
                        <div key={`${activity.username}-${activity.date}-${idx}`} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-white">{activity.username}</span>
                              <Badge variant="outline" className="text-xs">
                                {activity.room_id}
                              </Badge>
                            </div>
                            <span className="text-sm text-slate-400">
                              {format(new Date(activity.date), 'MMM d, yyyy')}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div>
                              <span className="text-slate-500 text-sm">Messages</span>
                              <p className="text-2xl font-bold text-white">{activity.message_count}</p>
                            </div>
                            {activity.hour_distribution && (
                              <div className="flex-1">
                                <span className="text-slate-500 text-sm">Hour Distribution</span>
                                <div className="flex items-end gap-0.5 h-8 mt-1">
                                  {Array.from({ length: 24 }, (_, hour) => {
                                    const count = activity.hour_distribution?.[hour.toString()] || 0
                                    const maxCount = Math.max(...Object.values(activity.hour_distribution || {}), 1)
                                    const height = (count / maxCount) * 100
                                    return (
                                      <div
                                        key={hour}
                                        className="flex-1 bg-blue-500/50 rounded-t"
                                        style={{ height: `${Math.max(height, 5)}%` }}
                                        title={`${hour}:00 - ${count} messages`}
                                      />
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            Updated: {formatDistanceToNow(new Date(activity.updated_at), { addSuffix: true })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        No activity data yet
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SQL Query Tab */}
          <TabsContent value="query">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <CodeIcon className="h-5 w-5 text-purple-500" />
                  Database Query
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Run read-only SQL queries against the cache database
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Query Input */}
                <div className="space-y-2">
                  <Textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    placeholder="Enter SQL query..."
                    className="font-mono text-sm bg-slate-900 border-slate-600 text-white min-h-[120px]"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSqlQuery('SELECT * FROM tv_chat_messages ORDER BY time DESC LIMIT 20')}
                        className="text-xs border-slate-600 text-slate-300"
                      >
                        Recent Messages
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSqlQuery('SELECT * FROM tv_user_profiles ORDER BY fetched_at DESC')}
                        className="text-xs border-slate-600 text-slate-300"
                      >
                        All Profiles
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSqlQuery('SELECT username, COUNT(*) as msg_count FROM tv_chat_messages GROUP BY username ORDER BY msg_count DESC LIMIT 20')}
                        className="text-xs border-slate-600 text-slate-300"
                      >
                        Top Chatters
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSqlQuery('SELECT * FROM tv_chat_sync_status')}
                        className="text-xs border-slate-600 text-slate-300"
                      >
                        Sync Status
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSqlQuery('SELECT * FROM tv_user_activity_daily ORDER BY date DESC, message_count DESC LIMIT 50')}
                        className="text-xs border-slate-600 text-slate-300"
                      >
                        Activity
                      </Button>
                    </div>
                    <Button
                      onClick={runQuery}
                      disabled={isQueryRunning || !sqlQuery.trim()}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      <PlayIcon className={`h-4 w-4 mr-2 ${isQueryRunning ? 'animate-pulse' : ''}`} />
                      {isQueryRunning ? 'Running...' : 'Run Query'}
                    </Button>
                  </div>
                </div>

                {/* Query Results */}
                {queryResult && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        {queryResult.error ? (
                          <Badge variant="destructive">Error</Badge>
                        ) : (
                          <Badge variant="default" className="bg-green-600">Success</Badge>
                        )}
                        <span className="text-slate-400">
                          {queryResult.rowCount} row{queryResult.rowCount !== 1 ? 's' : ''} returned
                        </span>
                      </div>
                      <span className="text-slate-500 font-mono text-xs">
                        {queryResult.executionTime}ms
                      </span>
                    </div>

                    {queryResult.error ? (
                      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <pre className="text-red-400 text-sm whitespace-pre-wrap font-mono">
                          {queryResult.error}
                        </pre>
                      </div>
                    ) : queryResult.data && queryResult.data.length > 0 ? (
                      <ScrollArea className="h-[400px]">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-800">
                              <tr>
                                {Object.keys(queryResult.data[0]).map(key => (
                                  <th key={key} className="px-3 py-2 text-left text-slate-400 font-medium border-b border-slate-700">
                                    {key}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {queryResult.data.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-700/30">
                                  {Object.values(row).map((value, vidx) => (
                                    <td key={vidx} className="px-3 py-2 text-slate-300 border-b border-slate-700/50 font-mono text-xs">
                                      {value === null ? (
                                        <span className="text-slate-500 italic">null</span>
                                      ) : typeof value === 'object' ? (
                                        <span className="text-purple-400">{JSON.stringify(value).slice(0, 50)}...</span>
                                      ) : (
                                        String(value).slice(0, 100)
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        No results returned
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

