import 'server-only'
import { z } from 'zod'
import { dateKeySchema } from '@/lib/archive/filter'
import { DEFAULT_ROOM } from '@/lib/tv-chat/types'

export const roomSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).default(DEFAULT_ROOM)
export const usernameSchema = z.string().trim().regex(/^@?[A-Za-z0-9_.-]{1,40}$/, 'Ungültiger Benutzername').transform(v => v.replace(/^@/, ''))

export function readParams<T extends z.ZodRawShape>(request: Request, shape: T) {
  const params = new URL(request.url).searchParams
  const raw: Record<string, string> = {}
  for (const key of Object.keys(shape)) {
    const value = params.get(key)
    if (value !== null && value !== '') raw[key] = value
  }
  return z.object(shape).parse(raw)
}

export const optionalDate = dateKeySchema.optional()

export function notFound(username: string) {
  return Response.json(
    { error: `Für „${username}“ ist in diesem Raum nichts gespeichert.` },
    { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export const PRIVATE_SHORT_CACHE = { 'Cache-Control': 'private, max-age=60' }
