/**
 * Browser helpers shared by the people page: avatar URLs and username
 * normalisation. TradingView's public chat history is gone, so nothing
 * here fetches from TradingView any more; data comes from our archive.
 */

export function resolveAvatar(raw: string | null | undefined, username: string, size: 50 | 200 = 50): string {
  let url = (raw || '').trim()
  if (url.startsWith('//')) url = `https:${url}`
  if (!url) url = `https://s3.tradingview.com/userpics/${username.toLowerCase()}_${size}.png`
  if (url.includes('s3.tradingview.com/')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }
  return url
}

/** Only letters, digits, `_`, `-`, `.`: what TradingView allows in handles. */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40)
}
