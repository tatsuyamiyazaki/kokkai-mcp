/**
 * cachePolicy.ts
 *
 * TTL・version・source_hash 判定モジュール。
 * 仕様: docs/Requirement_Rev05.md §12, §13, §15
 */

import type { CacheType } from './cacheKeyBuilder.js'

// ─── バージョン定義 ───────────────────────────────────────────────────────────

/**
 * ロジックバージョン定義（仕様 §12.3）
 * ロジック・プロンプト・出力形式を変更した際にここをインクリメントする。
 */
export const CACHE_VERSIONS: Record<CacheType, string> = {
  search_result: 'search-v1',
  meeting_detail: 'meeting-v1',
  summary: 'summary-v1',
  qa_pairs: 'qa-v1',
  party_compare: 'party-compare-v1',
  time_compare: 'time-compare-v1',
  topic_changes: 'topic-changes-v1',
}

// ─── TTL 定義（秒） ───────────────────────────────────────────────────────────

const DAY_SEC = 86_400
const WEEK_SEC = 604_800
const HOUR_SEC = 3_600

/**
 * データ種別ごとの TTL（秒）（仕様 §13.2）
 */
export const CACHE_TTL_SEC: Record<CacheType, number> = {
  search_result: DAY_SEC,      // 1日
  meeting_detail: WEEK_SEC,    // 7日
  summary: WEEK_SEC,           // 7日
  qa_pairs: WEEK_SEC,          // 7日
  party_compare: WEEK_SEC,     // 7日
  time_compare: WEEK_SEC,      // 7日
  topic_changes: WEEK_SEC,     // 7日
}

/** 0件検索結果の短縮 TTL（仕様 §13.3） */
export const EMPTY_SEARCH_TTL_SEC = HOUR_SEC * 3  // 3時間

// ─── キャッシュエントリ型 ─────────────────────────────────────────────────────

export interface CacheEntry {
  cache_key: string
  cache_type: CacheType
  payload: string          // JSON文字列
  source_hash: string | null
  version: string
  created_at: string       // ISO 8601
  expires_at: string       // ISO 8601
  last_accessed_at: string | null
}

// ─── TTL / expires_at 計算 ────────────────────────────────────────────────────

/**
 * 現在時刻から expires_at（ISO 8601）を算出する
 */
export function calcExpiresAt(cacheType: CacheType, isEmpty = false): string {
  const ttlSec =
    cacheType === 'search_result' && isEmpty
      ? EMPTY_SEARCH_TTL_SEC
      : CACHE_TTL_SEC[cacheType]
  const expiresAt = new Date(Date.now() + ttlSec * 1000)
  return expiresAt.toISOString()
}

// ─── 有効判定 ─────────────────────────────────────────────────────────────────

export interface ValidateOptions {
  /** 要求バージョン（省略時は CACHE_VERSIONS から取得） */
  expectedVersion?: string
  /** 要求 source_hash（省略時はチェックしない） */
  expectedSourceHash?: string
}

/**
 * キャッシュエントリが有効かどうかを判定する（仕様 §15）
 *
 * 有効条件:
 * 1. expires_at が現在時刻以降
 * 2. version が一致する
 * 3. expectedSourceHash が指定されている場合、source_hash が一致する
 */
export function isEntryValid(entry: CacheEntry, opts: ValidateOptions = {}): boolean {
  const now = new Date()

  // 1. 有効期限チェック
  const expiresAt = new Date(entry.expires_at)
  if (expiresAt <= now) {
    return false
  }

  // 2. version チェック
  const expectedVersion =
    opts.expectedVersion ?? CACHE_VERSIONS[entry.cache_type]
  if (entry.version !== expectedVersion) {
    return false
  }

  // 3. source_hash チェック（指定がある場合のみ）
  if (opts.expectedSourceHash !== undefined) {
    if (entry.source_hash !== opts.expectedSourceHash) {
      return false
    }
  }

  return true
}

// ─── エントリ生成ヘルパー ─────────────────────────────────────────────────────

export interface CreateEntryOptions {
  cacheKey: string
  cacheType: CacheType
  payload: unknown
  sourceHash?: string
  isEmpty?: boolean
}

/**
 * 保存用 CacheEntry を生成する（仕様 §14.2）
 */
export function createEntry(opts: CreateEntryOptions): CacheEntry {
  const now = new Date().toISOString()
  return {
    cache_key: opts.cacheKey,
    cache_type: opts.cacheType,
    payload: JSON.stringify(opts.payload),
    source_hash: opts.sourceHash ?? null,
    version: CACHE_VERSIONS[opts.cacheType],
    created_at: now,
    expires_at: calcExpiresAt(opts.cacheType, opts.isEmpty),
    last_accessed_at: null,
  }
}

/**
 * payload を安全にパースする（仕様 §20.3: JSON破損時はnullを返す）
 */
export function parsePayload<T>(entry: CacheEntry): T | null {
  try {
    return JSON.parse(entry.payload) as T
  } catch {
    return null
  }
}
