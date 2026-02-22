/**
 * OpenClaw Today - Type Definitions
 * 
 * Shared types for the OpenClaw newspaper feature.
 */

export interface GitHubCommit {
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

export interface RepoInfo {
  owner: string
  repo: string
  fullName: string
  description: string | null
  url: string
  stars: number
  language: string | null
}

export interface CommitStats {
  total: number
  merges: number
  uniqueContributors: number
  mostActiveDay: string | null
  categories: Record<string, number>
}

// ============================================
// Issues & Pull Requests Types
// ============================================

export interface GitHubLabel {
  name: string
  color: string
  description: string | null
}

export interface GitHubUser {
  login: string
  avatar_url: string
  html_url: string
}

export interface GitHubIssue {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  labels: GitHubLabel[]
  user: GitHubUser
  assignees: GitHubUser[]
  created_at: string
  updated_at: string
  closed_at: string | null
  html_url: string
  comments: number
  reactions?: {
    total_count: number
    '+1': number
    '-1': number
    laugh: number
    hooray: number
    confused: number
    heart: number
    rocket: number
    eyes: number
  }
}

export interface GitHubPullRequest extends GitHubIssue {
  merged_at: string | null
  merge_commit_sha: string | null
  draft: boolean
  head: {
    ref: string
    sha: string
  }
  base: {
    ref: string
    sha: string
  }
  additions?: number
  deletions?: number
  changed_files?: number
}

export interface IssueStats {
  totalIssues: number
  openIssues: number
  closedIssues: number
  totalPRs: number
  openPRs: number
  mergedPRs: number
  closedPRs: number
  uniqueAuthors: number
  uniqueAssignees: number
  mostActiveLabels: Array<{ name: string; count: number }>
  avgCommentsPerIssue: number
  avgCommentsPerPR: number
}

export { type OpenClawNewspaperData, type OpenClawIssuesNewspaperData } from './schemas'
