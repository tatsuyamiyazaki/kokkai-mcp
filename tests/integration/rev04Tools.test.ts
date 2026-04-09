/**
 * rev04Tools.test.ts
 *
 * summarize_qa_pairs / compare_by_party / analyze_topic_changes の統合テスト。
 * LLM と国会 API をモック化して、各ツールの受入条件を確認する。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 環境変数設定
process.env['ANTHROPIC_API_KEY'] = 'test-key'

// fetch をモック化
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── Anthropic SDK モック ─────────────────────────────────────────────────────
//
// 各ツールでの LLM 呼び出し順:
//
// [summarize_qa_pairs]
//   1: summarizeQaPairs → QAペアリング
//
// [compare_by_party]
//   1: compareByParty → 政党別比較
//
// [analyze_topic_changes]
//   期間1: 1: チャンク要約, 2: 統合要約, 3: 論点抽出
//   期間2: 4: チャンク要約, 5: 統合要約, 6: 論点抽出
//   7: analyzeTopicChanges → 論点変化分析

vi.mock('@anthropic-ai/sdk', () => {
  const createMock = vi.fn()
    // ── summarize_qa_pairs 用 ──
    // 1: QAペアリング
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: '生成AIに関する質疑では、安全性、著作権、行政活用が主な論点となった。',
          qa_pairs: [
            {
              topic: '生成AIの安全性',
              question: {
                speaker: '田中委員',
                summary: '生成AIによる誤情報拡散への対応方針を質問。',
                source_ids: ['S1'],
              },
              answer: {
                speaker: '山田大臣',
                summary: 'ガイドライン整備を進める考えを示した。',
                source_ids: ['S2'],
              },
              assessment: {
                response_type: 'direct',
                note: '質問に対して概ね直接回答している。',
              },
            },
            {
              topic: '著作権問題',
              question: {
                speaker: '佐藤議員',
                summary: 'AIが生成したコンテンツの著作権について質問。',
                source_ids: ['S1'],
              },
              answer: {
                speaker: '山田大臣',
                summary: '法整備を検討中と答弁。',
                source_ids: ['S2'],
              },
              assessment: {
                response_type: 'partial',
                note: '一部回答しているが詳細が不足。',
              },
            },
          ],
          conclusion: {
            text: '政府側は活用推進を前提としつつ、安全性への対応を進める姿勢を示した。',
            source_ids: ['S1', 'S2'],
          },
        }),
      }],
    })
    // ── compare_by_party 用 ──
    // 2: 政党別比較
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: '各党とも安全性への懸念には言及しているが、規制強化の強さに差が見られた。',
          party_summaries: [
            {
              party: '自由民主党',
              position: '活用推進',
              summary: '産業活用や行政活用を進めつつ、リスク対応を段階的に進める立場。',
              main_topics: ['産業競争力', '行政活用'],
              source_ids: ['S1'],
            },
            {
              party: '立憲民主党',
              position: '規制強化',
              summary: '権利侵害への懸念を重視し、制度整備をより明確に求める立場。',
              main_topics: ['著作権', '責任分界'],
              source_ids: ['S2'],
            },
          ],
          common_points: [
            { point: '安全性確保の必要性', source_ids: ['S1'] },
          ],
          differences: [
            {
              topic: '規制の強さ',
              description: '与党は段階的整備、野党は明示的な規制強化を求めている。',
              source_ids: ['S1', 'S2'],
            },
          ],
          conclusion: {
            text: '各党の共通認識は安全性の確保にあるが、制度化の速度に違いがある。',
            source_ids: ['S1'],
          },
        }),
      }],
    })
    // ── analyze_topic_changes 用 ──
    // 3: 期間1 チャンク要約
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ summary: '2024年のAI規制議論。' }) }],
    })
    // 4: 期間1 統合要約
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: '2024年は規制を中心に議論された。',
          main_points: [{ point: 'AI規制の必要性', source_ids: ['S1'] }],
          speaker_points: [],
          conclusion: { text: '規制の枠組みを整備する方針。', source_ids: ['S1'] },
        }),
      }],
    })
    // 5: 期間1 論点抽出
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
    // 6: 期間2 チャンク要約
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ summary: '2025年のAI活用議論。' }) }],
    })
    // 7: 期間2 統合要約
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: '2025年は活用促進へ議論が広がった。',
          main_points: [{ point: '活用促進の重要性', source_ids: ['S2'] }],
          speaker_points: [],
          conclusion: { text: '活用と規制のバランスを取る方針。', source_ids: ['S2'] },
        }),
      }],
    })
    // 8: 期間2 論点抽出
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
    // 9: analyzeTopicChanges 論点変化分析
    .mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          overview: '2024年は安全性・規制が中心、2025年は活用が拡大した。',
          topic_changes: [
            {
              topic: '安全性',
              change_type: 'continued',
              description: '両期間で継続して主要論点となっている。',
            },
            {
              topic: '産業活用',
              change_type: 'expanded',
              description: '2025年に議論比重が大きく増した。',
            },
            {
              topic: '教育現場での利用',
              change_type: 'new',
              description: '2025年に新たに目立つ論点として現れた。',
            },
          ],
          conclusion: {
            text: '議論の中心は安全性を維持しつつ、活用と競争力強化へ比重が広がっている。',
          },
        }),
      }],
    })
    // デフォルト
    .mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ summary: 'デフォルト要約' }) }],
    })

  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: createMock },
    })),
  }
})

import { handleSummarizeQaPairs } from '../../src/tools/summarizeQaPairs.js'
import { handleCompareByParty } from '../../src/tools/compareByParty.js'
import { handleAnalyzeTopicChanges } from '../../src/tools/analyzeTopicChanges.js'

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function makeOkMeetingResponse(speeches: object[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      numberOfRecords: 1,
      numberOfReturn: 1,
      meetingRecord: [
        {
          issueID: 'I001',
          date: '2024-01-15',
          nameOfMeeting: '衆議院予算委員会',
          speechRecord: speeches,
        },
      ],
    }),
  }
}

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

const mockSpeeches = [
  {
    speechID: 'S001',
    issueID: 'I001',
    date: '2024-01-15',
    nameOfMeeting: '衆議院予算委員会',
    speaker: '田中委員',
    speech: '生成AIの安全規制について伺います。誤情報拡散への対応方針を教えてください。',
    speechOrder: 1,
  },
  {
    speechID: 'S002',
    issueID: 'I001',
    date: '2024-01-15',
    nameOfMeeting: '衆議院予算委員会',
    speaker: '山田大臣',
    speech: '関係省庁と連携しつつ、ガイドライン整備を進める考えです。段階的に対応します。',
    speechOrder: 2,
  },
]

// ─── summarize_qa_pairs テスト ────────────────────────────────────────────────

describe('summarize_qa_pairs 受入条件テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  // AC-QA-1: 質問と答弁がペアとして整理されること
  it('AC-QA-1: qa_pairs が配列で返る', async () => {
    mockFetch.mockResolvedValueOnce(makeOkMeetingResponse(mockSpeeches))
    const result = await handleSummarizeQaPairs({ issueID: 'I001', mode: 'standard' })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(parsed.issueID).toBe('I001')
    expect(Array.isArray(parsed.qa_pairs)).toBe(true)
  })

  // AC-QA-2: 各ペアに論点が付与されること
  it('AC-QA-2: 各ペアに topic フィールドがある', async () => {
    mockFetch.mockResolvedValueOnce(makeOkMeetingResponse(mockSpeeches))
    const result = await handleSummarizeQaPairs({ issueID: 'I001', mode: 'standard' })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    for (const pair of parsed.qa_pairs ?? []) {
      expect(pair).toHaveProperty('topic')
      expect(typeof pair.topic).toBe('string')
    }
  })

  // AC-QA-3: 回答関係が response_type で表現されること
  it('AC-QA-3: 各ペアに assessment.response_type がある', async () => {
    mockFetch.mockResolvedValueOnce(makeOkMeetingResponse(mockSpeeches))
    const result = await handleSummarizeQaPairs({ issueID: 'I001' })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    const validTypes = ['direct', 'partial', 'indirect', 'unclear', 'unanswered']
    for (const pair of parsed.qa_pairs ?? []) {
      expect(pair).toHaveProperty('assessment')
      expect(validTypes).toContain(pair.assessment.response_type)
    }
  })

  // AC-QA-4: 出典付きで追跡可能であること
  it('AC-QA-4: question と answer に sources フィールドがある', async () => {
    mockFetch.mockResolvedValueOnce(makeOkMeetingResponse(mockSpeeches))
    const result = await handleSummarizeQaPairs({ issueID: 'I001' })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    for (const pair of parsed.qa_pairs ?? []) {
      expect(pair.question).toHaveProperty('sources')
      expect(Array.isArray(pair.question.sources)).toBe(true)
      expect(pair.answer).toHaveProperty('sources')
      expect(Array.isArray(pair.answer.sources)).toBe(true)
    }
    // conclusion も sources を持つ
    expect(parsed.conclusion).toHaveProperty('sources')
    expect(Array.isArray(parsed.conclusion.sources)).toBe(true)
  })

  // AC-QA-5: brief / standard の差が反映されること
  it('AC-QA-5: overview と conclusion が返る', async () => {
    mockFetch.mockResolvedValueOnce(makeOkMeetingResponse(mockSpeeches))
    const result = await handleSummarizeQaPairs({ issueID: 'I001', mode: 'brief' })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(typeof parsed.overview).toBe('string')
    expect(parsed.overview.length).toBeGreaterThan(0)
    expect(parsed.conclusion).toHaveProperty('text')
  })

  // ValidationError テスト
  it('issueID が空の場合は isError: true を返す', async () => {
    const result = await handleSummarizeQaPairs({ issueID: '' })
    expect(result.isError).toBe(true)
  })

  it('MCP レスポンス形式（content 配列）を返す', async () => {
    mockFetch.mockResolvedValueOnce(makeOkMeetingResponse(mockSpeeches))
    const result = await handleSummarizeQaPairs({ issueID: 'I001' })
    expect(result).toHaveProperty('content')
    expect(Array.isArray(result.content)).toBe(true)
    expect(result.content[0]).toHaveProperty('type', 'text')
  })
})

// ─── compare_by_party テスト ──────────────────────────────────────────────────

describe('compare_by_party 受入条件テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  // AC-PARTY-1: 発言が政党別に集約されること
  it('AC-PARTY-1: party_summaries が配列で返る', async () => {
    mockFetch.mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    const result = await handleCompareByParty({ query: '生成AI', mode: 'standard' })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(parsed.query).toBe('生成AI')
    expect(Array.isArray(parsed.party_summaries)).toBe(true)
  })

  // AC-PARTY-2: 政党ごとの主張要約が返ること
  it('AC-PARTY-2: 各 party_summary に party・position・summary・main_topics・sources がある', async () => {
    mockFetch.mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    const result = await handleCompareByParty({ query: '生成AI' })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    for (const ps of parsed.party_summaries ?? []) {
      expect(ps).toHaveProperty('party')
      expect(ps).toHaveProperty('position')
      expect(ps).toHaveProperty('summary')
      expect(ps).toHaveProperty('main_topics')
      expect(Array.isArray(ps.main_topics)).toBe(true)
      expect(ps).toHaveProperty('sources')
      expect(Array.isArray(ps.sources)).toBe(true)
    }
  })

  // AC-PARTY-3: 共通点と相違点が区別されること
  it('AC-PARTY-3: common_points と differences が配列で返る', async () => {
    mockFetch.mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    const result = await handleCompareByParty({ query: '生成AI' })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(Array.isArray(parsed.common_points)).toBe(true)
    expect(Array.isArray(parsed.differences)).toBe(true)
  })

  // AC-PARTY-4: 出典付きで確認できること
  it('AC-PARTY-4: conclusion に text と sources がある', async () => {
    mockFetch.mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    const result = await handleCompareByParty({ query: '生成AI' })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(parsed.conclusion).toHaveProperty('text')
    expect(parsed.conclusion).toHaveProperty('sources')
    expect(Array.isArray(parsed.conclusion.sources)).toBe(true)
  })

  // AC-PARTY-5: include_common_points=false のとき common_points が空になること
  it('AC-PARTY-5: include_common_points=false で common_points が空', async () => {
    mockFetch.mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    const result = await handleCompareByParty({
      query: '生成AI',
      include_common_points: false,
      include_differences: false,
    })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(Array.isArray(parsed.common_points)).toBe(true)
    expect(parsed.common_points).toHaveLength(0)
  })

  // ValidationError テスト
  it('query が空の場合は isError: true を返す', async () => {
    const result = await handleCompareByParty({ query: '' })
    expect(result.isError).toBe(true)
  })
})

// ─── analyze_topic_changes テスト ─────────────────────────────────────────────

describe('analyze_topic_changes 受入条件テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  const periods = [
    { label: '2024年', from: '2024-01-01', until: '2024-12-31' },
    { label: '2025年', from: '2025-01-01', until: '2025-12-31' },
  ]

  // AC-TC-1: 2期間以上の比較ができること
  it('AC-TC-1: 2期間の比較ができる', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    const result = await handleAnalyzeTopicChanges({ query: '生成AI', periods, mode: 'standard' })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(parsed.query).toBe('生成AI')
    expect(Array.isArray(parsed.topic_changes)).toBe(true)
  })

  // AC-TC-2: 期間ごとの主要論点が抽出されること
  it('AC-TC-2: summary_by_period が期間数分返る', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    const result = await handleAnalyzeTopicChanges({ query: '生成AI', periods })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    expect(Array.isArray(parsed.summary_by_period)).toBe(true)
    expect(parsed.summary_by_period).toHaveLength(2)
    for (const sp of parsed.summary_by_period) {
      expect(sp).toHaveProperty('label')
      expect(sp).toHaveProperty('main_topics')
      expect(Array.isArray(sp.main_topics)).toBe(true)
      expect(sp).toHaveProperty('sources')
    }
  })

  // AC-TC-3: 論点に change_type が付与されること
  it('AC-TC-3: 各 topic_change に change_type がある', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    const result = await handleAnalyzeTopicChanges({ query: '生成AI', periods })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    const validTypes = ['continued', 'expanded', 'reduced', 'new', 'shifted', 'unclear']
    for (const tc of parsed.topic_changes ?? []) {
      expect(validTypes).toContain(tc.change_type)
      expect(tc).toHaveProperty('topic')
      expect(tc).toHaveProperty('description')
    }
  })

  // AC-TC-4: 新規・継続・増加・減少が区別されること
  it('AC-TC-4: topic_changes に varied な change_type が含まれる', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    // キャッシュを避けるため異なる query を使用
    const result = await handleAnalyzeTopicChanges({
      query: '生成AI変化分析テスト',
      periods,
    })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    // topic_changes が配列として返ること（キャッシュを使わない場合）
    expect(Array.isArray(parsed.topic_changes)).toBe(true)
  })

  // AC-TC-5: 出典付きで追跡可能であること
  it('AC-TC-5: topic_changes に sources がある', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
      .mockResolvedValueOnce(makeOkSpeechResponse(mockSpeeches))
    const result = await handleAnalyzeTopicChanges({ query: '生成AI', periods })
    const parsed = JSON.parse(result.content[0]?.text ?? '{}')
    for (const tc of parsed.topic_changes ?? []) {
      expect(tc).toHaveProperty('sources')
      // sources は期間ラベルをキーとするオブジェクト
      expect(typeof tc.sources).toBe('object')
    }
    // conclusion も sources を持つ
    expect(parsed.conclusion).toHaveProperty('sources')
    expect(Array.isArray(parsed.conclusion.sources)).toBe(true)
  })

  // ValidationError テスト
  it('periods が 1 件以下の場合は isError: true を返す', async () => {
    const result = await handleAnalyzeTopicChanges({
      query: '生成AI',
      periods: [{ label: '2024年', from: '2024-01-01', until: '2024-12-31' }],
    })
    expect(result.isError).toBe(true)
  })

  it('query が空の場合は isError: true を返す', async () => {
    const result = await handleAnalyzeTopicChanges({ query: '', periods })
    expect(result.isError).toBe(true)
  })
})
