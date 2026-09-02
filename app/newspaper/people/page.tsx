import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PeopleApp } from './PeopleApp'

export const metadata: Metadata = {
  title: 'Netzwerk · Financial Retarded Times',
  description: 'Aktivität, Tagesnachrichten und Zitat-Netzwerk eines TradingView-Nutzers.'
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <PeopleApp />
    </Suspense>
  )
}
