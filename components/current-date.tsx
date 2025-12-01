'use client'

import { useEffect, useState } from 'react'

export function CurrentDate() {
  const [date, setDate] = useState<string | null>(null)
  
  useEffect(() => {
    setDate(new Date().toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }))
  }, [])
  
  // Use suppressHydrationWarning to prevent mismatch warnings
  // The date will be empty on server and filled on client
  return (
    <span className="font-body" suppressHydrationWarning>
      {date ?? '\u00A0'} {/* Non-breaking space to maintain layout */}
    </span>
  )
}
