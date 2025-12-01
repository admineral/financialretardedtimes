'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLinkIcon, HeartIcon, TrendingUpIcon } from 'lucide-react'
import Image from 'next/image'

interface ChartData {
  pk: number
  image_url: string
  user_id: number
  name: string
  symbol: string
  published_chart_url: string
  is_video: boolean
  video_cam: boolean
  script_type: string
}

interface ChartLikes {
  voted: boolean
  count: number
}

interface ChartPreviewProps {
  chartData: ChartData
  likes?: ChartLikes
  className?: string
}

export function ChartPreview({ chartData, likes, className = '' }: ChartPreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  const directImageUrl = `https://s3.tradingview.com/snapshots/${chartData.image_url}.png`
  // Use image proxy to avoid CORS issues on Vercel
  const chartImageUrl = `/api/image-proxy?url=${encodeURIComponent(directImageUrl)}`
  const chartUrl = `https://de.tradingview.com${chartData.published_chart_url}`

  const handleImageLoad = () => {
    setImageLoaded(true)
  }

  const handleImageError = () => {
    setImageError(true)
  }

  const handleChartClick = () => {
    window.open(chartUrl, '_blank', 'noopener,noreferrer')
  }

  if (imageError) {
    return (
      <Card className={`max-w-sm border-l-4 border-l-blue-500 ${className}`}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUpIcon className="h-4 w-4 text-blue-500" />
            <span className="font-medium text-sm">TradingView Chart</span>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-sm">{chartData.name}</p>
            <p className="text-xs text-muted-foreground">{chartData.symbol}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleChartClick}
              className="w-full"
            >
              <ExternalLinkIcon className="h-3 w-3 mr-1" />
              View Chart
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`max-w-sm border-l-4 border-l-blue-500 hover:shadow-md transition-shadow cursor-pointer ${className}`}>
      <CardContent className="p-0">
        <div className="relative">
          {!imageLoaded && (
            <div className="aspect-video bg-muted animate-pulse rounded-t-lg flex items-center justify-center">
              <TrendingUpIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <Image
            src={chartImageUrl}
            alt={chartData.name}
            width={400}
            height={225} // 16:9 aspect ratio
            className={`w-full aspect-video object-cover rounded-t-lg transition-opacity ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            onClick={handleChartClick}
          />
          {chartData.is_video && (
            <div className="absolute top-2 right-2">
              <Badge variant="secondary" className="text-xs">
                VIDEO
              </Badge>
            </div>
          )}
        </div>
        
        <div className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{chartData.name}</p>
              <p className="text-xs text-muted-foreground">{chartData.symbol}</p>
            </div>
            {likes && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <HeartIcon className={`h-3 w-3 ${likes.voted ? 'fill-red-500 text-red-500' : ''}`} />
                <span>{likes.count}</span>
              </div>
            )}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleChartClick}
            className="w-full"
          >
            <ExternalLinkIcon className="h-3 w-3 mr-1" />
            View on TradingView
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}



