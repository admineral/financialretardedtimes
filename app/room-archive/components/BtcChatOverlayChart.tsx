'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import type { BtcOverlayPoint } from '../hooks/use-btc-overlay'

const chartConfig = {
  messages: { label: 'Chat Msgs', color: 'hsl(var(--primary))' },
  btcClose: { label: 'BTC Close', color: 'hsl(45 93% 47%)' }
} satisfies ChartConfig

interface BtcChatOverlayChartProps {
  data: BtcOverlayPoint[]
  btcSpot?: number | null
  isLoading?: boolean
  className?: string
}

export function BtcChatOverlayChart({
  data,
  btcSpot,
  isLoading,
  className
}: BtcChatOverlayChartProps) {
  if (isLoading && data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground animate-pulse">
        Lade BTC Overlay…
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
        Keine Overlay-Daten
      </div>
    )
  }

  const hasBtc = data.some(d => d.btcClose != null)

  return (
    <div className={className}>
      {btcSpot != null && (
        <p className="text-[10px] font-mono text-[#D4AF37] mb-2">
          BTC Spot ${btcSpot.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </p>
      )}
      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        <ComposedChart data={data} margin={{ top: 8, right: hasBtc ? 48 : 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" />
          <YAxis
            yAxisId="msgs"
            tickLine={false}
            axisLine={false}
            width={32}
            fontSize={10}
            tickFormatter={v => `${v}`}
          />
          {hasBtc && (
            <YAxis
              yAxisId="btc"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={52}
              fontSize={9}
              tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}k`}
              domain={['auto', 'auto']}
            />
          )}
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            yAxisId="msgs"
            dataKey="messages"
            fill="var(--color-messages)"
            radius={[2, 2, 0, 0]}
            maxBarSize={24}
            opacity={0.85}
          />
          {hasBtc && (
            <Line
              yAxisId="btc"
              type="monotone"
              dataKey="btcClose"
              stroke="var(--color-btcClose)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}
