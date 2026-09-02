'use client'

import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resolveAvatar } from '@/lib/tv-chat/client'

export function ProfilePic({
  username,
  src,
  size = 'sm'
}: {
  username: string
  src: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const [failed, setFailed] = useState(false)
  const resolved = resolveAvatar(src, username, size === 'sm' ? 50 : 200)

  useEffect(() => {
    setFailed(false)
  }, [resolved])

  const dimension = size === 'lg' ? 'h-16 w-16' : size === 'md' ? 'h-11 w-11' : 'h-8 w-8'

  return (
    <Avatar className={`${dimension} border border-primary/20`}>
      {!failed && (
        <AvatarImage src={resolved} alt={username} className="object-cover" onError={() => setFailed(true)} />
      )}
      <AvatarFallback className="text-[10px] font-semibold bg-muted text-muted-foreground uppercase">
        {username.slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  )
}
