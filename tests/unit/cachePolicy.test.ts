/**
 * cachePolicy.test.ts
 *
 * TTL・version・source_hash 判定モジュールのユニットテスト。
 * 仕様: docs/Requirement_Rev05.md §12, §13, §15
 */

import { describe, it, expect } from 'vitest'
import {
  CACHE_VERSIONS,
  CACHE_TTL_SEC,
  calcExpiresAt,
  isEntryValid,
  createEntry,
  parsePayload,
  type CacheEntry,
} from '../../src/services/cachePolicy.js'

// ─── テストヘルパー ───────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  const now = new Date()
  const expires = new Date(now.getTime() + 86400 * 1000).toISOString()
  return {
    cache_key: 'test:key',
    cache_type: 'summary',
    payload: JSON.stringify({ overview: 'test' }),
    source_hash: null,
    version: CACHE_VERSIONS['summary'],
    created_at: now.toISOString(),
    expires_at: expires,
    last_accessed_at: null,
    ...overrides,
  }
}

// ─── TTL ─────────────────────────────────────────────────────────────────────

describe('CACHE_TTL_SEC', () => {
  it('search_result の TTL は 1日（86400秒）', () => {
    expect(CACHE_TTL_SEC['search_result']).toBe(86400)
  })

  it('summary の TTL は 7日（604800秒）', () => {
    expect(CACHE_TTL_SEC['summary']).toBe(604800)
  })

  it('meeting_detail の TTL は 7日', () => {
    expect(CACHE_TTL_SEC['meeting_detail']).toBe(604800)
  })

  it('party_compare の TTL は 7日', () => {
    expect(CACHE_TTL_SEC['party_compare']).toBe(604800)
  })
})

describe('calcExpiresAt', () => {
  it('summary の expires_at は現在時刻から約7日後', () => {
    const expires = new Date(calcExpiresAt('summary'))
    const now = new Date()
    const diffMs = expires.getTime() - now.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(6.99)
    expect(diffDays).toBeLessThan(7.01)
  })

  it('search_result の isEmpty=true は短縮TTL（3時間以内）', () => {
    const expires = new Date(calcExpiresAt('search_result', true))
    const now = new Date()
    const diffMs = expires.getTime() - now.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    expect(diffHours).toBeGreaterThan(2.99)
    expect(diffHours).toBeLessThan(3.01)
  })

  it('ISO 8601 形式で返される', () => {
    const expires = calcExpiresAt('summary')
    expect(expires).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

// ─── isEntryValid ─────────────────────────────────────────────────────────────

describe('isEntryValid', () => {
  it('有効なエントリは true を返す', () => {
    const entry = makeEntry()
    expect(isEntryValid(entry)).toBe(true)
  })

  it('期限切れエントリは false を返す', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const entry = makeEntry({ expires_at: past })
    expect(isEntryValid(entry)).toBe(false)
  })

  it('version 不一致は false を返す', () => {
    const entry = makeEntry({ version: 'summary-v99' })
    expect(isEntryValid(entry)).toBe(false)
  })

  it('expectedVersion を指定した場合、一致すれば true', () => {
    const entry = makeEntry({ version: 'summary-v1' })
    expect(isEntryValid(entry, { expectedVersion: 'summary-v1' })).toBe(true)
  })

  it('source_hash が指定されてヒットする場合は true', () => {
    const entry = makeEntry({ source_hash: 'abc123' })
    expect(isEntryValid(entry, { expectedSourceHash: 'abc123' })).toBe(true)
  })

  it('source_hash 不一致は false を返す', () => {
    const entry = makeEntry({ source_hash: 'abc123' })
    expect(isEntryValid(entry, { expectedSourceHash: 'xyz999' })).toBe(false)
  })

  it('expectedSourceHash が未指定なら source_hash チェックをスキップ', () => {
    // source_hash が null でも expectedSourceHash 未指定なら valid
    const entry = makeEntry({ source_hash: null })
    expect(isEntryValid(entry)).toBe(true)
  })
})

// ─── createEntry ─────────────────────────────────────────────────────────────

describe('createEntry', () => {
  it('必須フィールドが揃っている', () => {
    const entry = createEntry({
      cacheKey: 'summary:abc',
      cacheType: 'summary',
      payload: { overview: 'test' },
    })
    expect(entry.cache_key).toBe('summary:abc')
    expect(entry.cache_type).toBe('summary')
    expect(entry.version).toBe(CACHE_VERSIONS['summary'])
    expect(entry.created_at).toBeTruthy()
    expect(entry.expires_at).toBeTruthy()
    expect(typeof entry.payload).toBe('string')
  })

  it('payload は JSON 文字列に変換される', () => {
    const data = { overview: 'test', topics: [{ topic: 'AI' }] }
    const entry = createEntry({
      cacheKey: 'summary:abc',
      cacheType: 'summary',
      payload: data,
    })
    expect(JSON.parse(entry.payload)).toEqual(data)
  })

  it('sourceHash を指定した場合に保持される', () => {
    const entry = createEntry({
      cacheKey: 'summary:abc',
      cacheType: 'summary',
      payload: {},
      sourceHash: 'hash-abc',
    })
    expect(entry.source_hash).toBe('hash-abc')
  })

  it('sourceHash 未指定は null になる', () => {
    const entry = createEntry({
      cacheKey: 'summary:abc',
      cacheType: 'summary',
      payload: {},
    })
    expect(entry.source_hash).toBeNull()
  })
})

// ─── parsePayload ─────────────────────────────────────────────────────────────

describe('parsePayload', () => {
  it('正常な JSON を復元できる', () => {
    const data = { overview: 'test', topics: [] }
    const entry = makeEntry({ payload: JSON.stringify(data) })
    expect(parsePayload<typeof data>(entry)).toEqual(data)
  })

  it('破損した JSON は null を返す', () => {
    const entry = makeEntry({ payload: '{ broken json' })
    expect(parsePayload(entry)).toBeNull()
  })
})
