/** ログレベル */
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

const CURRENT_LEVEL: LogLevel =
  (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'INFO'

/** 機微情報を含むキーのリスト（ログに出力しない） */
const SENSITIVE_KEYS = new Set(['apiKey', 'ANTHROPIC_API_KEY', 'authorization', 'token'])

/** 機微情報をマスクする */
function maskSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = '[REDACTED]'
    } else if (key === 'speech' && typeof value === 'string') {
      // 発言本文は最大 50 文字まで
      result[key] = value.slice(0, 50) + (value.length > 50 ? '...' : '')
    } else {
      result[key] = value
    }
  }
  return result
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[CURRENT_LEVEL]) {
    return
  }

  const entry: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    message,
  }

  if (context) {
    entry['context'] = maskSensitive(context)
  }

  // MCP サーバーは stdout を MCP プロトコルで使用するため、ログは必ず stderr へ
  process.stderr.write(JSON.stringify(entry) + '\n')
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('DEBUG', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('INFO', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('WARN', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('ERROR', message, context),
}
