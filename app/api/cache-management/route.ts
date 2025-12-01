import { NextResponse } from 'next/server'

// This API is no longer needed since we're using localStorage only
// Cache management is done client-side
export async function GET() {
  return NextResponse.json(
    { error: 'Server-side cache has been removed. Use localStorage management on the client.' },
    { status: 410 } // Gone
  )
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Server-side cache has been removed. Use localStorage management on the client.' },
    { status: 410 } // Gone
  )
}
