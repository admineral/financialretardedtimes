import { NextResponse } from 'next/server'

// This API is no longer needed since we're using localStorage only
// Analysis is done client-side in the activity context
export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Analysis is now done client-side.' },
    { status: 410 } // Gone
  )
}

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Analysis is now done client-side.' },
    { status: 410 } // Gone
  )
}
