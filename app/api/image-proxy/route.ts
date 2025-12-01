import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const imageUrl = searchParams.get('url')
  
  if (!imageUrl) {
    return NextResponse.json(
      { error: 'url parameter is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  // Validate that it's a TradingView S3 URL for security
  if (!imageUrl.includes('s3.tradingview.com/')) {
    return NextResponse.json(
      { error: 'Only TradingView S3 URLs are supported' },
      { status: 400, headers: corsHeaders }
    )
  }

  console.log(`🖼️ [IMAGE PROXY] Fetching image: ${imageUrl}`)

  try {
    // Fetch the image from TradingView S3
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.tradingview.com/',
      },
    })

    if (!response.ok) {
      console.error(`🖼️ [IMAGE PROXY] Failed to fetch image: ${response.status} ${response.statusText}`)
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status, headers: corsHeaders }
      )
    }

    // Get the image data
    const imageBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/png'

    console.log(`🖼️ [IMAGE PROXY] Successfully fetched image (${imageBuffer.byteLength} bytes)`)

    // Return the image with appropriate headers
    return new NextResponse(imageBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800', // 24 hours, 7 days stale
        'Content-Length': imageBuffer.byteLength.toString(),
      },
    })

  } catch (error) {
    console.error(`🖼️ [IMAGE PROXY] Error fetching image:`, error)
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch image', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500, headers: corsHeaders }
    )
  }
}

