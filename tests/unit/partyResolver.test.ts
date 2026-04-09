import { describe, it, expect } from 'vitest'
import {
  resolveParty,
  attachParty,
  groupByParty,
  getMajorParties,
  UNKNOWN_PARTY,
  GOVERNMENT_PARTY,
} from '../../src/services/partyResolver.js'
import type { SpeechItem } from '../../src/types/index.js'

function makeSpeech(overrides: Partial<SpeechItem> = {}): SpeechItem {
  return {
    speechID: 'test-001',
    issueID: 'I001',
    date: '2024-01-01',
    nameOfMeeting: 'テスト委員会',
    speaker: '田中委員',
    speech: 'テスト発言',
    ...overrides,
  }
}

describe('resolveParty', () => {
  it('大臣を含む発言者は政府・行政と判定される', () => {
    expect(resolveParty('山田大臣')).toBe(GOVERNMENT_PARTY)
  })

  it('自民党を含む発言者は自由民主党と判定される', () => {
    expect(resolveParty('田中太郎（自民党）')).toBe('自由民主党')
  })

  it('立憲民主党を含む発言者は立憲民主党と判定される', () => {
    expect(resolveParty('山田花子（立憲民主党）')).toBe('立憲民主党')
  })

  it('公明を含む発言者は公明党と判定される', () => {
    expect(resolveParty('鈴木委員（公明）')).toBe('公明党')
  })

  it('維新を含む発言者は日本維新の会と判定される', () => {
    expect(resolveParty('佐藤（維新）')).toBe('日本維新の会')
  })

  it('政党情報がない発言者は無所属・不明と判定される', () => {
    expect(resolveParty('田中委員')).toBe(UNKNOWN_PARTY)
  })

  it('括弧内に政党名がある場合は正規化される', () => {
    expect(resolveParty('中村太郎（共産党）')).toBe('日本共産党')
  })
})

describe('attachParty', () => {
  it('発言リストに政党情報が付与される', () => {
    const items = [
      makeSpeech({ speaker: '田中大臣', speechID: 'S1' }),
      makeSpeech({ speaker: '山田委員（自民党）', speechID: 'S2' }),
    ]
    const result = attachParty(items)
    expect(result[0]?.party).toBe(GOVERNMENT_PARTY)
    expect(result[1]?.party).toBe('自由民主党')
  })

  it('空の配列を渡すと空の配列が返る', () => {
    expect(attachParty([])).toHaveLength(0)
  })
})

describe('groupByParty', () => {
  it('政党別にグループ化される', () => {
    const items = [
      { ...makeSpeech({ speechID: 'S1' }), party: '自由民主党' },
      { ...makeSpeech({ speechID: 'S2' }), party: '立憲民主党' },
      { ...makeSpeech({ speechID: 'S3' }), party: '自由民主党' },
    ]
    const result = groupByParty(items)
    expect(result.get('自由民主党')).toHaveLength(2)
    expect(result.get('立憲民主党')).toHaveLength(1)
  })
})

describe('getMajorParties', () => {
  it('政府・行政を除いた政党一覧が返る', () => {
    const items = [
      { ...makeSpeech({ speechID: 'S1' }), party: '自由民主党' },
      { ...makeSpeech({ speechID: 'S2' }), party: GOVERNMENT_PARTY },
      { ...makeSpeech({ speechID: 'S3' }), party: '立憲民主党' },
    ]
    const groups = groupByParty(items)
    const parties = getMajorParties(groups)
    expect(parties).toContain('自由民主党')
    expect(parties).toContain('立憲民主党')
    expect(parties).not.toContain(GOVERNMENT_PARTY)
  })
})
