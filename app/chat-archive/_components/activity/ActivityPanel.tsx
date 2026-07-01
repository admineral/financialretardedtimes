'use client'

import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActivity } from '../../_hooks/useActivity'
import { ACTIVITY_WINDOWS } from '../../_lib/rooms'
import type { ActivityWindow } from '../../_lib/types'
import { formatDateLabel } from '../../_lib/format'
import { ActivityStatsRow } from './ActivityStatsRow'
import { ContributionCalendar } from './ContributionCalendar'
import { ChatPanel } from '../chat/ChatPanel'

export function ActivityPanel() {
  const {
    room,
    username,
    windowDays,
    activities,
    patterns,
    isLoading,
    selectedDate,
    setSelectedDate,
    setWindowDays,
  } = useActivity()

  return (
    <div className="space-y-6">
      <ActivityStatsRow activities={activities} patterns={patterns} />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Activity calendar</CardTitle>
            <Select
              value={String(windowDays)}
              onValueChange={(value) => setWindowDays(Number(value) as ActivityWindow)}
            >
              <SelectTrigger className="w-full sm:w-[160px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={String(w.value)}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ContributionCalendar
            activities={activities}
            windowDays={windowDays}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            isLoading={isLoading}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {formatDateLabel(selectedDate)} — click any day to view its chat below.
          </p>
        </CardContent>
      </Card>

      <ChatPanel
        room={room}
        username={username}
        date={format(selectedDate, 'yyyy-MM-dd')}
        onDateChange={(next) => setSelectedDate(new Date(next))}
      />
    </div>
  )
}
