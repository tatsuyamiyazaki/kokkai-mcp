/**
 * cacheKeyBuilder.test.ts
 *
 * キャッシュキー生成モジュールのユニットテスト。
 * 仕様: docs/Requirement_Rev05.md §8, §11
 */

import { describe, it, expect } from 'vitest'
import {
  buildSearchResultKey,
  buildMeetingDetailKey,
  buildSummaryKey,
  buildQaPairsKey,
  buildPartyCompareKey,
  buildTimeCompareKey,
  buildTopicChangesKey,
  buildSourceHash,
  buildGenericCacheKey,
} from '../../src/services/cacheKeyBuilder.js'

describe('buildSearchResultKey', () => {
  it('同一パラメータで同一キーが生成される', () => {
    const k1 = buildSearchResultKey({ query: '生成AI', from: '2025-01-01', until: '2025-12-31' })
    const k2 = buildSearchResultKey({ query: '生成AI', from: '2025-01-01', until: '2025-12-31' })
    expect(k1).toBe(k2)
  })

  it('cache_type prefix が search_result である', () => {
    const k = buildSearchResultKey({ query: '生成AI' })
    expect(k.startsWith('search_result:')).toBe(true)
  })

  it('前後空白を除去して同一キーになる', () => {
    const k1 = buildSearchResultKey({ query: '生成AI' })
    const k2 = buildSearchResultKey({ query: '  生成AI  ' })
    expect(k1).toBe(k2)
  })

  it('クエリが異なると異なるキーになる', () => {
    const k1 = buildSearchResultKey({ query: '生成AI' })
    const k2 = buildSearchResultKey({ query: 'ロボット' })
    expect(k1).not.toBe(k2)
  })

  it('日付が異なると異なるキーになる', () => {
    const k1 = buildSearchResultKey({ query: '生成AI', from: '2024-01-01' })
    const k2 = buildSearchResultKey({ query: '生成AI', from: '2025-01-01' })
    expect(k1).not.toBe(k2)
  })

  it('不正な日付形式は空文字として扱われる', () => {
    const k1 = buildSearchResultKey({ query: '生成AI', from: '' })
    const k2 = buildSearchResultKey({ query: '生成AI', from: 'invalid-date' })
    expect(k1).toBe(k2)
  })
})

describe('buildMeetingDetailKey', () => {
  it('同一 issueID で同一キーが生成される', () => {
    const k1 = buildMeetingDetailKey({ issueID: 'abc123' })
    const k2 = buildMeetingDetailKey({ issueID: 'abc123' })
    expect(k1).toBe(k2)
  })

  it('cache_type prefix が meeting_detail である', () => {
    const k = buildMeetingDetailKey({ issueID: 'abc123' })
    expect(k.startsWith('meeting_detail:')).toBe(true)
  })

  it('issueID が異なると異なるキーになる', () => {
    const k1 = buildMeetingDetailKey({ issueID: 'abc123' })
    const k2 = buildMeetingDetailKey({ issueID: 'def456' })
    expect(k1).not.toBe(k2)
  })
})

describe('buildSummaryKey', () => {
  it('issueID を使った同一パラメータで同一キーが生成される', () => {
    const k1 = buildSummaryKey({ issueID: 'abc123', mode: 'standard', include_topics: true })
    const k2 = buildSummaryKey({ issueID: 'abc123', mode: 'standard', include_topics: true })
    expect(k1).toBe(k2)
  })

  it('cache_type prefix が summary である', () => {
    const k = buildSummaryKey({ issueID: 'abc123' })
    expect(k.startsWith('summary:')).toBe(true)
  })

  it('mode が異なると異なるキーになる', () => {
    const k1 = buildSummaryKey({ issueID: 'abc123', mode: 'standard' })
    const k2 = buildSummaryKey({ issueID: 'abc123', mode: 'detailed' })
    expect(k1).not.toBe(k2)
  })

  it('speechIDs を使った場合も同一入力で同一キーになる', () => {
    const k1 = buildSummaryKey({ speechIDs: ['s1', 's2', 's3'] })
    const k2 = buildSummaryKey({ speechIDs: ['s1', 's2', 's3'] })
    expect(k1).toBe(k2)
  })

  it('speechIDs はソートして同一キーになる', () => {
    const k1 = buildSummaryKey({ speechIDs: ['s1', 's2', 's3'] })
    const k2 = buildSummaryKey({ speechIDs: ['s3', 's1', 's2'] })
    expect(k1).toBe(k2)
  })
})

