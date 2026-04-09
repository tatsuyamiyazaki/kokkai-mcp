import NodeCache from 'node-cache'
import { createHash } from 'crypto'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'

type CacheTtlType = 'speech' | 'meeting' | 'summary'

const TTL_MAP: Record<CacheTtlType, number> = {
  speech: config.cache.speechSearchTtlSec,
  meeting: config.cache.meetingTtlSec,
  summary: config.cache.summaryTtlSec,
}

const cache = new NodeCache({
  stdTTL: config.cache.speechSearchTtlSec,
  checkperiod: 600, // 10分ごとに期限切れキーを掃除
  useClones: false,
})

/**
 * キャッシュキーを生成する
 * オブジェクトは JSON.stringify + SHA-256 の先頭 16 文字でハッシュ化する
 */
export function buildCacheKey(prefix: string, params: unknown): string {
  const json = JSON.stringify(params, Object.keys(
    typeof params === 'object' && params !== null ? params as Record<string, unknown> : {}
  ).sort())
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 16)
  return `${prefix}:${hash}`
}

/** キャッシュから値を取得する */
export function getCache<T>(key: string): T | undefined {
  const value = cache.get<T>(key)
  if (value !== undefined) {
    logger.debug('キャッシュ HIT', { key })
  }
  return value
}

/** キャッシュに値を保存する */
export function setCache<T>(key: string, value: T, ttlType: CacheTtlType): void {
  const ttl = TTL_MAP[ttlType]
  cache.set(key, value, ttl)
  logger.debug('キャッシュ SET', { key, ttlType, ttlSec: ttl })
}

/** キャッシュを削除する */
export function deleteCache(key: string): void {
  cache.del(key)
  logger.debug('キャッシュ DELETE', { key })
}

/** キャッシュ統計を取得する（デバッグ用） */
export function getCacheStats(): NodeCache.Stats {
  return cache.getStats()
}
