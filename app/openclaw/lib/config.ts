/**
 * OpenClaw Today - Configuration
 * 
 * Centralized configuration for the newspaper feature.
 * Edit this file to change the target repository or settings.
 */

import type { Language } from './prompts'
export type { Language }

export const CONFIG = {
  // Target GitHub repository
  repo: {
    owner: 'openclaw',
    name: 'openclaw',
    get fullName() {
      return `${this.owner}/${this.name}`
    },
    get url() {
      return `https://github.com/${this.owner}/${this.name}`
    },
  },
  
  // Newspaper settings
  newspaper: {
    title: 'OpenClaw Today',
    subtitle: 'Development News • Open Source Edition',
    emoji: '🦞',
    defaultCommitCount: 50,
    maxCommitCount: 100,
  },
  
  // AI settings
  ai: {
    model: 'gpt-5.4' as const,
  },
  
  // Cache settings (in seconds)
  cache: {
    commits: 300, // 5 minutes
    repoInfo: 3600, // 1 hour
  },
}

/**
 * Detect the preferred language based on Vercel's geolocation headers
 * or Accept-Language header
 */
export function detectLanguage(headers: Headers): Language {
  // Check Vercel's geolocation header first
  const country = headers.get('x-vercel-ip-country')
  
  // German-speaking countries
  const germanCountries = ['DE', 'AT', 'CH', 'LI']
  if (country && germanCountries.includes(country)) {
    return 'de'
  }
  
  // Fall back to Accept-Language header
  const acceptLanguage = headers.get('accept-language') || ''
  if (acceptLanguage.toLowerCase().startsWith('de')) {
    return 'de'
  }
  
  // Default to English
  return 'en'
}

/**
 * Get localized UI strings
 */
export function getUIStrings(language: Language) {
  const strings = {
    en: {
      backLink: '← Back',
      generateButton: 'Generate Newspaper',
      loadingCommits: 'Loading commits...',
      commitsReady: (count: number) => `${count} commits ready for analysis`,
      analyzing: 'AI analyzing commits...',
      error: 'Error',
      githubUnavailable: 'GitHub is not available right now. Please try again later.',
      stalePreview: 'Hinweis: old data point',
      stalePreviewDescription: 'Fresh GitHub data is unavailable, so this is a stored preview from an earlier generation.',
      retry: 'Try again',
      leadArticle: 'Lead Article',
      technicalHighlights: 'Technical Highlights',
      briefNews: 'In Brief',
      developerSpotlight: 'Developer Spotlight',
      codeInsights: 'Code Insights',
      funFact: 'Fun Fact',
      outlook: 'Outlook',
      recentCommits: 'Recent Commits',
      viewAllCommits: 'View all commits',
      commits: 'Commits',
      merges: 'Merges',
      contributors: 'Contributors',
      totalCommits: 'Total Commits',
      mergeCommits: 'Merge Commits',
      mostActiveDay: 'Most Active Day',
      dominantCategory: 'Dominant Category',
      impact: 'Impact',
      involved: 'Contributors',
      regenerate: 'Regenerate',
      readFullArticle: 'Read Full Article',
      footer: 'OpenClaw Today • A Financial Retarded Times Publication • Powered by AI',
    },
    de: {
      backLink: '← Zurück',
      generateButton: 'Zeitung generieren',
      loadingCommits: 'Lade Commits...',
      commitsReady: (count: number) => `${count} Commits bereit zur Analyse`,
      analyzing: 'KI analysiert Commits...',
      error: 'Fehler',
      githubUnavailable: 'GitHub ist gerade nicht erreichbar. Bitte versuche es später noch einmal.',
      stalePreview: 'Hinweis: alter Datenstand',
      stalePreviewDescription: 'Frische GitHub-Daten sind gerade nicht verfügbar, daher zeigen wir eine gespeicherte Vorschau aus einer früheren Generierung.',
      retry: 'Erneut versuchen',
      leadArticle: 'Leitartikel',
      technicalHighlights: 'Technische Highlights',
      briefNews: 'Kurzmeldungen',
      developerSpotlight: 'Developer Spotlight',
      codeInsights: 'Code Insights',
      funFact: 'Fun Fact',
      outlook: 'Ausblick',
      recentCommits: 'Letzte Commits',
      viewAllCommits: 'Alle Commits anzeigen',
      commits: 'Commits',
      merges: 'Merges',
      contributors: 'Contributors',
      totalCommits: 'Total Commits',
      mergeCommits: 'Merge Commits',
      mostActiveDay: 'Aktivster Tag',
      dominantCategory: 'Dominante Kategorie',
      impact: 'Impact',
      involved: 'Beteiligte',
      regenerate: 'Neu generieren',
      readFullArticle: 'Vollständiger Artikel',
      footer: 'OpenClaw Today • Eine Publikation der Financial Retarded Times • Powered by AI',
    },
  }
  
  return strings[language] || strings.en
}
