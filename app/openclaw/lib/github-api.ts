const GITHUB_API_VERSION = '2022-11-28'

export function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'OpenClawToday-Newspaper',
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

export async function assertGitHubResponseOk(response: Response, context: string): Promise<void> {
  if (response.ok) return

  const remaining = response.headers.get('x-ratelimit-remaining')
  const resetTime = response.headers.get('x-ratelimit-reset')
  const resetAt = resetTime ? new Date(Number(resetTime) * 1000).toISOString() : null
  const githubMessage = await readGitHubErrorMessage(response)

  let message = `GitHub API error: ${response.status}`
  if (response.statusText) {
    message += ` ${response.statusText}`
  }
  message += ` while ${context}`

  if (githubMessage) {
    message += ` - ${githubMessage}`
  }

  if (response.status === 403 && remaining === '0') {
    message += resetAt ? ` (rate limit resets at ${resetAt})` : ' (rate limit exceeded)'
  }

  throw new Error(message)
}

export function isGitHubRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return message.includes('github api error: 403') && message.includes('rate limit')
}

async function readGitHubErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = await response.clone().json() as { message?: unknown }
    return typeof body.message === 'string' ? body.message : null
  } catch {
    return null
  }
}
