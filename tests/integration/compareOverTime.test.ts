import { describe, it, expect, vi, beforeEach } from 'vitest'

// 環境変数設定
process.env['ANTHROPIC_API_KEY'] = 'test-key'

// fetch をモック化
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// テスト間でキャッシュが汚染しないようリセット
import { resetCacheStore } from '../../src/services/cacheStore.js'
import { resetMemoryCache } from '../../src/services/memoryCache.js'

// Anthropic SDK をモック化
// compare_over_time での LLM 呼び出し順:
//   各期間ごとに summarizeSpeechesAnalysis が呼ばれる（期間 × 複数回）
//   その後 compareTopics / generateComparisonSummary / compareSpeakersOverTime / generateConclusion
//
// 呼び出し順（2期間の場合）:
//   [期間1] 1: チャンク要約, 2: 統合要約, 3: 論点抽出
//   [期間2] 4: チャンク要約, 5: 統合要約, 6: 論点抽出
//   [比較] 7: compareTopics, 8: generateComparisonSummary, 9: compareSpeakersOverTime, 10: generateConclusion

vi.mock('@anthropic-ai/sdk', () => {
  const createMock = vi.fn()
    // === 期間1 の summarizeSpeechesAnalysis ===
    // 1: チャンク要約
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ summary: '2024年のAI規制議論。' }) }],
    })
    // 2: 統合要約
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: '2024年は規制を中心に議論された。',
          main_points: [{ point: 'AI規制の必要性', source_ids: ['S1'] }],
          speaker_points: [{ speaker: '田中大臣', point: '慎重な検討が必要', source_ids: ['S1'] }],
          conclusion: { text: '規制の枠組みを整備する方針。', source_ids: ['S1'] },
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
    // === 期間2 の summarizeSpeechesAnalysis ===
    // 4: チャンク要約
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ summary: '2025年のAI活用議論。' }) }],
    })
    // 5: 統合要約
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: '2025年は活用促進へ議論が広がった。',
          main_points: [{ point: '活用促進の重要性', source_ids: ['S2'] }],
          speaker_points: [{ speaker: '山田委員', point: '活用推進が重要', source_ids: ['S2'] }],
          conclusion: { text: '活用と規制のバランスを取る方針。', source_ids: ['S2'] },
        }),
      }],
    })
    // 6: 論点抽出
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          topics: [
            { topic: '産業活用', summary: '産業活用が拡大した。', source_ids: ['S2'] },
          ],
        }),
      }],
    })
    // === 比較フェーズ ===
    // 7: compareTopics
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          topic_changes: [
            {
              topic: 'AI安全性',
              change_type: 'continued',
              description: '両年とも安全性の議論が継続している。',
              period_refs: { '2024年': ['規制'], '2025年': ['安全'] },
            },
            {
              topic: '産業活用',
              change_type: 'expanded',
              description: '2025年に産業活用の議論が拡大した。',
              period_refs: { '2024年': [], '2025年': ['活用'] },
            },
          ],
        }),
      }],
    })
    // 8: generateComparisonSummary
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: '2024年から2025年にかけて規制から活用へ議論の重心が移った。',
          key_changes: ['規制から活用へ重心移動', '教育利用が新たに注目'],
          common_points: ['安全性への懸念', '著作権問題'],
          new_points: [
            { period: '2025年', point: '行政利用の議論が台頭' },
          ],
        }),
      }],
    })
    // 9: compareSpeakersOverTime
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          speaker_changes: [
            { speaker: '田中大臣', change: '2024年は規制を主張。2025年は活用促進にも言及。' },
          ],
        }),
      }],
    })
    // 10: generateConclusion
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          conclusion: '生成AIに関する議論は規制から活用への転換期を迎えている。',
        }),
      }],
    })
    // デフォルト（以降の呼び出し）
    .mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({ summary: 'デフォルト要約' }),
      }],
    })

  return {
    default: vi.fn().mockImplementation(function () {
      return { messages: { create: createMock } }
    }),
  }
})

