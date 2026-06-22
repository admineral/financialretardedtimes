import type { createClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'
import { createHash } from 'crypto'
import type { ModuleCachePolicy, NewspaperIssue } from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export const NEWSPAPER_ISSUE_TTL_SECONDS = 24 * 60 * 60

export interface NewspaperModuleCachePayload<TData = unknown> {
  moduleId: string
  cacheDate: string
  dayRange: number
  moduleVersion: string
  resourceFingerprint: string
  data: TData
  metadata?: Record<string, unknown>
  messageCount: number
  uniqueUsers: number
  updatedAt?: string
}

export interface NewspaperModuleCacheRow<TData = unknown> extends NewspaperModuleCachePayload<TData> {
  createdAt: string
  updatedAt: string
}

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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`
}

export function buildModuleResourceFingerprint(input: {
  moduleId: string
  moduleVersion: string
  issueDate: string
  dayRange: number
  resources?: unknown
  promptVersion?: string
}): string {
  return createHash('sha256')
    .update(stableStringify(input))
    .digest('hex')
    .slice(0, 24)
}

export function revalidateModuleCacheTags(moduleId: string, date: string, dayRange: number, cache?: ModuleCachePolicy) {
  revalidateTag(`newspaper:module:${moduleId}`, { expire: 0 })
  revalidateTag(moduleCacheTag(moduleId, date, dayRange), { expire: 0 })
  for (const tag of cache?.tags ?? []) {
    revalidateTag(tag, { expire: 0 })
  }
}

export async function writeNewspaperModuleCache<TData>(
  supabase: SupabaseServerClient,
  payload: NewspaperModuleCachePayload<TData>,
  cache?: ModuleCachePolicy
): Promise<void> {
  const updatedAt = payload.updatedAt ?? new Date().toISOString()
  const { error } = await supabase
    .from('newspaper_module_cache')
    .upsert({
      module_id: payload.moduleId,
      cache_date: payload.cacheDate,
      day_range: payload.dayRange,
      module_version: payload.moduleVersion,
      resource_fingerprint: payload.resourceFingerprint,
      data: payload.data,
      metadata: payload.metadata ?? {},
      message_count: payload.messageCount,
      unique_users: payload.uniqueUsers,
      updated_at: updatedAt
    }, {
      onConflict: 'module_id,cache_date,day_range,module_version,resource_fingerprint'
    })

  if (error) {
    console.error('[NEWSPAPER-ENGINE] Failed module cache write:', payload.moduleId, error.message)
    return
  }

  revalidateModuleCacheTags(payload.moduleId, payload.cacheDate, payload.dayRange, cache)
}

export async function readLatestNewspaperModuleCache<TData>(
  supabase: SupabaseServerClient,
  params: {
    moduleId: string
    cacheDate: string
    dayRange: number
    moduleVersion?: string
    resourceFingerprint?: string
  }
): Promise<NewspaperModuleCacheRow<TData> | null> {
  let query = supabase
    .from('newspaper_module_cache')
    .select('module_id, cache_date, day_range, module_version, resource_fingerprint, data, metadata, message_count, unique_users, created_at, updated_at')
    .eq('module_id', params.moduleId)
    .eq('cache_date', params.cacheDate)
    .eq('day_range', params.dayRange)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (params.moduleVersion) {
    query = query.eq('module_version', params.moduleVersion)
  }
  if (params.resourceFingerprint) {
    query = query.eq('resource_fingerprint', params.resourceFingerprint)
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    if (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message?.includes('newspaper_module_cache') ||
      error.message?.includes('Could not find the table')
    ) {
      return null
    }
    console.error('[NEWSPAPER-ENGINE] Failed module cache read:', params.moduleId, error.message)
    return null
  }
  if (!data) return null

  return {
    moduleId: data.module_id,
    cacheDate: data.cache_date,
    dayRange: data.day_range,
    moduleVersion: data.module_version,
    resourceFingerprint: data.resource_fingerprint,
    data: data.data as TData,
    metadata: data.metadata as Record<string, unknown>,
    messageCount: data.message_count,
    uniqueUsers: data.unique_users,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
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
    revalidateModuleCacheTags(moduleId, issue.meta.issueDate, issue.meta.dayRange)
  }
}
