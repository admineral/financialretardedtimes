'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { ActivityProvider } from './_hooks/useActivity'
import { ArchiveShell } from './_components/ArchiveShell'
import { UserSelectionScreen } from './_components/UserSelectionScreen'
import { LoadingScreen } from './_components/shared/LoadingScreen'
import { saveRecentUser } from './_lib/recent-users'

function ChatArchiveContent() {
  const searchParams = useSearchParams()
  const room = searchParams.get('room')
  const username = searchParams.get('username')

  useEffect(() => {
    if (room && username) saveRecentUser(username, room)
  }, [room, username])

  if (!room || !username) {
    return <UserSelectionScreen />
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-[1400px] px-4 py-8">
        <ActivityProvider key={`${room}:${username}`} room={room} username={username}>
          <ArchiveShell username={username} />
        </ActivityProvider>
      </div>
    </div>
  )
}

export default function ChatArchivePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ChatArchiveContent />
    </Suspense>
  )
}
