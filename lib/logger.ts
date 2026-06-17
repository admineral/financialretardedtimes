/**
 * logger.ts
 * 
 * Centralized logging utility for both server and client.
 * Reduces verbose logs in production, provides structured error handling,
 * and aggregates repeated log messages.
 * 
 * USAGE:
 * import { logger } from '@/lib/logger'
 * 
 * logger.info('CACHE', 'Hit for date', { date: '2025-01-01' })
 * logger.error('API', 'Failed to fetch', error)
 * logger.debug('PROFILE', 'Processing user', { username })
 * 
 * // For frontend:
 * import { clientLogger } from '@/lib/logger'
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  context: string
  message: string
  data?: Record<string, unknown>
  error?: Error | unknown
  timestamp: Date
}

interface LoggerOptions {
  /** Minimum log level to output */
  minLevel?: LogLevel
  /** Whether to include timestamps */
  timestamps?: boolean
  /** Whether to aggregate similar logs */
  aggregate?: boolean
  /** Max aggregation window in ms */
  aggregateWindow?: number
}

// Log level priority (lower = more verbose)
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Environment detection
const isDev = process.env.NODE_ENV === 'development'

// Default options based on environment
const defaultOptions: LoggerOptions = {
  minLevel: isDev ? 'debug' : 'info',
  timestamps: false,
  aggregate: true,
  aggregateWindow: 1000, // 1 second
}

// Aggregation state
const aggregatedLogs = new Map<string, { count: number; firstTime: number; lastData?: Record<string, unknown> }>()

const CONTEXT_ICONS: Record<string, string> = {
  'CACHE': '💾',
  'API': '🌐',
  'PROFILE': '👤',
  'CRON': '⏰',
  'DB': '🗄️',
  'AUTH': '🔐',
  'NEWSPAPER': '📰',
  'FEAR-GREED': '😱',
  'CHATTERS': '💬',
  'TIMELINE': '📅',
}

function getContextIcon(context: string): string {
  // Check for exact match first
  if (CONTEXT_ICONS[context]) return CONTEXT_ICONS[context]
  
  // Check for partial match
  for (const [key, icon] of Object.entries(CONTEXT_ICONS)) {
    if (context.toUpperCase().includes(key)) return icon
  }
  
  return '📝'
}

function formatLogMessage(entry: LogEntry, options: LoggerOptions): string {
  const icon = getContextIcon(entry.context)
  const prefix = `[${entry.context}]`
  
  let msg = `${icon} ${prefix} ${entry.message}`
  
  if (options.timestamps) {
    const time = entry.timestamp.toISOString().split('T')[1].slice(0, 12)
    msg = `[${time}] ${msg}`
  }
  
  return msg
}

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel]
}

function getAggregationKey(context: string, message: string): string {
  return `${context}:${message}`
}

class Logger {
  private options: LoggerOptions

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = { ...defaultOptions, ...options }
  }

  private log(entry: LogEntry): void {
    if (!shouldLog(entry.level, this.options.minLevel!)) {
      return
    }

    // Aggregation logic
    if (this.options.aggregate && entry.level !== 'error') {
      const key = getAggregationKey(entry.context, entry.message)
      const now = Date.now()
      const existing = aggregatedLogs.get(key)

      if (existing && (now - existing.firstTime) < this.options.aggregateWindow!) {
        // Within aggregation window, just increment count
        existing.count++
        existing.lastData = entry.data
        return
      } else if (existing && existing.count > 1) {
        // Window expired, flush aggregated log
        const flushMsg = formatLogMessage({
          ...entry,
          message: `${entry.message} (×${existing.count})`,
          data: existing.lastData,
        }, this.options)
        this.output(entry.level, flushMsg, existing.lastData)
      }

      // Start new aggregation window
      aggregatedLogs.set(key, { count: 1, firstTime: now, lastData: entry.data })
    }

    const formattedMsg = formatLogMessage(entry, this.options)
    this.output(entry.level, formattedMsg, entry.data, entry.error)
  }

  private output(
    level: LogLevel, 
    message: string, 
    data?: Record<string, unknown>,
    error?: Error | unknown
  ): void {
    const args: unknown[] = [message]
    
    // In production, only include data for errors or if explicitly requested
    if (data && Object.keys(data).length > 0) {
      if (isDev || level === 'error') {
        args.push(data)
      }
    }

    if (error) {
      if (error instanceof Error) {
        args.push({ error: error.message, stack: isDev ? error.stack : undefined })
      } else {
        args.push({ error })
      }
    }

    switch (level) {
      case 'debug':
        if (isDev) console.log(...args)
        break
      case 'info':
        console.log(...args)
        break
      case 'warn':
        console.warn(...args)
        break
      case 'error':
        console.error(...args)
        break
    }
  }

  debug(context: string, message: string, data?: Record<string, unknown>): void {
    this.log({ level: 'debug', context, message, data, timestamp: new Date() })
  }

  info(context: string, message: string, data?: Record<string, unknown>): void {
    this.log({ level: 'info', context, message, data, timestamp: new Date() })
  }

  warn(context: string, message: string, data?: Record<string, unknown>): void {
    this.log({ level: 'warn', context, message, data, timestamp: new Date() })
  }

  error(context: string, message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    this.log({ level: 'error', context, message, data, error, timestamp: new Date() })
  }

  /**
   * Create a child logger with a fixed context
   */
  child(context: string): ContextLogger {
    return new ContextLogger(context, this)
  }

  /**
   * Flush any aggregated logs (call before process exit or response end)
   */
  flush(): void {
    for (const [key, value] of aggregatedLogs.entries()) {
      if (value.count > 1) {
        const [context, message] = key.split(':')
        const formattedMsg = `${getContextIcon(context)} [${context}] ${message} (×${value.count})`
        console.log(formattedMsg, value.lastData || '')
      }
    }
    aggregatedLogs.clear()
  }
}

class ContextLogger {
  constructor(private context: string, private parent: Logger) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.parent.debug(this.context, message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.parent.info(this.context, message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.parent.warn(this.context, message, data)
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    this.parent.error(this.context, message, error, data)
  }
}

// Export singleton instances
export const logger = new Logger()

// Client-specific logger with reduced verbosity
export const clientLogger = new Logger({
  minLevel: 'warn', // Only warnings and errors on client by default
  aggregate: false,
})

// Pre-configured context loggers for common use cases
export const cacheLogger = logger.child('CACHE')
export const apiLogger = logger.child('API')
export const profileLogger = logger.child('PROFILE')
export const cronLogger = logger.child('CRON')
export const dbLogger = logger.child('DB')
export const newspaperLogger = logger.child('NEWSPAPER')

export default logger

