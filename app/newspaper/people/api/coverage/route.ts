/**
 * GET /newspaper/people/api/coverage?username=&room=
 *
 * How much of a person's history has actually been checked: per year,
 * days already looked up (with or without messages) versus days never
 * fetched, from the TradingView join date (or first stored day) until
 * today. `missing` lists the unchecked dates, newest first, so the page
 * can fill gaps in small chunks through /api/chat-activity.
 */
import { archiveError } from '@/lib/archive/http'
import { archiveDatabase } from '@/lib/archive/database'
import { addDaysToDateKey, getNewspaperDateKey } from '@/app/newspaper/lib/timezone'
import { canonicalName, personProfile, roomIndex } from '@/lib/people'
import { notFound, readParams, roomSchema, usernameSchema } from '@/lib/people/http'
import type { CoverageResponse, CoverageYear } from '@/lib/people/types'

export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const { room, username } = readParams(request, { room: roomSchema, username: usernameSchema })
    const index = await roomIndex(room)
    const name = canonicalName(index, username)
    if (!name) return notFound(username)
    const spellings = index.variants.get(name) ?? [name]

    const rows = await archiveDatabase()`
      SELECT date::text AS date, max(message_count) AS count
      FROM tv_user_activity_daily
      WHERE room_id = ${room} AND username IN ${archiveDatabase()(spellings)}
      GROUP BY date`
    const checked = new Map<string, number>(rows.map(row => [String(row.date), Number(row.count)]))

    const profile = personProfile(index, name)
    const today = getNewspaperDateKey()
    // From the TradingView join date; without one, from the oldest stored or checked day.
    const firstKnown = [profile.firstDate, ...checked.keys()].filter(Boolean).sort()[0] as string | undefined
    const start = profile.joinDate ?? firstKnown ?? today

    const years = new Map<number, CoverageYear>()
    const missing: string[] = []
    for (let day = today; day >= start; day = addDaysToDateKey(day, -1)) {
      const year = Number(day.slice(0, 4))
      const entry = years.get(year) ?? { year, days: 0, checked: 0, withMessages: 0 }
      entry.days++
      const count = checked.get(day)
      if (count === undefined) missing.push(day)
      else {
        entry.checked++
        if (count > 0) entry.withMessages++
      }
      years.set(year, entry)
    }

    const body: CoverageResponse = {
      username: name,
      spellings,
      room,
      from: start,
      to: today,
      years: Array.from(years.values()),
      missing
    }
    return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return archiveError(error)
  }
}
