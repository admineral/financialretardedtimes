/**
 * GET /newspaper/people/api/network?username=&room=
 *
 * Who talks with whom around one user, read from tables the chat-sync cron
 * already fills: `tv_chat_quotes` (quoter → quoted) and `tv_chat_messages`
 * (`@mentions` in text). Two hops: the user's direct partners, plus quotes
 * among those partners. Read-only, no new tables, no defaults for people.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mergeEdges, type RawEdge } from '@/lib/tv-chat/graph'
import { DEFAULT_ROOM } from '@/lib/tv-chat/types'

const USERNAME_RE = /^[A-Za-z0-9_.-]{1,40}$/
const ROOM_RE = /^[a-z0-9_]{1,40}$/i
const QUOTE_LIMIT = 5000
const MENTION_LIMIT = 2000
const HOP1_FANOUT = 60

interface QuoteRow {
  quoter_username: string | null
  quoted_username: string | null
}

interface MessageRow {
  username: string | null
  text: string | null
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, char => `\\${char}`)
}

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username')?.trim() ?? ''
  const room = request.nextUrl.searchParams.get('room')?.trim() || DEFAULT_ROOM

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 })
  }
  if (!ROOM_RE.test(room)) {
    return NextResponse.json({ error: 'Invalid room' }, { status: 400 })
  }

  const supabase = await createClient()
  const raw: RawEdge[] = []
  const centerKey = username.toLowerCase()
  let canonical = username
  const notes: string[] = []

  // 1) Quotes to and from the user.
  const { data: quoteRows, error: quoteError } = await supabase
    .from('tv_chat_quotes')
    .select('quoter_username, quoted_username')
    .eq('room_id', room)
    .or(`quoter_username.ilike.${escapeLike(username)},quoted_username.ilike.${escapeLike(username)}`)
    .order('message_time', { ascending: false })
    .limit(QUOTE_LIMIT)

  if (quoteError) {
    notes.push('quotes-unavailable')
  } else {
    for (const row of (quoteRows ?? []) as QuoteRow[]) {
      if (!row.quoter_username || !row.quoted_username) continue
      if (row.quoter_username.toLowerCase() === centerKey) canonical = row.quoter_username
      raw.push({ from: row.quoter_username, to: row.quoted_username, kind: 'quote', weight: 1 })
    }
  }

  // 2) Incoming @mentions from the live room.
  const { data: mentionRows, error: mentionError } = await supabase
    .from('tv_chat_messages')
    .select('username, text')
    .eq('room_id', room)
    .ilike('text', `%@${escapeLike(username)}%`)
    .order('time', { ascending: false })
    .limit(MENTION_LIMIT)

  if (mentionError) {
    notes.push('mentions-unavailable')
  } else {
    const exact = new RegExp(`@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'i')
    for (const row of (mentionRows ?? []) as MessageRow[]) {
      if (!row.username || !row.text || !exact.test(row.text)) continue
      raw.push({ from: row.username, to: canonical, kind: 'mention', weight: 1 })
    }
  }

  // 3) Quotes among the user's direct partners (second hop), bounded.
  const partnerWeight = new Map<string, { name: string; weight: number }>()
  for (const edge of raw) {
    for (const name of [edge.from, edge.to]) {
      const key = name.toLowerCase()
      if (key === centerKey) continue
      const entry = partnerWeight.get(key) ?? { name, weight: 0 }
      entry.weight += edge.weight
      partnerWeight.set(key, entry)
    }
  }
  const partners = Array.from(partnerWeight.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, HOP1_FANOUT)
    .map(entry => entry.name)

  if (partners.length > 1 && !quoteError) {
    const { data: ringRows } = await supabase
      .from('tv_chat_quotes')
      .select('quoter_username, quoted_username')
      .eq('room_id', room)
      .in('quoter_username', partners)
      .in('quoted_username', partners)
      .limit(QUOTE_LIMIT)

    for (const row of (ringRows ?? []) as QuoteRow[]) {
      if (!row.quoter_username || !row.quoted_username) continue
      raw.push({ from: row.quoter_username, to: row.quoted_username, kind: 'quote', weight: 1 })
    }
  }

  const edges = mergeEdges(raw)
  const users = Array.from(new Set(edges.flatMap(edge => [edge.from, edge.to])))

  return NextResponse.json(
    { username: canonical, room, edges, users, notes },
    { headers: { 'Cache-Control': 'private, max-age=60' } }
  )
}
