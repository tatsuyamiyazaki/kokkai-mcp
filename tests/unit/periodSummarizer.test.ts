import { describe, it, expect, vi, beforeEach } from 'vitest'

// 環境変数設定
process.env['ANTHROPIC_API_KEY'] = 'test-key'

// Anthropic SDK をモック化
vi.mock('@anthropic-ai/sdk', () => {
  const createMock = vi.fn()
    // 1: チャンク要約
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ summary: '2024年のAI議論。' }) }],
    })
    // 2: 統合要約
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: '2024年は規制を中心に議論された。',
          main_points: [{ point: 'AI規制の必要性', source_ids: ['S1'] }],
          speaker_points: [],
          conclusion: { text: '規制を整備する方針。', source_ids: ['S1'] },
        }),
      }],
    })
    // 3: 論点抽出
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          topics: [
            { topic: 'AI規制', summary: '規制の必要性が議論された。', source_ids: ['S1'] },
          ],
        }),
      }],
    })
    .mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ summary: 'デフォルト要約' }) }],
    })

  return {
    default: vi.fn().mockImplementation(function () {
      return { messages: { create: createMock } }
    }),
  }
})

import { summarizePeriod } from '../../src/services/periodSummarizer.js'
import type { ComparePeriod } from '../../src/types/index.js'

const period2024: ComparePeriod = {
  label: '2024年',
  from:  '2024-01-01',
  until: '2024-12-31',
}

const mockItems = [
  {
    speechID: 'S001',
    issueID:  'I001',
    date:     '2024-03-10',
    nameOfMeeting: '衆議院予算委員会',
    speaker:  '田中大臣',
    speech:   '生成AIの規制については慎重に検討する必要があります。関係省庁と連携して対応方針を策定します。',
  },
  {
    speechID: 'S002',
    issueID:  'I001',
    date:     '2024-03-10',
    nameOfMeeting: '衆議院予算委員会',
    speaker:  '山田委員',
    speech:   '生成AIの活用を促進しながら適切な規制の枠組みを整備することが重要です。',
  },
]

describe('summarizePeriod', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('発言あり: PeriodSummary の基本構造を返す', async () => {
    const result = await summarizePeriod(period2024, mockItems, 'standard', '生成AI')

    expect(result.label).toBe('2024年')
    expect(typeof result.summary).toBe('string')
    expect(result.summary.length).toBeGreaterThan(0)
    expect(Array.isArray(result.topics)).toBe(true)
    expect(Array.isArray(result.sources)).toBe(true)
    expect(result.itemCount).toBe(2)
  })

  it('発言なし（空配列）: 空のサマリを返す（LLM 呼び出しなし）', async () => {
    const result = await summarizePeriod(period2024, [], 'standard', '生成AI')

    expect(result.label).toBe('2024年')
    expect(result.itemCount).toBe(0)
    expect(result.topics).toHaveLength(0)
    expect(result.sources).toHaveLength(0)
    // 「見つかりませんでした」を含む説明文
    expect(result.summary).toContain('見つかりませんでした')
  })

  it('発言なし: summary に期間ラベルが含まれる', async () => {
    const result = await summarizePeriod(period2024, [], 'brief', '生成AI')
    expect(result.summary).toContain('2024年')
  })
})

describe('checkItemCountDisparity', () => {
  // timeSeriesComparator の checkItemCountDisparity をテスト
  it('均衡した件数では caution が undefined', async () => {
    const { checkItemCountDisparity } = await import('../../src/services/timeSeriesComparator.js')
    const summaries = [
      { label: '2024年', summary: '', topics: [], sources: [], itemCount: 10 },
      { label: '2025年', summary: '', topics: [], sources: [], itemCount: 12 },
    ]
    const result = checkItemCountDisparity(summaries)
    expect(result).toBeUndefined()
  })

  it('3倍以上の件数差で caution テキストが返る', async () => {
    const { checkItemCountDisparity } = await import('../../src/services/timeSeriesComparator.js')
    const summaries = [
      { label: '2024年', summary: '', topics: [], sources: [], itemCount: 3 },
      { label: '2025年', summary: '', topics: [], sources: [], itemCount: 20 },
    ]
    const result = checkItemCountDisparity(summaries)
    expect(typeof result).toBe('string')
    expect(result).toContain('件数')
  })

  it('0件期間があると caution テキストが返る', async () => {
    const { checkItemCountDisparity } = await import('../../src/services/timeSeriesComparator.js')
    const summaries = [
      { label: '2023年', summary: '', topics: [], sources: [], itemCount: 0 },
      { label: '2025年', summary: '', topics: [], sources: [], itemCount: 15 },
    ]
    const result = checkItemCountDisparity(summaries)
    expect(typeof result).toBe('string')
    expect(result).toContain('2023年')
    expect(result).toContain('0件')
  })
})
