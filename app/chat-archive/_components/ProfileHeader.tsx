'use client'

import { CalendarIcon, ExternalLinkIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivity } from '../_hooks/useActivity'
import { useProfile } from '../_hooks/useProfile'
import { formatCount, formatMonthYear } from '../_lib/format'
import { ActivityClock } from './activity/ActivityClock'
import { HourlyBars } from './activity/HourlyBars'

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}

export function ProfileHeader({ username }: { username: string }) {
  const { patterns, activities, isLoading } = useActivity()
  const { profile, isLoading: profileLoading } = useProfile(username)

  const avatarSrc = profile?.avatar || `https://s3.tradingview.com/userpics/${username.toLowerCase()}_200.png`
  const avatarFallback = `https://s3.tradingview.com/userpics/${username.toLowerCase()}_50.png`
  const firstActivityDate = activities.length > 0 ? activities[activities.length - 1]?.date : null
  const joined = formatMonthYear(profile?.joinDate ?? firstActivityDate)

  return (
    <div className="w-full border-b border-border pb-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="mx-auto flex-shrink-0 sm:mx-0">
          <ActivityClock
            hourCounts={patterns?.hourCounts}
            totalMessages={patterns?.totalMessages ?? 0}
            size={180}
            avatar={{ src: avatarSrc, fallbackSrc: avatarFallback, alt: username }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <a
            href={`https://de.tradingview.com/u/${username}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 text-3xl font-bold transition-colors hover:text-primary sm:text-4xl"
          >
            <span className="truncate">{username}</span>
            <ExternalLinkIcon className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </a>

          {profileLoading ? (
            <div className="mt-4 flex flex-wrap gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
              <ProfileStat label="Followers" value={formatCount(profile?.followers)} />
              <ProfileStat label="Following" value={formatCount(profile?.following)} />
              <ProfileStat label="Ideas" value={formatCount(profile?.ideas)} />
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            <span>Joined {joined}</span>
          </div>
        </div>

        <div className="w-full lg:w-96">
          <HourlyBars
            hourCounts={patterns?.hourCounts}
            totalMessages={patterns?.totalMessages ?? 0}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  )
}
