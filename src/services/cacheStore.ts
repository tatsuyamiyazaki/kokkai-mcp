/**
 * cacheStore.ts
 *
 * SQLite 永続キャッシュ（L2）の保存・取得モジュール。
 * 仕様: docs/Requirement_Rev05.md §17
 *
 * - 起動時にDDLを実行してテーブルを初期化する
 * - アップサートで保存する
 * - 取得時に last_accessed_at を更新する
 * - エラー時はフォールバック（仕様 §20）
 */

import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger.js'
import type { CacheEntry } from './cachePolicy.js'

// ─── DB パス ──────────────────────────────────────────────────────────────────

// process.cwd() はMCPクライアントの起動ディレクトリに依存するため使用しない。
// server.js の場所（dist/services/）から2階層上がりプロジェクトルートを基準にする。
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..', '..')

const DEFAULT_DB_DIR = join(PROJECT_ROOT, '.cashe', 'sqlite')
const DEFAULT_DB_PATH =
  process.env['KOKKAI_CACHE_DB_PATH'] ??
  join(DEFAULT_DB_DIR, 'kokkai-cache.db')

/** テスト環境では ':memory:' を DB パスとして使用できる */
export const MEMORY_DB_PATH = ':memory:'

// ─── DDL ─────────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key       TEXT PRIMARY KEY,
  cache_type      TEXT NOT NULL,
  payload         TEXT NOT NULL,
  source_hash     TEXT,
  version         TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  last_accessed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cache_entries_type
  ON cache_entries(cache_type);

CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at
  ON cache_entries(expires_at);

CREATE INDEX IF NOT EXISTS idx_cache_entries_last_accessed_at
  ON cache_entries(last_accessed_at);
`

// ─── アップサート SQL ──────────────────────────────────────────────────────────

const UPSERT_SQL = `
INSERT INTO cache_entries (
  cache_key, cache_type, payload, source_hash, version,
  created_at, expires_at, last_accessed_at
)
VALUES (
  @cache_key, @cache_type, @payload, @source_hash, @version,
  @created_at, @expires_at, @last_accessed_at
)
ON CONFLICT(cache_key) DO UPDATE SET
  cache_type       = excluded.cache_type,
  payload          = excluded.payload,
  source_hash      = excluded.source_hash,
  version          = excluded.version,
  created_at       = excluded.created_at,
  expires_at       = excluded.expires_at,
  last_accessed_at = excluded.last_accessed_at
`

const SELECT_VALID_SQL = `
SELECT cache_key, cache_type, payload, source_hash, version,
       created_at, expires_at, last_accessed_at
FROM cache_entries
WHERE cache_key = @cache_key
  AND expires_at > @now
