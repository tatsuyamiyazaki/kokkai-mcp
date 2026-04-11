/**
 * cacheGateway.test.ts
 *
 * 二層キャッシュゲートウェイのユニットテスト（SQLiteはインメモリDBで実施）。
 * 仕様: docs/Requirement_Rev05.md §14, §15, §20
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import os from 'os'

// 環境変数設定（config モジュールが要求するため）
process.env['ANTHROPIC_API_KEY'] = 'test-key'

// ─── テスト用 DB パスを一時ディレクトリに向ける ──────────────────────────────

// テスト用に独立した SQLite DB を使用するため、CacheStore をインポート前に
// モジュールキャッシュをリセットする
import { resetCacheStore, CacheStore } from '../../src/services/cacheStore.js'
import { resetMemoryCache } from '../../src/services/memoryCache.js'
import { cacheGet, cacheSet, cacheDelete, cacheDeleteAll, getCache, setCache, deleteCache } from '../../src/services/cacheGateway.js'
import { CACHE_VERSIONS } from '../../src/services/cachePolicy.js'

// ─── セットアップ ─────────────────────────────────────────────────────────────

beforeEach(() => {
  // テストごとにメモリキャッシュをクリア
  resetMemoryCache()
})

afterEach(() => {
  resetCacheStore()
  resetMemoryCache()
})

// ─── 基本的な Get / Set ───────────────────────────────────────────────────────

describe('cacheGet / cacheSet', () => {
  it('保存したデータを取得できる', () => {
    const data = { overview: 'テスト要約', topics: [] }
    cacheSet('summary:test-1', 'summary', data)
    const result = cacheGet<typeof data>('summary:test-1')
    expect(result).toEqual(data)
  })

  it('存在しないキーで null が返る', () => {
    const result = cacheGet('non-existent-key')
    expect(result).toBeNull()
  })

  it('削除後に null が返る', () => {
    cacheSet('summary:test-2', 'summary', { overview: 'test' })
    cacheDelete('summary:test-2')
    expect(cacheGet('summary:test-2')).toBeNull()
  })

  it('全件削除後にすべてのキーで null が返る', () => {
    cacheSet('summary:a', 'summary', { a: 1 })
    cacheSet('summary:b', 'summary', { b: 2 })
    cacheDeleteAll()
    expect(cacheGet('summary:a')).toBeNull()
    expect(cacheGet('summary:b')).toBeNull()
  })
})

// ─── version 不一致 ───────────────────────────────────────────────────────────

describe('version 不一致', () => {
  it('expectedVersion が一致しない場合は null を返す（仕様 §15.3）', () => {
    cacheSet('summary:v-test', 'summary', { overview: 'test' })
    // 現在の version は CACHE_VERSIONS['summary'] = 'summary-v1'
    // 古いバージョンを要求するとミス扱いになる
    const result = cacheGet('summary:v-test', { expectedVersion: 'summary-v99' })
    expect(result).toBeNull()
  })

  it('expectedVersion が一致する場合はデータが返る', () => {
    cacheSet('summary:v-test2', 'summary', { overview: 'test' })
    const version = CACHE_VERSIONS['summary']
    const result = cacheGet('summary:v-test2', { expectedVersion: version })
    expect(result).not.toBeNull()
  })
})

// ─── TTL 期限切れ ─────────────────────────────────────────────────────────────

describe('TTL 期限切れ', () => {
  it('期限切れエントリはキャッシュミスとして扱われる', () => {
    // 過去の expires_at を持つエントリを直接注入
    const store = new CacheStore(path.join(os.tmpdir(), `kokkai-test-${Date.now()}.db`))
    const past = new Date(Date.now() - 1000).toISOString()
    const now = new Date().toISOString()
    store.set({
      cache_key: 'expired:test',
      cache_type: 'summary',
      payload: JSON.stringify({ overview: 'expired' }),
      source_hash: null,
      version: CACHE_VERSIONS['summary'],
      created_at: now,
      expires_at: past,
      last_accessed_at: null,
    })
    // expires_at が過去のエントリは SELECT で取得されない
    const entry = store.get('expired:test')
    expect(entry).toBeNull()
    store.close()
  })
})

// ─── source_hash チェック ──────────────────────────────────────────────────────

describe('source_hash チェック', () => {
  it('source_hash 一致でデータが返る', () => {
    cacheSet('summary:hash-test', 'summary', { overview: 'test' }, { sourceHash: 'abc123' })
    const result = cacheGet('summary:hash-test', { expectedSourceHash: 'abc123' })
    expect(result).not.toBeNull()
  })

  it('source_hash 不一致でキャッシュミスになる', () => {
    cacheSet('summary:hash-test2', 'summary', { overview: 'test' }, { sourceHash: 'abc123' })
    const result = cacheGet('summary:hash-test2', { expectedSourceHash: 'different-hash' })
    expect(result).toBeNull()
  })
})

// ─── 後方互換レイヤー ─────────────────────────────────────────────────────────

describe('後方互換: getCache / setCache / deleteCache', () => {
  it('setCache + getCache で値を保存・取得できる', () => {
    setCache('legacy:test-1', { value: 'hello' }, 'speech')
    const result = getCache<{ value: string }>('legacy:test-1')
    expect(result).toEqual({ value: 'hello' })
  })

  it('存在しないキーで undefined が返る', () => {
    expect(getCache('legacy:nonexistent')).toBeUndefined()
  })

  it('deleteCache 後に undefined が返る', () => {
    setCache('legacy:test-2', { value: 'world' }, 'meeting')
    deleteCache('legacy:test-2')
    expect(getCache('legacy:test-2')).toBeUndefined()
  })

  it('meeting TTL タイプで保存できる', () => {
    setCache('legacy:meeting-1', { issueID: 'abc' }, 'meeting')
    const result = getCache<{ issueID: string }>('legacy:meeting-1')
    expect(result?.issueID).toBe('abc')
  })

  it('summary TTL タイプで保存できる', () => {
    setCache('legacy:summary-1', { overview: 'summary' }, 'summary')
    const result = getCache<{ overview: string }>('legacy:summary-1')
    expect(result?.overview).toBe('summary')
  })
})

// ─── L2 → L1 昇格 ────────────────────────────────────────────────────────────

describe('L2 → L1 昇格（仕様 §14.1.6）', () => {
  it('SQLite に保存してメモリをリセットしても取得できる', () => {
    const data = { overview: 'persistence test' }
    cacheSet('summary:persist-test', 'summary', data)

    // メモリキャッシュをクリアして L2 のみ残す
    resetMemoryCache()

    const result = cacheGet<typeof data>('summary:persist-test')
    expect(result).toEqual(data)
  })
})
