import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PeopleApp } from './PeopleApp'

export const metadata: Metadata = {
  title: 'Netzwerk & Export · Financial Retarded Times',
  description: 'Netzwerk, Aktivität und KI-fertiger JSON-Export der gespeicherten Chatgeschichte eines TradingView-Nutzers.'
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <PeopleApp />
    </Suspense>
  )
}
