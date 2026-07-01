'use client'

import { useState } from 'react'
import { addDays, subDays } from 'date-fns'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatDateLabel } from '../../_lib/format'

interface ChatDateNavProps {
  date: Date
  onChange: (date: Date) => void
}

export function ChatDateNav({ date, onChange }: ChatDateNavProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onChange(new Date())}>
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={() => onChange(subDays(new Date(), 1))}>
          Yesterday
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onChange(subDays(date, 1))} aria-label="Previous day">
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('min-w-[140px] justify-start text-left font-normal')}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formatDateLabel(date)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(next) => {
                if (next) {
                  onChange(next)
                  setCalendarOpen(false)
                }
              }}
              disabled={{ after: new Date() }}
            />
          </PopoverContent>
        </Popover>

        <Button variant="outline" size="sm" onClick={() => onChange(addDays(date, 1))} aria-label="Next day">
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
