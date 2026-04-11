/**
 * memoryCache.ts
 *
 * L1 インメモリキャッシュ管理モジュール。
 * 仕様: docs/Requirement_Rev05.md §18
 *
 * - Map<string, CacheEntry> で管理
 * - 件数上限を超えた場合に古い（最終アクセス順）エントリを削除
 * - TTL チェックは isEntryValid() に委譲
 */

import { logger } from '../utils/logger.js'
import type { CacheEntry } from './cachePolicy.js'

// ─── 設定 ─────────────────────────────────────────────────────────────────────

/** デフォルト最大保持件数（仕様 §18.3: 100〜500件推奨） */
const DEFAULT_MAX_SIZE = 300

// ─── MemoryCache クラス ───────────────────────────────────────────────────────

export class MemoryCache {
  private readonly store = new Map<string, CacheEntry>()
  private readonly maxSize: number

  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize
  }

  // ─── 取得 ──────────────────────────────────────────────────────────────

  /**
   * エントリを取得する。
   * 取得時に last_accessed_at をインメモリ上で更新する。
   * 存在しない場合は null を返す（有効期限チェックは呼び出し元の isEntryValid() で行う）。
   */
  get(cacheKey: string): CacheEntry | null {
    const entry = this.store.get(cacheKey)
    if (!entry) return null

    // last_accessed_at をインメモリ上で更新（仕様 §17.4 参照）
    const updated: CacheEntry = {
      ...entry,
      last_accessed_at: new Date().toISOString(),
    }
    this.store.set(cacheKey, updated)

    logger.debug('MemoryCache HIT', { cache_key: cacheKey })
    return updated
  }

  // ─── 保存 ──────────────────────────────────────────────────────────────

  /**
   * エントリを保存する。
   * 件数上限超過時は last_accessed_at が最も古いエントリを削除する（仕様 §18.2）。
   */
  set(entry: CacheEntry): void {
    // 既存エントリを上書き
    this.store.set(entry.cache_key, entry)

    // 件数制限チェック
    if (this.store.size > this.maxSize) {
      this.evictOldest()
    }

    logger.debug('MemoryCache SET', {
      cache_key: entry.cache_key,
      cache_type: entry.cache_type,
      size: this.store.size,
    })
  }

  // ─── 削除 ──────────────────────────────────────────────────────────────

  /** 個別エントリを削除する */
  delete(cacheKey: string): void {
    this.store.delete(cacheKey)
  }

  /** 全エントリを削除する */
  clear(): void {
    this.store.clear()
  }

  /** 期限切れエントリをメモリから削除する */
  deleteExpired(): number {
    const now = new Date()
    let count = 0
    for (const [key, entry] of this.store.entries()) {
      if (new Date(entry.expires_at) <= now) {
        this.store.delete(key)
        count++
      }
    }
    if (count > 0) {
      logger.debug('MemoryCache 期限切れ削除', { count })
    }
    return count
  }

  /** 現在のキャッシュ件数 */
  get size(): number {
    return this.store.size
  }

  // ─── プライベート ──────────────────────────────────────────────────────

  /**
   * last_accessed_at が最も古いエントリを削除する（LRU 近似）
   */
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.store.entries()) {
      const t = entry.last_accessed_at
        ? new Date(entry.last_accessed_at).getTime()
        : new Date(entry.created_at).getTime()
      if (t < oldestTime) {
        oldestTime = t
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey)
      logger.debug('MemoryCache evict', { cache_key: oldestKey })
    }
  }
}

// ─── シングルトンインスタンス ─────────────────────────────────────────────────

let _memCache: MemoryCache | null = null

export function getMemoryCache(): MemoryCache {
  if (!_memCache) {
    _memCache = new MemoryCache()
  }
  return _memCache
}

/** テスト用: インスタンスをリセットする */
export function resetMemoryCache(): void {
  if (_memCache) {
    _memCache.clear()
    _memCache = null
  }
}
