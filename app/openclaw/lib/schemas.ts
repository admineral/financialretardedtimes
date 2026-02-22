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
  headline: z.string().describe('Attention-grabbing headline (5-10 words) capturing the day\'s most impactful development. Example: "Gateway Overhaul Brings 50% Faster Response Times"'),
  subheadline: z.string().describe('Supporting context that complements the headline. Example: "Community rallies with 15 contributors pushing stability improvements"'),
  
  leadStory: z.object({
    title: z.string().describe('Engaging title for the main article'),
    summary: z.string().describe('2-3 paragraphs telling the story of today\'s development. Explain WHAT changed, WHY it matters, and WHO drove it. Reference specific commits and usernames. Connect to OpenClaw architecture (Gateway, Pi agent, Skills, Canvas) when relevant.'),
    impact: z.string().describe('1-2 sentences on how these changes affect end users or the project direction'),
    contributors: z.array(z.string()).describe('GitHub usernames of key contributors to highlight (use @ prefix)'),
  }),
  
  developerSpotlight: z.object({
    username: z.string().describe('GitHub username (with @) of a standout contributor'),
    contribution: z.string().describe('What they did and why it\'s noteworthy - make them feel appreciated'),
    commitCount: z.number().describe('Their commit count for this period'),
  }).optional().describe('Feature a developer who made significant impact today'),
  
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
    title: z.string().describe('Catchy title for this highlight (not just the commit message)'),
    description: z.string().describe('1-2 sentences explaining the change and its significance'),
    commitSha: z.string().optional().describe('The short SHA of the related commit'),
  })).describe('4-6 notable changes across different categories, each telling a mini-story'),
  
  briefNews: z.array(z.object({
    title: z.string().describe('Short headline for this theme (3-6 words)'),
    text: z.string().describe('1-2 sentences connecting multiple commits around this theme'),
    relatedCommits: z.number().optional().describe('How many commits relate to this theme'),
  })).optional().describe('Kurzmeldungen: 3-5 thematic summaries that connect multiple commits. Each item identifies a pattern/trend across commits (e.g., "iOS stability focus", "Documentation push", "Test coverage expansion") and explains the collective effort.'),
  
  codeInsights: z.object({
    totalCommits: z.number(),
    mergeCommits: z.number(),
    uniqueContributors: z.number(),
    mostActiveDay: z.string().optional(),
    dominantCategory: z.string().describe('The category with the most commits'),
  }),
  
  weekAhead: z.string().describe('1-2 sentences predicting what might come next based on today\'s commits and patterns'),
  funFact: z.string().optional().describe('Something amusing, surprising, or human from the commits - a creative message, unusual pattern, or community moment'),
})

export type OpenClawNewspaperData = z.infer<typeof OpenClawNewspaperSchema>
