/**
 * Generate API (Newspaper edition v3)
 *
 * POST /newspaper/api/generate → streams the mega tri-edition object
 * (edition1d + edition3d + edition7d + shared modules) as partial JSON.
 * Body `{ anchorDate?, mode?: 'stream' | 'background' }`. In background
 * mode the route answers 202 immediately and finishes the print run in
 * after(); clients poll GET /newspaper/api/edition until lockActive clears.
 *
 * Persistence guarantee: streamObject's streams are single-consumer, so
 * this route drains the AI text stream itself and forwards chunks to the
 * client. If the client disconnects, the server keeps draining, onFinish
 * still fires, and all three edition rows are written. `after()` keeps
 * the serverless function alive until persistence settles and surfaces
 * any write error in the logs. A single-flight lock
 * (newspaper_generation_lock) prevents duplicate mega generations.
 */

import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createEditionStream } from '../../edition/generate'
import { acquireGenerationLock, releaseGenerationLock } from '../../edition/store'
import { getNewspaperDateKey } from '../../lib/timezone'

export const maxDuration = 800

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const body = await request.json().catch(() => ({}))
  const anchorDate: string = typeof body.anchorDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.anchorDate)
    ? body.anchorDate
    : getNewspaperDateKey()

  if (anchorDate > getNewspaperDateKey()) {
    return new Response(
      JSON.stringify({ error: 'Cannot generate an edition for a future date' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = await createClient()
  const holder = `gen-${randomUUID()}`

  const locked = await acquireGenerationLock(supabase, anchorDate, holder)
  if (!locked) {
    return new Response(
      JSON.stringify({ error: 'Generation already in progress', locked: true }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const background = body.mode === 'background'

  try {
    const handle = await createEditionStream({ supabase, anchorDate })

    if (background) {
      // Fire-and-forget for readers who prefer a quiet page: respond at
      // once, drain + persist inside after() (kept alive up to maxDuration),
      // and let the client poll the read API until the lock clears.
      after(async () => {
        try {
          // Drain only: onFinish persists all three rows.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _delta of handle.result.textStream) { /* drain */ }
          await handle.persisted
        } catch (error) {
          console.error('[EDITION-GENERATE] Background generation did not persist:', error)
        } finally {
          await releaseGenerationLock(supabase, anchorDate, holder)
        }
      })

      return new Response(
        JSON.stringify({
          queued: true,
          generationId: handle.generationId,
          generatedAt: handle.generatedAt,
          anchorDate
        }),
        { status: 202, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      )
    }

    // Forward the AI stream to the client while draining it server-side:
    // the drain loop below is the single consumer of the AI stream, so it
    // completes (and onFinish persists) even if the client disconnects.
    const encoder = new TextEncoder()
    // start() runs synchronously during construction, so the definite
    // assignment is safe.
    let controllerRef!: ReadableStreamDefaultController<Uint8Array>
    let clientGone = false

    const clientStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller
      },
      cancel() {
        clientGone = true
      }
    })

    const drained = (async () => {
      try {
        for await (const delta of handle.result.textStream) {
          if (!clientGone) {
            try {
              controllerRef.enqueue(encoder.encode(delta))
            } catch {
              clientGone = true
            }
          }
        }
      } finally {
        if (!clientGone) {
          try {
            controllerRef.close()
          } catch {
            // client already gone
          }
        }
      }
    })()

    after(async () => {
      try {
        await drained
        await handle.persisted
      } catch (error) {
        console.error('[EDITION-GENERATE] Generation did not persist:', error)
      } finally {
        await releaseGenerationLock(supabase, anchorDate, holder)
      }
    })

    return new Response(clientStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'x-generation-id': handle.generationId,
        'x-generated-at': handle.generatedAt,
        'x-anchor-date': anchorDate
      }
    })
  } catch (error) {
    await releaseGenerationLock(supabase, anchorDate, holder)
    console.error('[EDITION-GENERATE] Route error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Edition generation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
