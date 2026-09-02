export function tvChatOrigin(room: string) {
  return /_de_DE$/i.test(room) ? 'https://de.tradingview.com' : 'https://www.tradingview.com'
}

export function tvHistoryUrl(room: string, date: string, username: string, pageIndex = 1) {
  const origin = tvChatOrigin(room)
  return `${origin}/chat/history/?room=${encodeURIComponent(room)}&date=${date}&timefrom=00%3A00&timeto=00%3A00&usernames=${encodeURIComponent(username)}&order=asc&tzoffset=-120&msgid=&pageindex=${pageIndex}`
}

export function tvHistoryHeaders(room: string) {
  const origin = tvChatOrigin(room)
  const german = origin.includes('de.tradingview.com')
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': german ? 'de-DE,de;q=0.9,en;q=0.8' : 'en-US,en;q=0.9',
    Referer: `${origin}/`
  }
}