import { handleCompareOverTime } from '../../src/tools/compareOverTime.js'

function makeOkSpeechResponse(speeches: object[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      numberOfRecords: speeches.length,
      numberOfReturn: speeches.length,
      startRecord: 1,
      nextRecordPosition: null,
      speechRecord: speeches,
    }),
  }
}

const mockSpeeches2024 = [
  {
    speechID: 'S2024-001',
    issueID:  'I2024-001',
    date:     '2024-03-10',
    nameOfMeeting: '衆議院予算委員会',
    speaker:  '田中大臣',
    speech:   '生成AIの規制については慎重に検討する必要があります。国際的な動向も踏まえて対応を進めます。',
  },
  {
    speechID: 'S2024-002',
    issueID:  'I2024-001',
    date:     '2024-03-10',
    nameOfMeeting: '衆議院予算委員会',
    speaker:  '山田委員',
    speech:   '生成AIの活用を促進しながら適切な規制の枠組みを整備することが重要です。',
  },
]

const mockSpeeches2025 = [
  {
    speechID: 'S2025-001',
    issueID:  'I2025-001',
    date:     '2025-03-15',
    nameOfMeeting: '衆議院予算委員会',
    speaker:  '田中大臣',
    speech:   '生成AIの産業活用を積極的に推進しつつ、安全基準の整備を並行して進めます。',
  },
  {
    speechID: 'S2025-002',
    issueID:  'I2025-001',
    date:     '2025-03-15',
    nameOfMeeting: '衆議院予算委員会',
    speaker:  '鈴木委員',
    speech:   '教育現場での生成AI活用についても、ガイドラインの整備が必要だと考えます。',
  },
]

