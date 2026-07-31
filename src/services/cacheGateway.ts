/**
 * cacheGateway.ts
 *
 * 二層キャッシュ（L1: メモリ、L2: SQLite）の統合ゲートウェイ。
 * 仕様: docs/Requirement_Rev05.md §14（参照フロー・書き込みフロー）
 *
 * 読み取りフロー:
 *   1. L1（メモリ）を参照
 *   2. ヒットして有効なら返却
 *   3. L2（SQLite）を参照
 *   4. ヒットして有効なら L1 にも格納して返却
 *   5. どちらにもない、または期限切れなら null を返す
 *
 * 書き込みフロー:
 *   1. CacheEntry を生成
 *   2. L2（SQLite）に保存
 *   3. L1（メモリ）に保存
 *   4. クリーンアップカウントを進める
 *
 * エラー処理:
 *   - SQLite 失敗時はフォールバック（実処理継続）
 *   - payload JSON 破損時は null を返す（再生成させる）
 */

import { logger } from '../utils/logger.js'
import type { CacheType } from './cacheKeyBuilder.js'
import { isEntryValid, parsePayload, createEntry, type ValidateOptions } from './cachePolicy.js'
import { getCacheStore } from './cacheStore.js'
import { getMemoryCache } from './memoryCache.js'
import { getCacheCleaner } from './cacheCleaner.js'

// ─── 読み取り ─────────────────────────────────────────────────────────────────

export interface GetOptions extends ValidateOptions {
  /** source_hash チェックが必要な場合に渡す */
  expectedSourceHash?: string
}

/**
 * キャッシュからデータを取得する（L1 → L2 の順）。
 *
 * @returns ヒットしたデータ、または null（ミス・期限切れ・破損）
 */
export function cacheGet<T>(cacheKey: string, opts: GetOptions = {}): T | null {
  // ─── L1（メモリ）参照 ──────────────────────────────────────────────
  const memEntry = getMemoryCache().get(cacheKey)
  if (memEntry) {
    if (isEntryValid(memEntry, opts)) {
      const data = parsePayload<T>(memEntry)
      if (data !== null) {
        logger.debug('cacheGateway L1 HIT', { cache_key: cacheKey })
        return data
      }
      // payload 破損: L1 から削除して L2 も試みる（仕様 §20.3）
      logger.warn('cacheGateway L1 payload 破損', { cache_key: cacheKey })
      getMemoryCache().delete(cacheKey)
    }
  }

  // ─── L2（SQLite）参照 ──────────────────────────────────────────────
  const sqliteEntry = getCacheStore().get(cacheKey)
  if (sqliteEntry) {
    if (isEntryValid(sqliteEntry, opts)) {
      const data = parsePayload<T>(sqliteEntry)
      if (data !== null) {
        // L1 に再格納（仕様 §14.1.6）
        getMemoryCache().set(sqliteEntry)
        logger.debug('cacheGateway L2 HIT', { cache_key: cacheKey })
        return data
      }
      // payload 破損: SQLite から削除（仕様 §20.3）
      logger.warn('cacheGateway L2 payload 破損', { cache_key: cacheKey })
      getCacheStore().deleteByKey(cacheKey)
    }
  }

  logger.debug('cacheGateway MISS', { cache_key: cacheKey })
  return null
}

// ─── 書き込み ─────────────────────────────────────────────────────────────────

export interface SetOptions {
  sourceHash?: string
  /** 0件検索結果かどうか（短縮TTLを適用する） */
  isEmpty?: boolean
}

/**
 * データをキャッシュに保存する（L2 → L1 の順）。
 * エラー時はログのみ（仕様 §20.2）。
 */
export function cacheSet<T>(
  cacheKey: string,
  cacheType: CacheType,
  data: T,
  opts: SetOptions = {},
): void {
  const entry = createEntry({
    cacheKey,
    cacheType,
    payload: data,
    ...(opts.sourceHash !== undefined ? { sourceHash: opts.sourceHash } : {}),
    ...(opts.isEmpty !== undefined ? { isEmpty: opts.isEmpty } : {}),
  })

  // L2（SQLite）に保存
  getCacheStore().set(entry)

  // L1（メモリ）に保存
  getMemoryCache().set(entry)

  // クリーンアップカウント
  getCacheCleaner().runOnWrite()

  logger.debug('cacheGateway SET', {
    cache_key: cacheKey,
    cache_type: cacheType,
  })
}

// ─── 削除 ─────────────────────────────────────────────────────────────────────

/** 個別キーを削除する */
export function cacheDelete(cacheKey: string): void {
  getMemoryCache().delete(cacheKey)
  getCacheStore().deleteByKey(cacheKey)
}

/** 種別単位で削除する */
export function cacheDeleteByType(cacheType: CacheType): void {
  // メモリは全件スキャン（件数が少ないので許容）
  getMemoryCache().clear()
  getCacheStore().deleteByType(cacheType)
}

/** 全件削除する */
export function cacheDeleteAll(): void {
  getMemoryCache().clear()
  getCacheStore().deleteAll()
}

// ─── 後方互換レイヤー ─────────────────────────────────────────────────────────
// 既存コードが cache.ts から import している buildCacheKey / getCache / setCache / deleteCache
// を再エクスポートして、import 先を変更せずに済むようにする。

export { buildGenericCacheKey as buildCacheKey } from './cacheKeyBuilder.js'

/** 既存コードとの互換: TTLタイプ → CacheType のマッピング */
type LegacyCacheTtlType = 'speech' | 'meeting' | 'summary'

const LEGACY_TYPE_MAP: Record<LegacyCacheTtlType, CacheType> = {
  speech: 'search_result',
  meeting: 'meeting_detail',
  summary: 'summary',
}

/**
 * 後方互換: 旧 getCache()
 * 既存ツールコードが `getCache<T>(key)` で呼び出せるようにする。
 */
export function getCache<T>(key: string): T | undefined {
  const result = cacheGet<T>(key)
  return result ?? undefined
}

/**
 * 後方互換: 旧 setCache()
 * 既存ツールコードが `setCache(key, value, 'summary')` で呼び出せるようにする。
 */
export function setCache<T>(key: string, value: T, ttlType: LegacyCacheTtlType): void {
  const cacheType = LEGACY_TYPE_MAP[ttlType]
  cacheSet(key, cacheType, value)
}

/**
 * 後方互換: 旧 deleteCache()
 */
export function deleteCache(key: string): void {
  cacheDelete(key)
}
