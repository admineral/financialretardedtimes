import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ExportApp } from './ExportApp'

export const metadata: Metadata = {
  title: 'Export · Financial Retarded Times',
  description: 'Chat-Verlauf eines TradingView-Nutzers als Markdown oder JSON exportieren.'
}

export default function ExportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ExportApp />
    </Suspense>
  )
}
