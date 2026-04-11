/**
 * cacheCleaner.ts
 *
 * 期限切れキャッシュ削除モジュール。
 * 仕様: docs/Requirement_Rev05.md §21
 *
 * 第一段階の掃除戦略:
 * - 起動時に削除（runOnStartup）
 * - 書き込みN回ごとに削除（runOnWrite）
 */

import { logger } from '../utils/logger.js'
import { getCacheStore } from './cacheStore.js'
import { getMemoryCache } from './memoryCache.js'

// ─── 設定 ─────────────────────────────────────────────────────────────────────

/** 書き込みN回ごとにクリーンアップを実行する閾値 */
const WRITE_INTERVAL = 50

// ─── CacheCleaner クラス ──────────────────────────────────────────────────────

export class CacheCleaner {
  private writeCount = 0

  /**
   * 起動時クリーンアップ（仕様 §21: 起動時に削除）
   * server.ts の起動処理から呼び出す。
   */
  runOnStartup(): void {
    try {
      const store = getCacheStore()
      const sqliteDeleted = store.deleteExpired()
      const memDeleted = getMemoryCache().deleteExpired()
      logger.info('起動時キャッシュクリーンアップ完了', {
        sqliteDeleted,
        memDeleted,
      })
    } catch (err) {
      logger.error('起動時キャッシュクリーンアップ失敗', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * 書き込み時クリーンアップ（仕様 §21: 書き込み時に期限切れを掃除）
   * cacheGateway.set() から呼び出す。
   */
  runOnWrite(): void {
    this.writeCount++
    if (this.writeCount % WRITE_INTERVAL === 0) {
      this.cleanup()
    }
  }

  /**
   * 手動クリーンアップ
   */
  cleanup(): void {
    try {
      const store = getCacheStore()
      const sqliteDeleted = store.deleteExpired()
      const memDeleted = getMemoryCache().deleteExpired()
      if (sqliteDeleted > 0 || memDeleted > 0) {
        logger.debug('定期キャッシュクリーンアップ完了', {
          sqliteDeleted,
          memDeleted,
        })
      }
    } catch (err) {
      logger.error('キャッシュクリーンアップ失敗', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

// ─── シングルトンインスタンス ─────────────────────────────────────────────────

let _cleaner: CacheCleaner | null = null

export function getCacheCleaner(): CacheCleaner {
  if (!_cleaner) {
    _cleaner = new CacheCleaner()
  }
  return _cleaner
}
