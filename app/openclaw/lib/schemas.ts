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
  title: z.string().describe('Engaging article title based on the theme'),
  subtitle: z.string().describe('One sentence subtitle adding context'),
  
  introduction: z.string().describe('2-3 sentences setting up the story - what happened and why it matters'),
  
  sections: z.array(z.object({
    heading: z.string().describe('Section heading'),
    content: z.string().describe('2-4 paragraphs diving deep into this aspect'),
    relatedCommits: z.array(z.object({
      sha: z.string(),
      message: z.string(),
      author: z.string(),
    })).optional().describe('Specific commits related to this section'),
  })).min(2).max(4).describe('2-4 detailed sections exploring different aspects'),
  
  trendAnalysis: z.object({
    pattern: z.string().describe('The overall pattern/trend identified'),
    significance: z.string().describe('Why this trend matters for OpenClaw'),
    relatedAreas: z.array(z.string()).describe('Related parts of the codebase affected'),
  }).describe('Analysis of the development trend'),
  
  contributorInsights: z.array(z.object({
    username: z.string(),
    role: z.string().describe('Their role in this work: Lead, Contributor, Reviewer'),
    contribution: z.string().describe('What they specifically contributed'),
    commitCount: z.number(),
  })).min(1).max(5).describe('Key contributors to this work'),
  
  technicalDeepDive: z.object({
    whatChanged: z.string().describe('Technical explanation of what changed'),
    whyItMatters: z.string().describe('Impact on users and the project'),
    architectureNotes: z.string().optional().describe('How it connects to OpenClaw architecture (Gateway, Pi agent, Skills, Canvas)'),
  }).optional().describe('Technical deep dive for developer audience'),
  
  keyTakeaways: z.array(z.string()).min(2).max(4).describe('2-4 bullet point takeaways'),
  
  outlook: z.string().describe('What this might lead to next, based on the commit patterns'),
  
  sentiment: z.enum(['momentum', 'stability', 'exploration', 'maintenance']).describe('Overall sentiment of this work'),
  
  relatedTopics: z.array(z.string()).min(2).max(4).describe('Related topics/areas for further reading'),
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
