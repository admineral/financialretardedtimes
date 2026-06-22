import type { createClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'
import type { NewspaperIssue } from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export const NEWSPAPER_ISSUE_TTL_SECONDS = 24 * 60 * 60

export function getIssueExpiresAt(updatedAt: string): string {
  return new Date(new Date(updatedAt).getTime() + NEWSPAPER_ISSUE_TTL_SECONDS * 1000).toISOString()
}

export function isIssueFresh(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < NEWSPAPER_ISSUE_TTL_SECONDS * 1000
}

export function issueCacheTag(date: string, dayRange: number): string {
  return `newspaper:issue:${date}:${dayRange}`
}

export function moduleCacheTag(moduleId: string, date: string, dayRange: number): string {
  return `newspaper:module:${moduleId}:${date}:${dayRange}`
}

export async function writeNewspaperIssueCache(
  supabase: SupabaseServerClient,
  issue: NewspaperIssue
): Promise<void> {
  const { error } = await supabase
    .from('newspaper_cache')
    .upsert({
      cache_date: issue.meta.issueDate,
      day_range: issue.meta.dayRange,
      data: issue,
      message_count: issue.resources.counts.newspaperMessages,
      unique_users: issue.resources.counts.newspaperUsers,
      updated_at: issue.meta.updatedAt
    }, {
      onConflict: 'cache_date,day_range'
    })

  if (error) {
    console.error('[NEWSPAPER-ENGINE] Failed issue cache write:', error.message)
    return
  }

  revalidateTag(issueCacheTag(issue.meta.issueDate, issue.meta.dayRange), { expire: 0 })
  revalidateTag('newspaper:latest', { expire: 0 })
  for (const moduleId of Object.keys(issue.meta.moduleVersions)) {
    revalidateTag(`newspaper:module:${moduleId}`, { expire: 0 })
    revalidateTag(moduleCacheTag(moduleId, issue.meta.issueDate, issue.meta.dayRange), { expire: 0 })
  }
}