describe('buildQaPairsKey', () => {
  it('同一パラメータで同一キーが生成される', () => {
    const k1 = buildQaPairsKey({ issueID: 'abc123', mode: 'standard', max_pairs: 10 })
    const k2 = buildQaPairsKey({ issueID: 'abc123', mode: 'standard', max_pairs: 10 })
    expect(k1).toBe(k2)
  })

  it('cache_type prefix が qa_pairs である', () => {
    const k = buildQaPairsKey({ issueID: 'abc123' })
    expect(k.startsWith('qa_pairs:')).toBe(true)
  })

  it('max_pairs が異なると異なるキーになる', () => {
    const k1 = buildQaPairsKey({ issueID: 'abc123', max_pairs: 5 })
    const k2 = buildQaPairsKey({ issueID: 'abc123', max_pairs: 10 })
    expect(k1).not.toBe(k2)
  })
})

describe('buildPartyCompareKey', () => {
  it('同一パラメータで同一キーが生成される', () => {
    const k1 = buildPartyCompareKey({ query: '生成AI', mode: 'standard' })
    const k2 = buildPartyCompareKey({ query: '生成AI', mode: 'standard' })
    expect(k1).toBe(k2)
  })

  it('cache_type prefix が party_compare である', () => {
    const k = buildPartyCompareKey({ query: '生成AI' })
    expect(k.startsWith('party_compare:')).toBe(true)
  })
})

describe('buildTimeCompareKey', () => {
  const periods = [
    { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
    { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
  ]

  it('同一パラメータで同一キーが生成される', () => {
    const k1 = buildTimeCompareKey({ query: '生成AI', periods })
    const k2 = buildTimeCompareKey({ query: '生成AI', periods })
    expect(k1).toBe(k2)
  })

  it('cache_type prefix が time_compare である', () => {
    const k = buildTimeCompareKey({ query: '生成AI', periods })
    expect(k.startsWith('time_compare:')).toBe(true)
  })

  it('期間が異なると異なるキーになる', () => {
    const other = [
      { label: '2023年', from: '2023-01-01', until: '2023-12-31' },
      { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
    ]
    const k1 = buildTimeCompareKey({ query: '生成AI', periods })
    const k2 = buildTimeCompareKey({ query: '生成AI', periods: other })
    expect(k1).not.toBe(k2)
  })
})

describe('buildTopicChangesKey', () => {
  const periods = [
    { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
    { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
  ]

  it('同一パラメータで同一キーが生成される', () => {
    const k1 = buildTopicChangesKey({ query: '生成AI', periods })
    const k2 = buildTopicChangesKey({ query: '生成AI', periods })
    expect(k1).toBe(k2)
  })

  it('cache_type prefix が topic_changes である', () => {
    const k = buildTopicChangesKey({ query: '生成AI', periods })
    expect(k.startsWith('topic_changes:')).toBe(true)
  })
})

describe('buildSourceHash', () => {
  it('同一入力で同一ハッシュが生成される', () => {
    const h1 = buildSourceHash({
      speechIDs: ['s1', 's2'],
      issueIDs: ['i1'],
      speakers: ['田中', '鈴木'],
    })
    const h2 = buildSourceHash({
      speechIDs: ['s1', 's2'],
      issueIDs: ['i1'],
      speakers: ['田中', '鈴木'],
    })
    expect(h1).toBe(h2)
  })

  it('異なる入力で異なるハッシュが生成される', () => {
    const h1 = buildSourceHash({ speechIDs: ['s1', 's2'] })
    const h2 = buildSourceHash({ speechIDs: ['s1', 's3'] })
    expect(h1).not.toBe(h2)
  })

  it('SHA-256 の hex 文字列が返される', () => {
    const h = buildSourceHash({ speechIDs: ['s1'] })
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('buildGenericCacheKey', () => {
  it('プロパティ順不同でも同一キーが生成される', () => {
    const k1 = buildGenericCacheKey('test', { a: 1, b: 2 })
    const k2 = buildGenericCacheKey('test', { b: 2, a: 1 })
    expect(k1).toBe(k2)
  })

  it('プレフィクス違いで異なるキーになる', () => {
    const k1 = buildGenericCacheKey('speech', { id: '001' })
    const k2 = buildGenericCacheKey('meeting', { id: '001' })
    expect(k1).not.toBe(k2)
  })
})