`

const UPDATE_ACCESSED_SQL = `
UPDATE cache_entries
SET last_accessed_at = @last_accessed_at
WHERE cache_key = @cache_key
`

const DELETE_EXPIRED_SQL = `
DELETE FROM cache_entries
WHERE expires_at <= @now
`

const DELETE_BY_TYPE_SQL = `
DELETE FROM cache_entries
WHERE cache_type = @cache_type
`

const DELETE_BY_KEY_SQL = `
DELETE FROM cache_entries
WHERE cache_key = @cache_key
`

const DELETE_ALL_SQL = `
DELETE FROM cache_entries
`

// ─── CacheStore クラス ────────────────────────────────────────────────────────

export class CacheStore {
  private db: Database.Database | null = null
  private readonly dbPath: string

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath
    this.init()
  }

  // ─── 初期化 ──────────────────────────────────────────────────────────────

  private init(): void {
    try {
      mkdirSync(join(this.dbPath, '..'), { recursive: true })
      this.db = new Database(this.dbPath)
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('synchronous = NORMAL')
      this.db.exec(DDL)
      logger.debug('CacheStore 初期化完了', { dbPath: this.dbPath })
    } catch (err) {
      logger.error('CacheStore 初期化失敗 - SQLite なしで動作します', {
        error: err instanceof Error ? err.message : String(err),
      })
      this.db = null
    }
  }

  /** DBが利用可能かどうか */
  get isAvailable(): boolean {
    return this.db !== null
  }

  // ─── 取得 ────────────────────────────────────────────────────────────────

  /**
   * 有効なキャッシュエントリを取得する（仕様 §17.8）
   * ヒット時は last_accessed_at を更新する。
   * SQLite 読み取り失敗時は null を返す（仕様 §20.1）。
   */
  get(cacheKey: string): CacheEntry | null {
    if (!this.db) return null
    try {
      const now = new Date().toISOString()
      const row = this.db
        .prepare(SELECT_VALID_SQL)
        .get({ cache_key: cacheKey, now }) as CacheEntry | undefined

      if (!row) return null

      // last_accessed_at を非同期的に更新（失敗しても構わない）
      try {
        this.db
          .prepare(UPDATE_ACCESSED_SQL)
          .run({ last_accessed_at: now, cache_key: cacheKey })
      } catch {
        // 統計更新の失敗は無視
      }

      return row
    } catch (err) {
      logger.error('CacheStore.get エラー - フォールバック', {
        cacheKey,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  // ─── 保存 ────────────────────────────────────────────────────────────────

  /**
   * キャッシュエントリを保存する（アップサート、仕様 §17.7）
   * SQLite 書き込み失敗時はログのみ（仕様 §20.2）。
   */
  set(entry: CacheEntry): void {
    if (!this.db) return
    try {
      this.db.prepare(UPSERT_SQL).run({
        cache_key: entry.cache_key,
        cache_type: entry.cache_type,
        payload: entry.payload,
        source_hash: entry.source_hash,
        version: entry.version,
        created_at: entry.created_at,
        expires_at: entry.expires_at,
        last_accessed_at: entry.last_accessed_at,
      })
      logger.debug('CacheStore.set 保存完了', {
        cache_key: entry.cache_key,
        cache_type: entry.cache_type,
      })
    } catch (err) {
      logger.error('CacheStore.set エラー - 書き込みスキップ', {
        cache_key: entry.cache_key,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ─── 削除 ────────────────────────────────────────────────────────────────

  /** 期限切れキャッシュを削除する（仕様 §17.9） */
  deleteExpired(): number {
    if (!this.db) return 0
    try {
      const result = this.db
        .prepare(DELETE_EXPIRED_SQL)
        .run({ now: new Date().toISOString() })
      const count = result.changes
      if (count > 0) {
        logger.debug('CacheStore 期限切れ削除', { count })
      }
      return count
    } catch (err) {
      logger.error('CacheStore.deleteExpired エラー', {
        error: err instanceof Error ? err.message : String(err),
      })
      return 0
    }
  }

  /** cache_type 単位でキャッシュを削除する（仕様 §16.2） */
  deleteByType(cacheType: string): number {
    if (!this.db) return 0
    try {
      const result = this.db
        .prepare(DELETE_BY_TYPE_SQL)
        .run({ cache_type: cacheType })
      return result.changes
    } catch (err) {
      logger.error('CacheStore.deleteByType エラー', {
        error: err instanceof Error ? err.message : String(err),
      })
      return 0
    }
  }

  /** 個別キャッシュを削除する（仕様 §16.2） */
  deleteByKey(cacheKey: string): number {
    if (!this.db) return 0
    try {
      const result = this.db
        .prepare(DELETE_BY_KEY_SQL)
        .run({ cache_key: cacheKey })
      return result.changes
    } catch (err) {
      logger.error('CacheStore.deleteByKey エラー', {
        error: err instanceof Error ? err.message : String(err),
      })
      return 0
    }
  }

  /** 全キャッシュを削除する（仕様 §16.2） */
  deleteAll(): number {
    if (!this.db) return 0
    try {
      const result = this.db.prepare(DELETE_ALL_SQL).run()
      return result.changes
    } catch (err) {
      logger.error('CacheStore.deleteAll エラー', {
        error: err instanceof Error ? err.message : String(err),
      })
      return 0
    }
  }

  /** DB 接続をクローズする */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

// ─── シングルトンインスタンス ─────────────────────────────────────────────────

let _store: CacheStore | null = null

export function getCacheStore(): CacheStore {
  if (!_store) {
    _store = new CacheStore()
  }
  return _store
}

/** テスト用: インスタンスをリセットする（DB の全件削除も行う） */
export function resetCacheStore(): void {
  if (_store) {
    _store.deleteAll()
    _store.close()
    _store = null
  }
}
