/**
 * GET /newspaper/people/api/export?username=&room=&from=&to=&download=1
 *
 * LLM-ready JSON of one user's stored history (lib/people/llm-export.ts).
 * Without from/to the last 3650 days are exported. `download=1` adds an
 * attachment disposition with a sanitised filename; otherwise the same
 * body is returned inline for the copy button. Always application/json
 * with nosniff, so a browser never renders it as a page.
 */
import { z } from 'zod'
import { archiveError } from '@/lib/archive/http'
import { textStream } from '@/lib/archive/serialize'
import { addDaysToDateKey, getNewspaperDateKey } from '@/app/newspaper/lib/timezone'
import { canonicalName, personProfile, readPersonArchive, roomIndex } from '@/lib/people'
import { btcDailyCloses } from '@/lib/people/btc'
import { notFound, optionalDate, readParams, roomSchema, usernameSchema } from '@/lib/people/http'
import { DEFAULT_EXPORT_DAYS, exportFilename, llmExport } from '@/lib/people/llm-export'

export const maxDuration = 300

export async function GET(request: Request) {
  try {
    const params = readParams(request, {
      room: roomSchema,
      username: usernameSchema,
      from: optionalDate,
      to: optionalDate,
      btc: z.enum(['0', '1']).default('1'),
      download: z.enum(['0', '1']).default('0')
    })
    const index = await roomIndex(params.room)
    const name = canonicalName(index, params.username)
    if (!name) return notFound(params.username)

    const to = params.to ?? getNewspaperDateKey()
    const earliest = addDaysToDateKey(to, 1 - DEFAULT_EXPORT_DAYS)
    const from = params.from && params.from > earliest ? params.from : earliest
    if (from > to) return Response.json({ error: 'Startdatum liegt nach dem Enddatum.' }, { status: 400 })

    const [stored, btcDaily] = await Promise.all([
      readPersonArchive(index, name, from, to),
      params.btc === '1' ? btcDailyCloses(from, to) : Promise.resolve(null)
    ])

    const body = llmExport({
      subject: personProfile(index, name),
      room: params.room,
      from,
      to,
      messages: stored.map(m => ({ timestamp: m.timestamp, date: m.date, text: m.text })),
      events: index.events,
      btcDaily
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Message-Count': String(stored.length)
    }
    if (params.download === '1') {
      headers['Content-Disposition'] = `attachment; filename="${exportFilename(name, from, to)}"`
    }
    return new Response(textStream(body), { headers })
  } catch (error) {
    return archiveError(error)
  }
}
