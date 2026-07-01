'use client'

import Image from 'next/image'
import {
  ClockIcon,
  CrownIcon,
  ExternalLinkIcon,
  LightbulbIcon,
  MessageCircleIcon,
  ZapIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { imageProxySrc } from '../../_lib/api'
import type { Idea } from '../../_lib/types'

export function IdeaCard({ idea }: { idea: Idea }) {
  const image = imageProxySrc(idea.imageUrl)
  const openIdea = () => idea.url && window.open(idea.url, '_blank')

  return (
    <Card className="flex h-full flex-col overflow-hidden pt-0 transition-shadow hover:shadow-lg">
      <CardContent className="flex flex-1 flex-col p-0">
        <div className="relative h-44 overflow-hidden bg-muted">
          {image ? (
            <Image
              src={image}
              alt={idea.title ?? 'Chart preview'}
              fill
              unoptimized
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-yellow-500/20 to-yellow-500/5">
              <LightbulbIcon className="h-10 w-10 text-yellow-500" />
            </div>
          )}

          <div className="absolute left-3 top-3 flex gap-2">
            {idea.isEditorsPick && (
              <Badge className="bg-yellow-500 text-xs text-white">
                <CrownIcon className="mr-1 h-3 w-3" />
                Editor&apos;s Pick
              </Badge>
            )}
            {idea.strategy && (
              <Badge variant={idea.strategy === 'Long' ? 'default' : 'destructive'} className="text-xs">
                {idea.strategy}
              </Badge>
            )}
          </div>

          {idea.symbol && (
            <div className="absolute right-3 top-3">
              <Badge variant="secondary" className="text-xs">
                {idea.symbol}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="mb-2 flex items-start gap-2">
            <h4
              className="line-clamp-2 flex-1 cursor-pointer text-base font-semibold leading-tight hover:text-primary"
              onClick={openIdea}
            >
              {idea.title || 'Untitled Idea'}
            </h4>
            {idea.url && (
              <button
                onClick={openIdea}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
                aria-label="Open idea"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {idea.content && (
            <p className="mb-4 line-clamp-3 flex-1 text-sm text-muted-foreground">{idea.content}</p>
          )}

          <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
            {idea.publishedAt && (
              <div className="flex items-center gap-1">
                <ClockIcon className="h-3 w-3" />
                {new Date(idea.publishedAt).toLocaleDateString()}
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <MessageCircleIcon className="h-3 w-3" />
                {idea.comments || 0}
              </div>
              <div className="flex items-center gap-1">
                <ZapIcon className="h-3 w-3" />
                {idea.boosts || 0}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
