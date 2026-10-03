/**
 * GET /newspaper/people/api/network?username=&room=&from=&to=&kind=&limit=&ring2=
 *
 * Ego network of one user from every stored message in the room (all
 * years, both sources): quotes and @mentions in both directions, plus the
 * shared circle (people tied to two or more of the user's contacts).
 * Nodes carry the stats the hover card shows, so the page needs no
 * per-person requests.
 */

import { z } from 'zod'
import { archiveError } from '@/lib/archive/http'
import { canonicalName, profileResolver, roomIndex } from '@/lib/people'
import { buildEgoNetwork } from '@/lib/people/ego'
import { PRIVATE_SHORT_CACHE, notFound, optionalDate, readParams, roomSchema, usernameSchema } from '@/lib/people/http'
import type { NetworkResponse } from '@/lib/people/types'

export const maxDuration = 120

export async function GET(request: Request) {
  try {
    const params = readParams(request, {
      room: roomSchema,
      username: usernameSchema,
      from: optionalDate,
      to: optionalDate,
      kind: z.enum(['all', 'quote', 'mention']).default('all'),
      limit: z.coerce.number().int().min(5).max(200).default(40),
      ring2: z.coerce.number().int().min(0).max(80).default(20)
    })
    const index = await roomIndex(params.room)
    const name = canonicalName(index, params.username)
    if (!name) return notFound(params.username)

    const graph = buildEgoNetwork(name, index.events, profileResolver(index), {
      from: params.from,
      to: params.to,
      kind: params.kind,
      limit: params.limit,
      secondRing: params.ring2
    })

    const body: NetworkResponse = {
      username: name,
      room: params.room,
      range: { from: params.from ?? null, to: params.to ?? null },
      ...graph,
      readAt: index.readAt
    }
    return Response.json(body, { headers: PRIVATE_SHORT_CACHE })
  } catch (error) {
    return archiveError(error)
  }
}
