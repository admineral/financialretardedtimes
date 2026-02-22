/**
 * OpenClaw Today - Zod Schemas
 * 
 * Schema definitions for the newspaper data structure.
 * Used for AI response validation and type inference.
 */

import { z } from 'zod'

export const OpenClawNewspaperSchema = z.object({
  headline: z.string().describe('Main newspaper headline summarizing the most important development'),
  subheadline: z.string().describe('Secondary headline providing additional context'),
  
  leadStory: z.object({
    title: z.string().describe('Title of the lead story'),
    summary: z.string().describe('2-3 paragraph summary of the most significant changes'),
    impact: z.string().describe('Impact analysis of these changes for users'),
    contributors: z.array(z.string()).describe('Key contributors to this development'),
  }),
  
  developerSpotlight: z.object({
    username: z.string().describe('GitHub username of the featured developer'),
    contribution: z.string().describe('Description of their notable contribution'),
    commitCount: z.number().describe('Number of commits in this period'),
  }).optional(),
  
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
    title: z.string().describe('Short title for this highlight'),
    description: z.string().describe('Brief description of the change'),
    commitSha: z.string().optional().describe('Related commit SHA'),
  })).describe('List of notable technical changes (max 6)'),
  
  codeInsights: z.object({
    totalCommits: z.number(),
    mergeCommits: z.number(),
    uniqueContributors: z.number(),
    mostActiveDay: z.string().optional(),
    dominantCategory: z.string().describe('Most common type of change'),
  }),
  
  weekAhead: z.string().describe('Brief outlook or prediction for upcoming development'),
  funFact: z.string().optional().describe('Interesting or humorous observation from the commits'),
})

export type OpenClawNewspaperData = z.infer<typeof OpenClawNewspaperSchema>
