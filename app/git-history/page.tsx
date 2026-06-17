'use client'

import { useState, useCallback } from 'react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { GitBranch, GitMerge, GitCommit, ExternalLink, Search, Loader2, ChevronLeft, ChevronRight, User, Calendar, Network } from 'lucide-react'
import { BranchSelector } from './components/BranchSelector'
import { GitGraphView } from './components/GitGraphView'
import type { Branch, GraphData } from './lib/types'

interface Commit {
  sha: string
  shortSha: string
  message: string
  author: {
    name: string
    email: string
    username: string | null
    avatar: string | null
    profileUrl: string | null
  }
  date: string
  url: string
  isMerge: boolean
}

interface Repository {
  owner: string
  repo: string
  fullName: string
  url: string
}

interface Pagination {
  page: number
  perPage: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

interface CommitResponse {
  repository: Repository
  commits: Commit[]
  pagination: Pagination
}

export default function GitHistoryPage() {
  const [repoUrl, setRepoUrl] = useState('openclaw/openclaw')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CommitResponse | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list')
  
  // Graph view state
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState<string | null>(null)

  const fetchCommits = useCallback(async (page: number = 1) => {
    if (!repoUrl.trim()) {
      setError('Please enter a repository URL')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/git-history/api/commits?repo=${encodeURIComponent(repoUrl)}&page=${page}&per_page=20`
      )
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch commits')
      }

      setData(result)
      setCurrentPage(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [repoUrl])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchCommits(1)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) return 'gerade eben'
    if (diffInSeconds < 3600) return `vor ${Math.floor(diffInSeconds / 60)} Min.`
    if (diffInSeconds < 86400) return `vor ${Math.floor(diffInSeconds / 3600)} Std.`
    if (diffInSeconds < 604800) return `vor ${Math.floor(diffInSeconds / 86400)} Tagen`
    return formatDate(dateString)
  }

  const getCommitTitle = (message: string) => {
    return message.split('\n')[0]
  }

  const getCommitBody = (message: string) => {
    const lines = message.split('\n')
    return lines.length > 1 ? lines.slice(1).join('\n').trim() : null
  }
  
  // Fetch branches for graph view
  const fetchBranches = useCallback(async () => {
    if (!repoUrl.trim()) return
    
    setGraphLoading(true)
    setGraphError(null)
    
    try {
      const response = await fetch(
        `/git-history/api/branches?repo=${encodeURIComponent(repoUrl)}&stats=true`
      )
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch branches')
      }
      
      setBranches(result.branches)
      // Auto-select default branch and top 2 most recent branches
      const autoSelect = result.branches
        .slice(0, 3)
        .map((b: Branch) => b.name)
      setSelectedBranches(autoSelect)
      
      // Immediately fetch graph data
      fetchGraph(result.branches.slice(0, 3).map((b: Branch) => b.name))
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : 'Failed to fetch branches')
      setBranches([])
    } finally {
      setGraphLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchBranches triggers the current graph fetch after branch selection.
  }, [repoUrl])
  
  // Fetch commit graph
  const fetchGraph = useCallback(async (branchNames: string[]) => {
    if (!repoUrl.trim() || branchNames.length === 0) {
      setGraphData(null)
      return
    }
    
    setGraphLoading(true)
    setGraphError(null)
    
    try {
      const response = await fetch(
        `/git-history/api/graph?repo=${encodeURIComponent(repoUrl)}&branches=${branchNames.join(',')}&limit=100`
      )
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch commit graph')
      }
      
      console.log('Graph data received:', result) // Debug log
      setGraphData(result)
    } catch (err) {
      console.error('Graph fetch error:', err) // Debug log
      setGraphError(err instanceof Error ? err.message : 'Failed to fetch commit graph')
      setGraphData(null)
    } finally {
      setGraphLoading(false)
    }
  }, [repoUrl])
  
  // Handle branch toggle
  const handleBranchToggle = useCallback((branchName: string) => {
    setSelectedBranches(prev => {
      const newSelection = prev.includes(branchName)
        ? prev.filter(b => b !== branchName)
        : [...prev, branchName]
      
      // Fetch graph with new selection
      if (newSelection.length > 0) {
        fetchGraph(newSelection)
      }
      
      return newSelection
    })
  }, [fetchGraph])
  
  // Handle view mode change
  const handleViewModeChange = useCallback((mode: 'list' | 'graph') => {
    setViewMode(mode)
    if (mode === 'graph') {
      if (branches.length === 0) {
        // First time entering graph view - fetch branches
        fetchBranches()
      } else if (selectedBranches.length > 0 && !graphData) {
        // Branches exist but no graph data - fetch graph
        fetchGraph(selectedBranches)
      }
    }
  }, [branches.length, selectedBranches, graphData, fetchBranches, fetchGraph])

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-primary/20 bg-card/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/newspaper" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              ← Zurück
            </Link>
            <h1 className="font-headline text-xl font-bold gold-text flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              Git History Explorer
            </h1>
          </div>
          <ThemeSwitcher />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Search Form */}
        <Card className="mb-8 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              Repository suchen
            </CardTitle>
            <CardDescription>
              Gib eine GitHub Repository URL ein um die Commit History anzuzeigen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex gap-3">
              <Input
                type="text"
                placeholder="z.B. facebook/react oder https://github.com/vercel/next.js"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Laden...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Suchen
                  </>
                )}
              </Button>
            </form>
            
            {/* Quick examples */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Beispiele:</span>
              {['facebook/react', 'vercel/next.js', 'microsoft/vscode', 'torvalds/linux'].map((repo) => (
                <button
                  key={repo}
                  type="button"
                  onClick={() => setRepoUrl(repo)}
                  className="text-sm text-primary hover:underline"
                >
                  {repo}
                </button>
              ))}
            </div>
            
            {/* View Mode Tabs */}
            {repoUrl && (
              <div className="mt-4 pt-4 border-t border-primary/10">
                <Tabs value={viewMode} onValueChange={(v) => handleViewModeChange(v as 'list' | 'graph')}>
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="list" className="flex items-center gap-2">
                      <GitCommit className="w-4 h-4" />
                      List View
                    </TabsTrigger>
                    <TabsTrigger value="graph" className="flex items-center gap-2">
                      <Network className="w-4 h-4" />
                      Graph View
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && viewMode === 'list' && (
          <div className="mb-8 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            {error}
          </div>
        )}
        
        {/* Graph Error Message */}
        {graphError && viewMode === 'graph' && (
          <div className="mb-8 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            {graphError}
          </div>
        )}

        {/* Graph View */}
        {viewMode === 'graph' && (
          <>
            {!repoUrl.trim() ? (
              <div className="text-center py-16 border border-primary/20 rounded-lg">
                <Network className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">Graph View</h3>
                <p className="text-muted-foreground">
                  Gib oben eine GitHub Repository URL ein um den Commit Graph zu laden.
                </p>
              </div>
            ) : (
              <div className="flex gap-0 border border-primary/20 rounded-lg overflow-hidden bg-card" style={{ height: 'calc(100vh - 400px)' }}>
                <BranchSelector
                  branches={branches}
                  selectedBranches={selectedBranches}
                  onBranchToggle={handleBranchToggle}
                  onSelectAll={() => {
                    const allBranches = branches.map(b => b.name)
                    setSelectedBranches(allBranches)
                    fetchGraph(allBranches)
                  }}
                  onSelectNone={() => {
                    setSelectedBranches([])
                    setGraphData(null)
                  }}
                />
                <GitGraphView
                  graphData={graphData}
                  isLoading={graphLoading}
                  error={graphError}
                />
              </div>
            )}
          </>
        )}

        {/* Repository Info & Commits (List View) */}
        {viewMode === 'list' && data && (
          <>
            {/* Repository Header */}
            <Card className="mb-6 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <GitBranch className="w-5 h-5 text-primary" />
                      {data.repository.fullName}
                    </h2>
                    <a
                      href={data.repository.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
                    >
                      {data.repository.url}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <Badge variant="secondary" className="text-sm">
                    Seite {data.pagination.page}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Commits List */}
            <div className="space-y-3">
              {data.commits.map((commit, index) => (
                <Card 
                  key={commit.sha} 
                  className="border-primary/10 hover:border-primary/30 transition-colors group"
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex gap-4">
                      {/* Timeline indicator */}
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          commit.isMerge 
                            ? 'bg-purple-500/20 text-purple-400' 
                            : 'bg-primary/20 text-primary'
                        }`}>
                          {commit.isMerge ? (
                            <GitMerge className="w-4 h-4" />
                          ) : (
                            <GitCommit className="w-4 h-4" />
                          )}
                        </div>
                        {index < data.commits.length - 1 && (
                          <div className="w-0.5 flex-1 bg-border mt-2" />
                        )}
                      </div>

                      {/* Commit content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <a
                              href={commit.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium hover:text-primary transition-colors line-clamp-2 group-hover:underline"
                            >
                              {getCommitTitle(commit.message)}
                            </a>
                            
                            {getCommitBody(commit.message) && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                                {getCommitBody(commit.message)}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {commit.isMerge && (
                              <Badge variant="outline" className="text-purple-400 border-purple-400/30">
                                Merge
                              </Badge>
                            )}
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                              {commit.shortSha}
                            </code>
                          </div>
                        </div>

                        {/* Author & Date */}
                        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {commit.author.avatar ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element -- GitHub avatar URLs are dynamic and not covered by the image config. */}
                                <img
                                  src={commit.author.avatar}
                                  alt={commit.author.name}
                                  className="w-5 h-5 rounded-full"
                                />
                              </>
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                            {commit.author.profileUrl ? (
                              <a
                                href={commit.author.profileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary transition-colors"
                              >
                                {commit.author.username || commit.author.name}
                              </a>
                            ) : (
                              <span>{commit.author.name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span title={formatDate(commit.date)}>
                              {getRelativeTime(commit.date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button
                variant="outline"
                onClick={() => fetchCommits(currentPage - 1)}
                disabled={!data.pagination.hasPrevPage || loading}
              >
                <ChevronLeft className="w-4 h-4" />
                Vorherige
              </Button>
              <span className="text-sm text-muted-foreground">
                Seite {currentPage}
              </span>
              <Button
                variant="outline"
                onClick={() => fetchCommits(currentPage + 1)}
                disabled={!data.pagination.hasNextPage || loading}
              >
                Nächste
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}

        {/* Empty State */}
        {viewMode === 'list' && !data && !loading && !error && (
          <div className="text-center py-16">
            <GitBranch className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Commits geladen</h3>
            <p className="text-muted-foreground">
              Gib oben eine GitHub Repository URL ein um die Commit History zu laden.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-primary/20 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-muted-foreground">
          Financial Retarded Times • Git History Explorer • Nur für öffentliche Repositories
        </div>
      </footer>
    </main>
  )
}
