/**
 * OpenClaw Today - Zod Schemas
 * 
 * Schema definitions for the newspaper data structure.
 * Used for AI response validation and type inference.
 */

import { z } from 'zod'

/**
 * Schema for expanded full article (generated on-the-fly)
 */
export const OpenClawExpandedArticleSchema = z.object({
  title: z.string().describe('Descriptive title based on the theme'),
  subtitle: z.string().describe('One sentence of context'),
  
  introduction: z.string().describe('2-3 sentences summarizing what this work addresses'),
  
  sections: z.array(z.object({
    heading: z.string().describe('Section heading'),
    content: z.string().describe('2-4 paragraphs documenting this aspect with commit references'),
    relatedCommits: z.array(z.object({
      sha: z.string(),
      message: z.string(),
      author: z.string(),
    })).optional().describe('Specific commits related to this section'),
  })).min(2).max(4).describe('2-4 sections covering different aspects'),
  
  trendAnalysis: z.object({
    pattern: z.string().describe('The pattern observed in these commits'),
    significance: z.string().describe('What this pattern indicates for OpenClaw'),
    relatedAreas: z.array(z.string()).describe('Parts of the codebase affected'),
  }).describe('Analysis of the development pattern'),
  
  contributorInsights: z.array(z.object({
    username: z.string(),
    role: z.string().describe('Their role: Lead, Contributor, Reviewer'),
    contribution: z.string().describe('Factual description of what they contributed'),
    commitCount: z.number(),
  })).min(1).max(5).describe('Contributors to this work'),
  
  technicalDeepDive: z.object({
    whatChanged: z.string().describe('Technical explanation of the changes'),
    whyItMatters: z.string().describe('What this affects (users, APIs, stability)'),
    architectureNotes: z.string().optional().describe('How it connects to OpenClaw architecture (Gateway, Pi agent, Skills, Canvas)'),
  }).optional().describe('Technical details for developers'),
  
  keyTakeaways: z.array(z.string()).min(2).max(4).describe('2-4 factual bullet points'),
  
  outlook: z.string().describe('Based on commit patterns, what might follow'),
  
  sentiment: z.enum(['momentum', 'stability', 'exploration', 'maintenance']).describe('Category of this work'),
  
  relatedTopics: z.array(z.string()).min(2).max(4).describe('Related areas of the codebase'),
})

export type OpenClawExpandedArticleData = z.infer<typeof OpenClawExpandedArticleSchema>

export const OpenClawNewspaperSchema = z.object({
  headline: z.string().describe('Factual headline (5-10 words) describing the main development focus. Example: "Gateway Error Handling Improvements"'),
  subheadline: z.string().describe('Brief context for the headline. Example: "15 contributors addressed stability across Gateway and iOS"'),
  
  leadStory: z.object({
    title: z.string().describe('Descriptive title for the main summary'),
    summary: z.string().describe('2-3 short paragraphs summarizing the day\'s commits. State WHAT changed and WHO contributed. Reference specific commits and usernames with @. Keep it factual and concise.'),
    impact: z.string().describe('1-2 sentences on what these changes affect (users, APIs, stability)'),
    contributors: z.array(z.string()).describe('GitHub usernames of contributors (use @ prefix)'),
  }),
  
  developerSpotlight: z.object({
    username: z.string().describe('GitHub username (with @) of the most active contributor'),
    contribution: z.string().describe('Factual description of what they worked on'),
    commitCount: z.number().describe('Their commit count for this period'),
  }).optional().describe('The contributor with most commits today'),
  
  technicalHighlights: z.array(z.object({
    category: z.enum([
      'Feature', 
      'Bugfix', 
      'Refactor', 
      'Documentation', 
      'Performance', 
      'Security', 
      'Testing', 
      'Infrastructure'
    ]),
    title: z.string().describe('Clear title describing the change'),
    description: z.string().describe('1 sentence explaining what changed'),
    commitSha: z.string().optional().describe('The short SHA of the related commit'),
  })).describe('4-6 notable commits, one sentence each'),
  
  briefNews: z.array(z.object({
    title: z.string().describe('Short label for this pattern (3-6 words)'),
    text: z.string().describe('1-2 sentences noting the pattern across commits'),
    relatedCommits: z.number().optional().describe('How many commits relate to this pattern'),
  })).optional().describe('3-5 patterns observed across commits (e.g., "iOS: 5 stability fixes", "Test coverage expanded")'),
  
  codeInsights: z.object({
    totalCommits: z.number(),
    mergeCommits: z.number(),
    uniqueContributors: z.number(),
    mostActiveDay: z.string().optional(),
    dominantCategory: z.string().describe('The category with the most commits'),
  }),
  
  weekAhead: z.string().describe('1-2 sentences on what patterns suggest might continue (based on commit activity, not speculation)'),
  funFact: z.string().optional().describe('An amusing commit message or pattern, if any. Keep it brief. Skip if nothing notable.'),
})

export type OpenClawNewspaperData = z.infer<typeof OpenClawNewspaperSchema>

