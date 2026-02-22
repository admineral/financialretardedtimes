/**
 * Git History - Type Definitions
 * 
 * TypeScript interfaces for git graph visualization
 */

export interface AuthorInfo {
  name: string
  email: string
  username: string | null
  avatar: string | null
  profileUrl: string | null
}

export interface Commit {
  sha: string
  shortSha: string
  message: string
  author: AuthorInfo
  date: string
  url: string
  isMerge: boolean
}

export interface GraphCommit extends Commit {
  parents: string[]  // Parent SHAs for drawing lines
  branches: string[] // Branches containing this commit
  lane: number       // X position (0 = main, 1+ = feature branches)
  isHead: boolean    // Is this a branch HEAD?
  children: string[] // Child commit SHAs
}

export interface Branch {
  name: string
  sha: string        // HEAD commit SHA
  lane: number       // Assigned lane for visualization
  color: string      // Unique color for this branch
  isDefault: boolean
  isProtected: boolean
  aheadBy: number    // Commits ahead of default branch
  behindBy: number   // Commits behind default branch
  lastCommitDate: string
}

export interface Repository {
  owner: string
  repo: string
  fullName: string
  url: string
  defaultBranch: string
}

export interface GraphData {
  repository: Repository
  branches: Branch[]
  commits: GraphCommit[]
  maxLanes: number
}

export interface BranchResponse {
  name: string
  commit: {
    sha: string
    url: string
  }
  protected: boolean
}

export interface CompareResponse {
  ahead_by: number
  behind_by: number
  status: string
}
