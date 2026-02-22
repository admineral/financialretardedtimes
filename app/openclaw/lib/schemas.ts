/**
 * OpenClaw Today - Zod Schemas
 * 
 * Schema definitions for the newspaper data structure.
 * Used for AI response validation and type inference.
 */

import { z } from 'zod'

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
    text: z.string().describe('One-liner news item (max 15 words)'),
    commitSha: z.string().optional().describe('Related commit SHA if applicable'),
  })).optional().describe('Kurzmeldungen: 3-5 quick-hit updates for smaller changes that don\'t need full highlights (chores, minor fixes, dependency updates, typo fixes)'),
  
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
