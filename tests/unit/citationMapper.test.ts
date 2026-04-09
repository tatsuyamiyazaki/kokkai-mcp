import { describe, it, expect } from 'vitest'
import {
  generateExcerpt,
  toSourceInfo,
  resolveSourceIds,
  itemsToSources,
  assignSpeechIds,
  formatSpeechesWithIds,
  parseJsonResponse,
} from '../../src/services/citationMapper.js'
import type { SpeechItem } from '../../src/types/index.js'

function makeSpeech(overrides: Partial<SpeechItem> = {}): SpeechItem {
  return {
    speechID: 'SP001',
    issueID: 'I001',
    date: '2024-01-15',
    nameOfMeeting: '衆議院予算委員会',
    speaker: '田中委員',
    speech: 'テスト発言内容',
    ...overrides,
  }
}

describe('generateExcerpt', () => {
  it('300文字以内のテキストはそのまま返る', () => {
    const text = 'これは短い発言です。'
    expect(generateExcerpt(text)).toBe(text)
  })

  it('300文字を超えるテキストは切り詰める', () => {
    const text = 'あ'.repeat(500)
    const result = generateExcerpt(text)
    expect(result.length).toBeLessThanOrEqual(301)
  })

  it('句読点で切り詰める', () => {
    const text = '最初の文。' + 'い'.repeat(300)
    const result = generateExcerpt(text)
    expect(result.length).toBeLessThan(text.length)
  })

  it('改行・連続空白を整形する', () => {
    const text = '発言内容\n\n  詳細  \n改行'
    const result = generateExcerpt(text)
    expect(result).not.toContain('\n')
  })
})

describe('toSourceInfo', () => {
  it('SpeechItem から SourceInfo に変換される', () => {
    const item = makeSpeech()
    const source = toSourceInfo(item)
    expect(source.speechID).toBe('SP001')
    expect(source.issueID).toBe('I001')
    expect(source.speaker).toBe('田中委員')
    expect(source.date).toBe('2024-01-15')
    expect(source.nameOfMeeting).toBe('衆議院予算委員会')
    expect(typeof source.excerpt).toBe('string')
  })

  it('date が undefined の場合は空文字になる', () => {
    const item = makeSpeech({ date: undefined })
    const source = toSourceInfo(item)
    expect(source.date).toBe('')
  })
})

describe('resolveSourceIds', () => {
  it('有効な source_ids を SourceInfo[] に変換する', () => {
    const item = makeSpeech()
    const idMap = new Map([['S1', item]])
    const result = resolveSourceIds(['S1'], idMap, 3)
    expect(result).toHaveLength(1)
    expect(result[0]?.speechID).toBe('SP001')
  })

  it('存在しない ID は無視される', () => {
    const idMap = new Map<string, SpeechItem>()
    const result = resolveSourceIds(['S999', 'INVALID'], idMap, 3)
    expect(result).toHaveLength(0)
  })

  it('maxSources で件数が制限される', () => {
    const items = ['S1', 'S2', 'S3'].map((id, i) =>
      [id, makeSpeech({ speechID: `SP00${i + 1}` })] as [string, SpeechItem],
    )
    const idMap = new Map(items)
    const result = resolveSourceIds(['S1', 'S2', 'S3'], idMap, 2)
    expect(result).toHaveLength(2)
  })

  it('source_ids が配列でない場合は空配列を返す', () => {
    const idMap = new Map<string, SpeechItem>()
    expect(resolveSourceIds(null, idMap, 3)).toHaveLength(0)
    expect(resolveSourceIds('S1', idMap, 3)).toHaveLength(0)
    expect(resolveSourceIds(undefined, idMap, 3)).toHaveLength(0)
  })
})

describe('itemsToSources', () => {
  it('発言リストを SourceInfo[] に変換する', () => {
    const items = [makeSpeech({ speechID: 'SP001' }), makeSpeech({ speechID: 'SP002' })]
    const result = itemsToSources(items, 3)
    expect(result).toHaveLength(2)
    expect(result[0]?.speechID).toBe('SP001')
  })

  it('maxSources で件数が制限される', () => {
    const items = [1, 2, 3].map((i) => makeSpeech({ speechID: `SP00${i}` }))
    const result = itemsToSources(items, 2)
    expect(result).toHaveLength(2)
  })
})

describe('assignSpeechIds', () => {
  it('発言リストに S1, S2... の ID が付与される', () => {
    const items = [makeSpeech({ speechID: 'A1' }), makeSpeech({ speechID: 'A2' })]
    const map = assignSpeechIds(items)
    expect(map.get('S1')?.speechID).toBe('A1')
    expect(map.get('S2')?.speechID).toBe('A2')
  })
})

describe('formatSpeechesWithIds', () => {
  it('[S1] 発言者「...」 形式のテキストを返す', () => {
    const item = makeSpeech({ speaker: '山田委員', speech: '発言内容' })
    const map = new Map([['S1', item]])
    const text = formatSpeechesWithIds(map)
    expect(text).toContain('[S1]')
    expect(text).toContain('山田委員')
    expect(text).toContain('発言内容')
  })
})

describe('parseJsonResponse', () => {
  it('JSON 文字列をパースする', () => {
    const text = '{"key": "value"}'
    const result = parseJsonResponse(text)
    expect(result['key']).toBe('value')
  })

  it('コードブロック内の JSON をパースする', () => {
    const text = '```json\n{"key": "value"}\n```'
    const result = parseJsonResponse(text)
    expect(result['key']).toBe('value')
  })

  it('パース失敗時は空オブジェクトを返す', () => {
    const result = parseJsonResponse('invalid json }{')
    expect(result).toEqual({})
  })
})
