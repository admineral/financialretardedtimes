export const NEWSPAPER_TIME_ZONE = 'Europe/Berlin'

export function getNewspaperDateKey(date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: NEWSPAPER_TIME_ZONE })
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split('T')[0]
}

function getTimeZoneOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEWSPAPER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  )

  const localAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  )

  return localAsUtc - date.getTime()
}

function zonedDateTimeToUtc(
  dateKey: string,
  hour: number,
  minute: number,
  second: number,
  millisecond: number
): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond))
  const offset = getTimeZoneOffsetMs(utcGuess)
  return new Date(utcGuess.getTime() - offset)
}

export function getNewspaperDayBounds(dateKey: string): { startDate: Date; endDate: Date } {
  const startDate = zonedDateTimeToUtc(dateKey, 0, 0, 0, 0)
  const nextDateKey = addDaysToDateKey(dateKey, 1)
  const nextStartDate = zonedDateTimeToUtc(nextDateKey, 0, 0, 0, 0)

  return {
    startDate,
    endDate: new Date(nextStartDate.getTime() - 1)
  }
}
