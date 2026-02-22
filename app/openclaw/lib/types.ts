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

export { type OpenClawNewspaperData } from './schemas'
