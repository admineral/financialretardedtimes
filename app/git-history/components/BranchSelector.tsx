/**
 * Git History - BranchSelector Component
 * 
 * Branch filter sidebar with branch list and filters
 */

'use client'

import { useState } from 'react'
import { Branch } from '../lib/types'
import { GitBranch, Check, Shield, Clock, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

interface BranchSelectorProps {
  branches: Branch[]
  selectedBranches: string[]
  onBranchToggle: (branchName: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
}

export function BranchSelector({
  branches,
  selectedBranches,
  onBranchToggle,
  onSelectAll,
  onSelectNone,
}: BranchSelectorProps) {
  const [sortBy, setSortBy] = useState<'name' | 'activity' | 'ahead'>('activity')
  
  const sortedBranches = [...branches].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        if (a.isDefault) return -1
        if (b.isDefault) return 1
        return a.name.localeCompare(b.name)
      case 'activity':
        if (a.isDefault) return -1
        if (b.isDefault) return 1
        return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime()
      case 'ahead':
        if (a.isDefault) return -1
        if (b.isDefault) return 1
        return b.aheadBy - a.aheadBy
      default:
        return 0
    }
  })
  
  const formatRelativeTime = (dateString: string) => {
    if (!dateString) return 'unknown'
    const date = new Date(dateString)
    const now = new Date()
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'today'
    if (diffInDays === 1) return 'yesterday'
    if (diffInDays < 7) return `${diffInDays}d ago`
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)}mo ago`
    return `${Math.floor(diffInDays / 365)}y ago`
  }

  return (
    <div className="w-80 border-r border-primary/20 bg-card/30 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-primary/10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            Branches
          </h3>
          <Badge variant="secondary" className="text-xs">
            {selectedBranches.length}/{branches.length}
          </Badge>
        </div>
        
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onSelectAll}
            className="flex-1 text-xs"
          >
            All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSelectNone}
            className="flex-1 text-xs"
          >
            None
          </Button>
        </div>
      </div>
      
      {/* Sort options */}
      <div className="p-3 border-b border-primary/10">
        <div className="text-xs text-muted-foreground mb-2">Sort by:</div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={sortBy === 'activity' ? 'default' : 'ghost'}
            onClick={() => setSortBy('activity')}
            className="flex-1 text-xs h-7"
          >
            <Clock className="w-3 h-3 mr-1" />
            Activity
          </Button>
          <Button
            size="sm"
            variant={sortBy === 'ahead' ? 'default' : 'ghost'}
            onClick={() => setSortBy('ahead')}
            className="flex-1 text-xs h-7"
          >
            <TrendingUp className="w-3 h-3 mr-1" />
            Ahead
          </Button>
          <Button
            size="sm"
            variant={sortBy === 'name' ? 'default' : 'ghost'}
            onClick={() => setSortBy('name')}
            className="flex-1 text-xs h-7"
          >
            A-Z
          </Button>
        </div>
      </div>
      
      {/* Branch list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sortedBranches.map((branch) => {
            const isSelected = selectedBranches.includes(branch.name)
            
            return (
              <button
                key={branch.name}
                onClick={() => onBranchToggle(branch.name)}
                className={`w-full text-left p-2.5 rounded-sm transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted/50 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Checkbox/color indicator */}
                  <div
                    className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center mt-0.5 flex-shrink-0 transition-colors ${
                      isSelected ? 'border-primary' : 'border-border'
                    }`}
                    style={{
                      backgroundColor: isSelected ? branch.color : 'transparent',
                    }}
                  >
                    {isSelected && <Check className="w-3 h-3 text-background" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm font-medium truncate">
                        {branch.name}
                      </span>
                      {branch.isDefault && (
                        <Badge variant="outline" className="text-xs px-1 py-0 text-emerald-500 border-emerald-500/30">
                          default
                        </Badge>
                      )}
                      {branch.isProtected && (
                        <Shield className="w-3 h-3 text-amber-500" />
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatRelativeTime(branch.lastCommitDate)}</span>
                      {!branch.isDefault && (
                        <>
                          {branch.aheadBy > 0 && (
                            <span className="text-emerald-500">↑{branch.aheadBy}</span>
                          )}
                          {branch.behindBy > 0 && (
                            <span className="text-orange-500">↓{branch.behindBy}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>
      
      {/* Stats footer */}
      <div className="p-4 border-t border-primary/10">
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Total branches:</span>
            <span className="font-medium text-foreground">{branches.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Selected:</span>
            <span className="font-medium text-foreground">{selectedBranches.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Protected:</span>
            <span className="font-medium text-foreground">
              {branches.filter(b => b.isProtected).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
