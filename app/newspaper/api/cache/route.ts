/**
 * route.ts (newspaper cache API — flat archive preview)
 *
 * Read-only endpoint used by the archive timeline (NewspaperTimeline) to
 * render compact previews of past issues. Returns a flat
 * UnifiedNewspaperData-shaped payload for every stored format:
 *
 * 1. Edition v3 rows → derived preview (coverStory → featuredArticle,
 *    first article → secondaryArticle, shortNews → moreArticles)
 * 2. Modular v1 rows → their articleDigest data
 * 3. Ancient flat rows → returned as-is
 *
 * ENDPOINT: GET /newspaper/api/cache?date=YYYY-MM-DD&dayRange=1
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cacheLogger as log } from '@/lib/logger'
import { isNewspaperEdition, type ArticleBlock, type CoverStoryBlock, type NewspaperEdition } from '../../edition/types'

interface FlatArticlePreview {
  author: string
  category: string
  headline: string
  summary: string
  contributors: string[]
}

interface FlatPreview {
  trendingTopics: string[]
  topContributors: Array<{ username: string; initial: string; avatar?: string }>
  featuredArticle: FlatArticlePreview | null
  secondaryArticle: FlatArticlePreview | null
  events: Array<{ type: string; title: string; summary: string }>
  shortNews: Array<{ category: string; headline: string; text: string }>
  moreArticles: Array<{ category: string; headline: string }>
}

function isModularIssue(value: unknown): value is { modules: { articleDigest?: { data?: unknown } } } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'meta' in value &&
    'modules' in value &&
    'resources' in value
  )
}

function articlePreview(block: CoverStoryBlock | ArticleBlock): FlatArticlePreview {
  return {
    author: block.author,
    category: block.kicker,
    headline: block.headline,
    summary: block.paragraphs?.[0] ?? '',
    contributors: block.contributors ?? []
  }
}

/** Derives the flat archive preview from a v3 edition. */
function previewFromEdition(edition: NewspaperEdition): FlatPreview {
  const blocks = edition.content.blocks
  const cover = blocks.find((block): block is CoverStoryBlock => block.type === 'coverStory') ?? null
  const articles = blocks.filter(
    (block): block is ArticleBlock => block.type === 'article' && block.variant !== 'shortNews'
  )
  const shortNews = blocks.filter(
    (block): block is ArticleBlock => block.type === 'article' && block.variant === 'shortNews'
  )

  return {
    trendingTopics: edition.shared.trendingTopics,
    topContributors: edition.shared.topContributors,
    featuredArticle: cover ? articlePreview(cover) : articles[0] ? articlePreview(articles[0]) : null,
    secondaryArticle: cover && articles[0] ? articlePreview(articles[0]) : articles[1] ? articlePreview(articles[1]) : null,
    events: edition.content.timeline.events.slice(0, 3).map(event => ({
      type: event.type,
      title: event.title,
      summary: event.description || event.quote || ''
    })),
    shortNews: shortNews.slice(0, 3).map(article => ({
      category: article.kicker,
      headline: article.headline,
      text: article.paragraphs?.[0] ?? ''
    })),
    moreArticles: [...articles.slice(cover ? 1 : 2), ...shortNews].slice(0, 4).map(article => ({
      category: article.kicker,
      headline: article.headline
    }))
  }
}

function toFlatData(data: unknown): unknown {
  if (isNewspaperEdition(data)) return previewFromEdition(data)
  if (isModularIssue(data)) return data.modules.articleDigest?.data ?? null
  return data
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')
  const dayRangeParam = request.nextUrl.searchParams.get('dayRange')
  const dayRange = dayRangeParam ? parseInt(dayRangeParam, 10) : 1

  if (!date) {
    return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 })
  }
  if (![1, 3, 7].includes(dayRange)) {
    return NextResponse.json({ error: 'Invalid dayRange. Must be 1, 3, or 7' }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    const { data: cache, error } = await supabase
      .from('newspaper_cache')
      .select('data, message_count, unique_users, updated_at, day_range')
      .eq('cache_date', date)
      .eq('day_range', dayRange)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'No cache found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({
      data: toFlatData(cache.data),
      messageCount: cache.message_count,
      uniqueUsers: cache.unique_users,
      updatedAt: cache.updated_at,
      dayRange: cache.day_range || 1
    })
  } catch (error) {
    log.error('Cache fetch failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