// ============================================
// Issues & Pull Requests Newspaper Schema
// ============================================

/**
 * Schema for clustered issues/PRs - groups related items together
 */
export const IssueClusterSchema = z.object({
  id: z.string().describe('Unique cluster identifier (e.g., "audio-ios", "gateway-errors")'),
  name: z.string().describe('Human-readable cluster name (e.g., "iOS Audio Subsystem")'),
  theme: z.string().describe('What connects these issues/PRs together'),
  
  priority: z.enum(['critical', 'high', 'medium', 'low']).describe('Priority based on impact and urgency'),
  
  issues: z.array(z.object({
    number: z.number(),
    title: z.string(),
    relevance: z.string().describe('Why this issue belongs to this cluster'),
  })).describe('Related issues'),
  
  pullRequests: z.array(z.object({
    number: z.number(),
    title: z.string(),
    relevance: z.string().describe('Why this PR belongs to this cluster'),
    status: z.enum(['open', 'merged', 'draft']),
  })).optional().describe('Related pull requests'),
  
  affectedAreas: z.array(z.string()).describe('Parts of the codebase affected (e.g., "/ios/Audio/*", "Gateway")'),
  
  actionPrompt: z.string().describe('A concrete, actionable prompt for addressing this cluster. Be specific about what to implement, fix, or refactor.'),
  
  estimatedScope: z.enum(['small', 'medium', 'large', 'epic']).describe('Rough scope of work'),
  
  dependencies: z.array(z.string()).optional().describe('Other clusters or external dependencies'),
  
  suggestedApproach: z.array(z.string()).min(2).max(5).describe('2-5 concrete steps to address this cluster'),
})

export type IssueCluster = z.infer<typeof IssueClusterSchema>

/**
 * Schema for the Issues/PRs newspaper
 */
export const OpenClawIssuesNewspaperSchema = z.object({
  headline: z.string().describe('Factual headline summarizing the repo state (5-10 words). Example: "Gateway Stability Dominates Open Issues"'),
  subheadline: z.string().describe('Brief context. Example: "143 open issues across 12 themes, 28 PRs awaiting review"'),
  
  summary: z.object({
    overview: z.string().describe('2-3 paragraphs summarizing the overall state of issues and PRs. What are the main themes? Where is effort focused?'),
    healthScore: z.enum(['healthy', 'attention-needed', 'concerning', 'critical']).describe('Overall project health based on issue/PR state'),
    healthReason: z.string().describe('Brief explanation of the health score'),
  }),
  
  clusters: z.array(IssueClusterSchema).min(3).max(10).describe('3-10 thematic clusters of related issues/PRs'),
  
  hotspots: z.array(z.object({
    area: z.string().describe('Area of the codebase or feature'),
    issueCount: z.number(),
    prCount: z.number(),
    trend: z.enum(['increasing', 'stable', 'decreasing']).describe('Based on recent activity'),
    insight: z.string().describe('What this hotspot indicates'),
  })).min(3).max(6).describe('Areas with concentrated activity'),
  
  staleItems: z.object({
    issues: z.array(z.object({
      number: z.number(),
      title: z.string(),
      daysSinceUpdate: z.number(),
      suggestion: z.string().describe('What to do with this stale issue'),
    })).max(5).describe('Issues with no activity for 30+ days'),
    pullRequests: z.array(z.object({
      number: z.number(),
      title: z.string(),
      daysSinceUpdate: z.number(),
      suggestion: z.string().describe('What to do with this stale PR'),
    })).max(5).describe('PRs with no activity for 14+ days'),
  }).optional().describe('Items that need attention due to inactivity'),
  
  quickWins: z.array(z.object({
    number: z.number(),
    type: z.enum(['issue', 'pr']),
    title: z.string(),
    reason: z.string().describe('Why this is a quick win'),
    actionPrompt: z.string().describe('Specific prompt to address this item'),
  })).min(2).max(5).describe('Low-effort, high-value items to tackle first'),
  
  contributorInsights: z.object({
    mostActive: z.array(z.object({
      username: z.string(),
      issuesOpened: z.number(),
      prsOpened: z.number(),
      focus: z.string().describe('What areas they work on'),
    })).max(5),
    needsReviewers: z.array(z.string()).optional().describe('PRs that need reviewer attention'),
  }).optional(),
  
  batchPrompt: z.string().describe('A comprehensive prompt that addresses multiple clusters at once. This should be a well-structured prompt that a developer could use to tackle several related issues in one session.'),
  
  outlook: z.string().describe('1-2 sentences on what patterns suggest for the project direction'),
  
  stats: z.object({
    totalIssues: z.number(),
    openIssues: z.number(),
    totalPRs: z.number(),
    openPRs: z.number(),
    mergedPRsLast30Days: z.number().optional(),
    avgIssueAge: z.number().optional().describe('Average age of open issues in days'),
  }),
})

export type OpenClawIssuesNewspaperData = z.infer<typeof OpenClawIssuesNewspaperSchema>
