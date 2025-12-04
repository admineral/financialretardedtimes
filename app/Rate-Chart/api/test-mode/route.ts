/**
 * Test Mode API
 * Returns whether test mode is enabled based on server-side environment variable
 * This cannot be bypassed from the browser
 */

import { NextResponse } from 'next/server'

export async function GET() {
  // Check server-side environment variable
  const isTestModeEnabled = process.env.TEST_MODE === 'true'
  
  return NextResponse.json({
    enabled: isTestModeEnabled
  })
}

