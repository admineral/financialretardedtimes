/**
 * Git History - Graph Utilities
 * 
 * Lane assignment algorithm and graph building utilities
 */

import type { GraphCommit, Branch, Commit } from './types'

/**
 * Build a commit graph with lane assignments for visualization
 */
export function buildCommitGraph(
  commits: Commit[],
  branches: Branch[],
  commitParents: Map<string, string[]>,
  commitBranches?: Map<string, Set<string>>
): GraphCommit[] {
  // Create a map of commits for quick lookup
  const commitMap = new Map<string, GraphCommit>()
  
  // Initialize GraphCommits
  commits.forEach(commit => {
    const parents = commitParents.get(commit.sha) || []
    const branchNames = commitBranches?.get(commit.sha) 
      ? Array.from(commitBranches.get(commit.sha)!)
      : []
    
    commitMap.set(commit.sha, {
      ...commit,
      parents,
      branches: branchNames,
      lane: 0,
      isHead: false,
      children: [],
    })
  })
  
  // Build parent-child relationships
  commitMap.forEach(commit => {
    commit.parents.forEach(parentSha => {
      const parent = commitMap.get(parentSha)
      if (parent) {
        parent.children.push(commit.sha)
      }
    })
  })
  
  // Mark branch HEAD commits
  branches.forEach(branch => {
    const headCommit = commitMap.get(branch.sha)
    if (headCommit) {
      headCommit.isHead = true
      if (!headCommit.branches.includes(branch.name)) {
        headCommit.branches.push(branch.name)
      }
    }
  })
  
  // Assign lanes using a simplified algorithm
  const graphCommits = assignLanes(Array.from(commitMap.values()), branches)
  
  return graphCommits
}

/**
 * Assign lane positions to commits
 * 
 * Algorithm:
 * 1. Sort commits topologically (parents before children)
 * 2. Process commits in order, assigning lanes based on:
 *    - Branch membership (commits on same branch share lane)
 *    - Merge relationships (merges connect lanes)
 *    - Available lanes (reuse lanes when branches merge)
 */
function assignLanes(commits: GraphCommit[], branches: Branch[]): GraphCommit[] {
  // Sort commits by date (newest first)
  commits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  
  // Create a map of branch name to lane
  const branchLaneMap = new Map<string, number>()
  branches.forEach(branch => {
    branchLaneMap.set(branch.name, branch.lane)
  })
  
  // Track active lanes
  const activeLanes = new Set<number>()
  const commitLaneMap = new Map<string, number>()
  
  // First pass: assign lanes based on branch membership
  commits.forEach(commit => {
    let assignedLane = 0
    
    // If commit is a branch head, use that branch's lane
    if (commit.isHead && commit.branches.length > 0) {
      const primaryBranch = commit.branches[0]
      assignedLane = branchLaneMap.get(primaryBranch) || 0
    } else if (commit.parents.length > 0) {
      // Use parent's lane if available
      const parentLane = commitLaneMap.get(commit.parents[0])
      if (parentLane !== undefined) {
        assignedLane = parentLane
      } else {
        // Find next available lane
        assignedLane = findAvailableLane(activeLanes)
      }
    } else {
      // Root commit - use lane 0
      assignedLane = 0
    }
    
    commit.lane = assignedLane
    commitLaneMap.set(commit.sha, assignedLane)
    activeLanes.add(assignedLane)
  })
  
  // Second pass: adjust merge commits to connect multiple lanes
  commits.forEach(commit => {
    if (commit.isMerge && commit.parents.length > 1) {
      // For merge commits, keep the lane of the first parent (target branch)
      const primaryParentLane = commitLaneMap.get(commit.parents[0])
      if (primaryParentLane !== undefined) {
        commit.lane = primaryParentLane
        commitLaneMap.set(commit.sha, primaryParentLane)
      }
    }
  })
  
  return commits
}

/**
 * Find the next available lane number
 */
function findAvailableLane(activeLanes: Set<number>): number {
  let lane = 0
  while (activeLanes.has(lane)) {
    lane++
  }
  return lane
}

/**
 * Calculate connection points for drawing lines between commits
 */
export interface ConnectionPoint {
  fromSha: string
  toSha: string
  fromLane: number
  toLane: number
  fromIndex: number
  toIndex: number
  isMerge: boolean
}

export function calculateConnections(commits: GraphCommit[]): ConnectionPoint[] {
  const connections: ConnectionPoint[] = []
  const shaToIndex = new Map<string, number>()
  
  commits.forEach((commit, index) => {
    shaToIndex.set(commit.sha, index)
  })
  
  commits.forEach((commit, index) => {
    commit.parents.forEach((parentSha, parentIdx) => {
      const parentIndex = shaToIndex.get(parentSha)
      if (parentIndex !== undefined) {
        const parentCommit = commits[parentIndex]
        connections.push({
          fromSha: commit.sha,
          toSha: parentSha,
          fromLane: commit.lane,
          toLane: parentCommit.lane,
          fromIndex: index,
          toIndex: parentIndex,
          isMerge: commit.isMerge && parentIdx > 0,
        })
      }
    })
  })
  
  return connections
}

/**
 * Generate SVG path for connection between two commits
 */
export function generateConnectionPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  isMerge: boolean
): string {
  const midY = (fromY + toY) / 2
  
  if (fromX === toX) {
    // Straight line for same lane
    return `M ${fromX} ${fromY} L ${toX} ${toY}`
  } else {
    // Curved line for lane changes
    if (isMerge) {
      // Merge: curve from right to left
      return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`
    } else {
      // Branch: curve from left to right
      return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`
    }
  }
}

/**
 * Get color for a branch by name
 */
export function getBranchColor(branchName: string, branches: Branch[]): string {
  const branch = branches.find(b => b.name === branchName)
  return branch?.color || '#64748b'
}
