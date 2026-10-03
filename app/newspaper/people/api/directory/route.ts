/** GET /newspaper/people/api/directory?room= — everyone with stored messages, busiest first. */
import { archiveError } from '@/lib/archive/http'
import { directory, roomIndex } from '@/lib/people'
import { PRIVATE_SHORT_CACHE, readParams, roomSchema } from '@/lib/people/http'

export const maxDuration = 120

export async function GET(request: Request) {
  try {
    const { room } = readParams(request, { room: roomSchema })
    const index = await roomIndex(room)
    return Response.json({ room, people: directory(index), readAt: index.readAt }, { headers: PRIVATE_SHORT_CACHE })
  } catch (error) {
    return archiveError(error)
  }
}
