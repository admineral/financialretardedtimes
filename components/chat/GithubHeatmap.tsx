'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO, subDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { ARCHIVE_WINDOW_DAYS } from '@/lib/tv-chat/types'
import type { ActivityDay, ActivityMessage } from '@/lib/tv-chat/types'

interface GithubHeatmapProps {
  days: ActivityDay[]
  selectedDate: string | null
  onDateSelect: (date: string) => void
  /** Optional: messages to preview in the hover card for a day. Without it the card shows counts only. */
  loadDay?: (date: string) => Promise<ActivityMessage[]>
}

interface Cell {
  date: string
  count: number
  cached: boolean
  inArchiveWindow: boolean
}

const INTENSITY = [
  'bg-muted/25 border-border/20',
  'bg-emerald-950/70 border-emerald-900/50',
  'bg-emerald-800/80 border-emerald-700/50',
  'bg-emerald-600 border-emerald-500/60',
  'bg-emerald-400 border-emerald-300/50'
]

function level(count: number, max: number) {
  if (count <= 0) return 0
  const ratio = count / Math.max(max, 1)
  if (ratio <= 0.2) return 1
  if (ratio <= 0.4) return 2
  if (ratio <= 0.7) return 3
  return 4
}

function toDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function buildYear(year: number, byDate: Map<string, number>, windowFrom: string) {
  const today = new Date()
  const yearStart = new Date(year, 0, 1)
  const yearEnd = year === today.getFullYear() ? today : new Date(year, 11, 31)

  const cursor = new Date(yearStart)
  const satOffset = (cursor.getDay() + 1) % 7
  cursor.setDate(cursor.getDate() - satOffset)

  const weeks: Array<Array<Cell | null>> = []
  const monthLabels: string[] = []
  let lastMonth = -1

  while (cursor <= yearEnd || weeks.length < 53) {
    const week: Array<Cell | null> = []
    for (let i = 0; i < 7; i++) {
      const key = toDateKey(cursor)
      const inYear = cursor.getFullYear() === year && cursor <= yearEnd && cursor >= yearStart
      if (i === 0) {
        const month = cursor.getMonth()
        if (inYear && month !== lastMonth) {
          monthLabels.push(format(cursor, 'MMM', { locale: de }))
          lastMonth = month
        } else {
          monthLabels.push('')
        }
      }
      if (inYear) {
        week.push({
          date: key,
          count: byDate.get(key) || 0,
          cached: byDate.has(key),
          inArchiveWindow: key >= windowFrom
        })
      } else {
        week.push(null)
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
    if (cursor > yearEnd && weeks.length >= 52) break
    if (weeks.length >= 54) break
  }

  return { weeks, monthLabels }
}

function formatMessageTime(time: string) {
  const asNumber = Number(time)
  const date = Number.isFinite(asNumber) && asNumber > 1e9
    ? new Date(asNumber * 1000)
    : new Date(time)
  if (Number.isNaN(date.getTime())) return time
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export function GithubHeatmap({
  days,
  selectedDate,
  onDateSelect,
  loadDay
}: GithubHeatmapProps) {
  const [hovered, setHovered] = useState<{
    date: string
    count: number
    cached: boolean
    x: number
    y: number
  } | null>(null)
  const [comments, setComments] = useState<ActivityMessage[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const cacheRef = useRef(new Map<string, ActivityMessage[]>())
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const byDate = useMemo(() => new Map(days.map(d => [d.date, d.count])), [days])
  const max = useMemo(() => Math.max(...days.map(d => d.count), 1), [days])
  const windowFrom = format(subDays(new Date(), ARCHIVE_WINDOW_DAYS - 1), 'yyyy-MM-dd')

  const years = useMemo(() => {
    const present = new Set(days.map(d => Number(d.date.slice(0, 4))))
    const current = new Date().getFullYear()
    const minYear = days.length > 0 ? Math.min(...present) : current
    const list: number[] = []
    for (let y = current; y >= Math.min(minYear, 2017); y--) list.push(y)
    if (list.length === 0) list.push(current)
    return list
  }, [days])

  useEffect(() => {
    if (!hovered || hovered.count === 0 || !loadDay) {
      setComments([])
      setCommentsLoading(false)
      return
    }

    const cached = cacheRef.current.get(hovered.date)
    if (cached) {
      setComments(cached)
      setCommentsLoading(false)
      return
    }

    let cancelled = false
    setCommentsLoading(true)
    const timer = setTimeout(async () => {
      try {
        const messages = await loadDay(hovered.date)
        cacheRef.current.set(hovered.date, messages)
        if (!cancelled) setComments(messages)
      } catch {
        if (!cancelled) setComments([])
      } finally {
        if (!cancelled) setCommentsLoading(false)
      }
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [hovered, loadDay])

  return (
    <div className="space-y-5">
      {years.map(year => {
        const { weeks, monthLabels } = buildYear(year, byDate, windowFrom)
        return (
          <div key={year} className="overflow-x-auto">
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-sm font-semibold tabular-nums w-12">{year}</span>
              <span className="text-[10px] text-muted-foreground">
                {days.filter(d => d.date.startsWith(String(year)) && d.count > 0).length} aktive Tage
              </span>
            </div>
            <div className="inline-block min-w-full">
              <div className="flex gap-[3px] mb-1 pl-6">
                {monthLabels.map((label, i) => (
                  <span
                    key={`${year}-m-${i}`}
                    className="text-[9px] text-muted-foreground/70 flex-shrink-0"
                    style={{ width: 11 }}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex gap-[3px]">
                <div className="flex flex-col gap-[3px] pr-1 w-5 flex-shrink-0">
                  {['Sa', 'So', 'Mo', 'Di', 'Mi', 'Do', 'Fr'].map((label, i) => (
                    <span
                      key={label}
                      className={cn(
                        'text-[8px] leading-[11px] h-[11px] text-muted-foreground/50',
                        i % 2 === 1 && 'opacity-0'
                      )}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map((cell, di) => {
                      if (!cell) return <div key={di} className="w-[11px] h-[11px]" />
                      const selected = selectedDate === cell.date
                      return (
                        <button
                          key={cell.date}
                          type="button"
                          onClick={() => onDateSelect(cell.date)}
                          onMouseEnter={e => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setHovered({
                              date: cell.date,
                              count: cell.count,
                              cached: cell.cached,
                              x: rect.left + rect.width / 2,
                              y: rect.top
                            })
                          }}
                          onMouseLeave={() => setHovered(null)}
                          className={cn(
                            'w-[11px] h-[11px] rounded-[2px] border transition-all',
                            cell.cached
                              ? INTENSITY[level(cell.count, max)]
                              : 'bg-transparent border-dashed border-border/40',
                            !cell.inArchiveWindow && cell.cached && 'ring-[0.5px] ring-amber-400/40',
                            selected && 'ring-2 ring-sky-400 ring-offset-1 ring-offset-background scale-125 z-10'
                          )}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span>Weniger</span>
        {INTENSITY.map((cls, i) => (
          <div key={i} className={cn('w-3 h-3 rounded-[2px] border', cls)} />
        ))}
        <span>Mehr</span>
        <span className="ml-2 inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-[2px] border border-dashed border-border/40" />
          nicht geladen
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-[2px] bg-emerald-800/80 border border-emerald-700/50 ring-[0.5px] ring-amber-400/40" />
          älter als 365 Tage
        </span>
      </div>

      {mounted && hovered && createPortal(
        <div
          className="fixed z-[9999] w-80 max-w-[90vw] rounded-lg border bg-popover text-popover-foreground shadow-xl pointer-events-none"
          style={{
            left: hovered.x,
            top: hovered.y - 8,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="px-3 py-2 border-b border-border/60">
            <div className="text-xs font-medium">
              {format(parseISO(hovered.date), 'EEEE, d. MMMM yyyy', { locale: de })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {hovered.count.toLocaleString('de-DE')} {hovered.count === 1 ? 'Nachricht' : 'Nachrichten'}
              {!hovered.cached && ' · noch nicht im Cache'}
              {hovered.date < windowFrom && hovered.cached && ' · jenseits der 365-Tage-Ansicht'}
            </div>
          </div>
          <div className="px-3 py-2 max-h-48 overflow-hidden space-y-1.5">
            {commentsLoading && (
              <div className="text-[11px] text-muted-foreground">Lade Kommentare…</div>
            )}
            {!commentsLoading && comments.length === 0 && hovered.count > 0 && (
              <div className="text-[11px] text-muted-foreground">Keine gespeicherten Kommentare für diesen Tag.</div>
            )}
            {!commentsLoading && comments.slice(0, 6).map(msg => (
              <div key={msg.id} className="text-[11px] leading-snug">
                <span className="text-muted-foreground mr-1.5 tabular-nums">
                  {formatMessageTime(msg.time)}
                </span>
                <span className="line-clamp-2">{msg.text}</span>
              </div>
            ))}
            {comments.length > 6 && (
              <div className="text-[10px] text-muted-foreground">+{comments.length - 6} weitere</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}