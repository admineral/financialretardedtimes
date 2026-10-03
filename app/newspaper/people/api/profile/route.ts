/**
 * GET /newspaper/people/api/profile?username=&room=
 * Totals, day counts for every stored year and the cached TradingView
 * profile row. No message bodies; those come per year from ../messages.
 */
import { archiveError } from '@/lib/archive/http'
import { canonicalName, personDays, personProfile, roomIndex, yearSummaries } from '@/lib/people'
import { PRIVATE_SHORT_CACHE, notFound, readParams, roomSchema, usernameSchema } from '@/lib/people/http'
import type { ProfileResponse } from '@/lib/people/types'

export const maxDuration = 120

export async function GET(request: Request) {
  try {
    const { room, username } = readParams(request, { room: roomSchema, username: usernameSchema })
    const index = await roomIndex(room)
    const name = canonicalName(index, username)
    if (!name) return notFound(username)
    const days = personDays(index, name)
    const body: ProfileResponse = {
      username: name,
      room,
      profile: personProfile(index, name),
      days,
      years: yearSummaries(days),
      readAt: index.readAt
    }
    return Response.json(body, { headers: PRIVATE_SHORT_CACHE })
  } catch (error) {
    return archiveError(error)
  }
}
