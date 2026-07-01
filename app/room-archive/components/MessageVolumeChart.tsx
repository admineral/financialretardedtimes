'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'

export interface VolumePoint {
  date: string
  label: string
  messages: number
  users?: number
}

const chartConfig = {
  messages: { label: 'Nachrichten', color: 'hsl(var(--primary))' },
  users: { label: 'User', color: 'hsl(142 76% 36%)' }
} satisfies ChartConfig

interface MessageVolumeChartProps {
  data: VolumePoint[]
  className?: string
  heightClass?: string
  showUsers?: boolean
  isLoading?: boolean
}

export function MessageVolumeChart({
  data,
  className,
  heightClass = 'h-[220px]',
  showUsers,
  isLoading
}: MessageVolumeChartProps) {
  if (isLoading) {
    return (
      <div className={cn('flex items-end gap-1 animate-pulse px-1', heightClass, className)}>
        {[45, 70, 30, 85, 55, 40, 65, 50, 75, 35, 60, 48].map((h, i) => (
          <div key={i} className="flex-1 bg-muted/50 rounded-t-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center text-xs text-muted-foreground', heightClass, className)}>
        Keine Daten
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className={cn('w-full', heightClass, className)}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="18%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={24}
          fontSize={11}
        />
        <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="messages" fill="var(--color-messages)" radius={[2, 2, 0, 0]} maxBarSize={28} />
        {showUsers && (
          <Bar dataKey="users" fill="var(--color-users)" radius={[2, 2, 0, 0]} maxBarSize={28} />
        )}
      </BarChart>
    </ChartContainer>
  )
}
