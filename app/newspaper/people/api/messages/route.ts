/**
 * GET /newspaper/people/api/messages?username=&room=&year=
 * One calendar year (Europe/Berlin) of a user's stored messages, merged and
 * deduplicated across profile days and the room archive. The page loads
 * years newest-first so the latest conversation paints immediately.
 */
import { z } from 'zod'
import { archiveError } from '@/lib/archive/http'
import { canonicalName, readPersonArchive, roomIndex } from '@/lib/people'
import { notFound, readParams, roomSchema, usernameSchema } from '@/lib/people/http'
import type { CompactMessage } from '@/lib/people/types'

export const maxDuration = 120

export async function GET(request: Request) {
  try {
    const { room, username, year } = readParams(request, {
      room: roomSchema,
      username: usernameSchema,
      year: z.coerce.number().int().min(2010).max(2100)
    })
    const index = await roomIndex(room)
    const name = canonicalName(index, username)
    if (!name) return notFound(username)
    const stored = await readPersonArchive(index, name, `${year}-01-01`, `${year}-12-31`)
    const messages: CompactMessage[] = stored.map(m => ({
      id: m.id,
      ts: m.timestamp,
      date: m.date,
      text: m.text
    }))
    // Past years do not change any more; the current one may.
    const past = year < new Date().getUTCFullYear()
    return Response.json(
      { username: name, room, year, messages },
      { headers: { 'Cache-Control': past ? 'private, max-age=3600' : 'private, max-age=60' } }
    )
  } catch (error) {
    return archiveError(error)
  }
}