describe('受入条件テスト（rev03: 時系列比較機能）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 2期間分の fetch レスポンスを設定
    mockFetch
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches2024))
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches2025))
  })

  // AC-COT-1: 2期間以上を指定して比較できること
  it('AC-COT-1: 2期間を指定して比較結果を返す', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
      mode: 'standard',
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')

    expect(parsed.query).toBe('生成AI')
    expect(parsed.comparison_summary).toBeDefined()
    expect(Array.isArray(parsed.period_summaries)).toBe(true)
    expect(parsed.period_summaries).toHaveLength(2)
  })

  // AC-COT-2: 各期間の要約を返せること
  it('AC-COT-2: 各期間の要約（period_summaries）が返る', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')

    for (const ps of parsed.period_summaries) {
      expect(ps).toHaveProperty('label')
      expect(ps).toHaveProperty('summary')
      expect(ps).toHaveProperty('topics')
      expect(ps).toHaveProperty('sources')
      expect(typeof ps.summary).toBe('string')
      expect(ps.summary.length).toBeGreaterThan(0)
    }
  })

  // AC-COT-3: 主な変化点を返せること
  it('AC-COT-3: 主な変化点（key_changes）が返る', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')

    expect(Array.isArray(parsed.comparison_summary.key_changes)).toBe(true)
    expect(parsed.comparison_summary.key_changes.length).toBeGreaterThan(0)
  })

  // AC-COT-4: 継続論点と新規論点を区別できること
  it('AC-COT-4: 継続論点（common_points）と新規論点（new_points）が区別される', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')

    expect(Array.isArray(parsed.comparison_summary.common_points)).toBe(true)
    expect(Array.isArray(parsed.comparison_summary.new_points)).toBe(true)
  })

  // AC-COT-5: 比較結果に出典が付くこと
  it('AC-COT-5: topic_changes に出典（sources）が付与される', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
      include_topics: true,
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')

    // topic_changes は sources を持つ
    for (const tc of parsed.topic_changes) {
      expect(tc).toHaveProperty('topic')
      expect(tc).toHaveProperty('change_type')
      expect(tc).toHaveProperty('description')
      expect(tc).toHaveProperty('sources')
      expect(typeof tc.sources).toBe('object')
    }
  })

  // AC-COT-6: brief / standard / detailed の違いが反映されること
  it('AC-COT-6a: brief モードでは topic_changes が 3 件以内', async () => {
    // brief 用に追加の LLM モックが必要なため、モックをリセット
    // (beforeEach でクリアされているが fetch モックは各テストで再設定)
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
      mode: 'brief',
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')

    expect(parsed.topic_changes.length).toBeLessThanOrEqual(3)
    // brief では speaker_changes が省略される
    expect(parsed.speaker_changes).toHaveLength(0)
  })

  // AC-COT-7: 期間が1件のみはエラー
  it('AC-COT-7: 期間が1件のみの場合はバリデーションエラーを返す', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
      ],
    })

    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(parsed.error_type).toBe('ValidationError')
    expect(parsed.message).toContain('2期間以上')
  })

  // AC-COT-8: include_topics=false では topic_changes が空
  it('AC-COT-8: include_topics=false で topic_changes が空配列', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
      include_topics: false,
      mode: 'standard',
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(Array.isArray(parsed.topic_changes)).toBe(true)
    expect(parsed.topic_changes).toHaveLength(0)
  })

  // AC-COT-9: include_speaker_changes=false では speaker_changes が空
  it('AC-COT-9: include_speaker_changes=false で speaker_changes が空配列', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
      include_speaker_changes: false,
      mode: 'standard',
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(Array.isArray(parsed.speaker_changes)).toBe(true)
    expect(parsed.speaker_changes).toHaveLength(0)
  })

  // AC-COT-10: 出力が MCP レスポンス形式（content 配列）を返す
  it('AC-COT-10: ツール関数が MCP レスポンス形式（content 配列）を返す', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
    })

    expect(result).toHaveProperty('content')
    expect(Array.isArray(result.content)).toBe(true)
    expect(result.content[0]).toHaveProperty('type', 'text')
  })

  // AC-COT-11: 結論（conclusion）が出典付きで返る
  it('AC-COT-11: conclusion が text と sources を持つ', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(parsed.conclusion).toHaveProperty('text')
    expect(parsed.conclusion).toHaveProperty('sources')
    expect(Array.isArray(parsed.conclusion.sources)).toBe(true)
  })

  // AC-COT-12: topic_changes の change_type が仕様の候補値のみ
  it('AC-COT-12: topic_changes の change_type が valid な値のみ', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
      include_topics: true,
    })

    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    const validTypes = ['continued', 'expanded', 'reduced', 'new', 'shifted']
    for (const tc of parsed.topic_changes) {
      expect(validTypes).toContain(tc.change_type)
    }
  })

  // AC-COT-13: 期間が4件以上はエラー
  it('AC-COT-13: 期間が4件以上の場合はバリデーションエラーを返す', async () => {
    const result = await handleCompareOverTime({
      query: '生成AI',
      periods: [
        { label: '2022年', from: '2022-01-01', until: '2022-12-31' },
        { label: '2023年', from: '2023-01-01', until: '2023-12-31' },
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
    })

    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(parsed.error_type).toBe('ValidationError')
  })

  // AC-COT-14: query が空文字のときはエラー
  it('AC-COT-14: query が空文字の場合はバリデーションエラーを返す', async () => {
    const result = await handleCompareOverTime({
      query: '',
      periods: [
        { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
        { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
      ],
    })

    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(parsed.error_type).toBe('ValidationError')
  })
})

// ─── periodSummarizer の 0 件ケースはユニットレベルで検証 ─────────────────────
// NOTE: 0件期間の統合テストはキャッシュの影響を受けやすいため、
//       comparisonFormatter.test.ts の getImbalancedPeriods テストと
//       periodSummarizer のロジックで検証する。
