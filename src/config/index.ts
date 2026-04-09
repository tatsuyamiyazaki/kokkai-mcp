import { ConfigurationError } from '../utils/errors.js'

function getEnv(key: string, required: true): string
function getEnv(key: string, required: false, defaultValue: string): string
function getEnv(key: string, required: false, defaultValue?: string): string | undefined
function getEnv(key: string, required: boolean, defaultValue?: string): string | undefined {
  const value = process.env[key]
  if (value !== undefined && value !== '') {
    return value
  }
  if (required) {
    throw new ConfigurationError(`環境変数 ${key} が設定されていません。.env.example を参照してください。`)
  }
  return defaultValue
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key]
  if (value === undefined || value === '') {
    return defaultValue
  }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed)) {
    throw new ConfigurationError(`環境変数 ${key} は整数値である必要があります。現在の値: ${value}`)
  }
  return parsed
}

export const config = {
  anthropicApiKey: getEnv('ANTHROPIC_API_KEY', true),
  anthropicModel: getEnv('ANTHROPIC_MODEL', false, 'claude-3-5-haiku-20241022'),
  kokkaiApiBaseUrl: getEnv('KOKKAI_API_BASE_URL', false, 'https://kokkai.ndl.go.jp/api'),
  requestTimeoutMs: getEnvInt('REQUEST_TIMEOUT_MS', 30000),
  maxRetries: getEnvInt('MAX_RETRIES', 2),
  maxConcurrentRequests: getEnvInt('MAX_CONCURRENT_REQUESTS', 3),
  cache: {
    speechSearchTtlSec: getEnvInt('CACHE_SPEECH_TTL_SEC', 86400),
    meetingTtlSec: getEnvInt('CACHE_MEETING_TTL_SEC', 604800),
    summaryTtlSec: getEnvInt('CACHE_SUMMARY_TTL_SEC', 604800),
  },
  summarize: {
    maxItemsPerChunk: 20,
    maxCharsPerChunk: 8000,
    maxTotalItems: getEnvInt('MAX_SUMMARIZE_ITEMS', 200),
  },
} as const

export type Config = typeof config
