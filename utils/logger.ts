/**
 * Logger utility — async-friendly, environment-aware.
 * Replaces raw console.log to avoid blocking the event loop.
 *
 * LOG_LEVEL env var controls verbosity:
 *   'debug'  → all logs
 *   'info'   → info, warn, error (default in development)
 *   'warn'   → warn, error only
 *   'error'  → error only
 *   'silent' → no logs (recommended for production or load tests)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const isDev = process.env.NODE_ENV !== 'production';
const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? (isDev ? 'debug' : 'warn');
const currentLevelValue = LEVELS[currentLevel] ?? LEVELS['info'];

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= currentLevelValue;
}

/** Format log message with timestamp and prefix */
function format(level: string, context: string, args: unknown[]): string {
  const time = new Date().toISOString().replace('T', ' ').slice(0, 23);
  const prefix = `[${time}] [${level.toUpperCase()}] [${context}]`;
  const message = args
    .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  return `${prefix} ${message}`;
}

/** Non-blocking log — uses setImmediate to defer I/O off the hot path */
function writeAsync(fn: (...args: string[]) => void, msg: string): void {
  setImmediate(() => fn(msg));
}

function createLogger(context: string) {
  return {
    debug(...args: unknown[]): void {
      if (!shouldLog('debug')) return;
      writeAsync(console.debug, format('debug', context, args));
    },

    info(...args: unknown[]): void {
      if (!shouldLog('info')) return;
      writeAsync(console.info, format('info', context, args));
    },

    warn(...args: unknown[]): void {
      if (!shouldLog('warn')) return;
      writeAsync(console.warn, format('warn', context, args));
    },

    error(...args: unknown[]): void {
      if (!shouldLog('error')) return;
      // errors are written synchronously to ensure they're captured before crash
      console.error(format('error', context, args));
    },

    /** Shorthand: same as info — drop-in for console.log */
    log(...args: unknown[]): void {
      this.info(...args);
    },
  };
}

export { createLogger };
export type Logger = ReturnType<typeof createLogger>;
