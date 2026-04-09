import { describe, it, expect } from 'vitest'
import {
  formatCompareResult,
  formatCompareResultAsMarkdown,
  getImbalancedPeriods,
  groupTopicChangesByType,
} from '../../src/services/comparisonFormatter.js'
import type { CompareOverTimeResult, TopicChange, PeriodSummary } from '../../src/types/index.js'

// ─── テストデータ ─────────────────────────────────────────────────────────────

const makeResult = (overrides: Partial<CompareOverTimeResult> = {}): CompareOverTimeResult => ({
  query: '生成AI',
  comparison_summary: {
    overview: '2024年と2025年で議論の重心が変化した。',
    key_changes: ['変化1', '変化2', '変化3', '変化4', '変化5', '変化6'],
    common_points: ['継続1', '継続2', '継続3', '継続4', '継続5', '継続6'],
    new_points: [
      { period: '2025年', point: '新論点A', sources: [] },
      { period: '2025年', point: '新論点B', sources: [] },
      { period: '2025年', point: '新論点C', sources: [] },
      { period: '2025年', point: '新論点D', sources: [] },
      { period: '2025年', point: '新論点E', sources: [] },
      { period: '2025年', point: '新論点F', sources: [] },
    ],
  },
  period_summaries: [
    {
      label: '2024年', summary: '2024年の要約。', topics: [
        { topic: 'AI規制', summary: '規制が議論された。', sources: [] },
      ], sources: [], itemCount: 10,
    },
    {
      label: '2025年', summary: '2025年の要約。', topics: [
        { topic: '活用促進', summary: '活用が議論された。', sources: [] },
      ], sources: [], itemCount: 10,
    },
  ],
  topic_changes: [
    { topic: 'AI規制', change_type: 'continued', description: '継続して議論された。', sources: {} },
    { topic: '産業活用', change_type: 'expanded', description: '拡大した。', sources: {} },
    { topic: '著作権', change_type: 'reduced', description: '減少した。', sources: {} },
    { topic: '教育利用', change_type: 'new', description: '新規登場。', sources: {} },
    { topic: '規制と活用', change_type: 'shifted', description: '重心移動。', sources: {} },
    { topic: '国際連携', change_type: 'expanded', description: '拡大。', sources: {} },
    { topic: '安全保障', change_type: 'new', description: '新規。', sources: {} },
  ],
  speaker_changes: [
    { speaker: '田中大臣', change: '規制から活用へ。', sources: {} },
    { speaker: '山田委員', change: '反対から賛成へ。', sources: {} },
  ],
  conclusion: { text: '議論の重心が変化した。', sources: [] },
  ...overrides,
})

// ─── formatCompareResult: brief ──────────────────────────────────────────────

describe('formatCompareResult: brief モード', () => {
  it('key_changes が 3 件以内に絞られる', () => {
    const result = formatCompareResult(makeResult(), 'brief')
    expect(result.comparison_summary.key_changes.length).toBeLessThanOrEqual(3)
  })

  it('topic_changes が 3 件以内に絞られる', () => {
    const result = formatCompareResult(makeResult(), 'brief')
    expect(result.topic_changes.length).toBeLessThanOrEqual(3)
  })

  it('speaker_changes が空配列になる（brief では省略）', () => {
    const result = formatCompareResult(makeResult(), 'brief')
    expect(result.speaker_changes).toHaveLength(0)
  })

  it('period_summaries の topics が空になる（brief では論点詳細省略）', () => {
    const result = formatCompareResult(makeResult(), 'brief')
    for (const ps of result.period_summaries) {
      expect(ps.topics).toHaveLength(0)
    }
  })

  it('common_points が 2 件以内に絞られる', () => {
    const result = formatCompareResult(makeResult(), 'brief')
    expect(result.comparison_summary.common_points.length).toBeLessThanOrEqual(2)
  })
})

// ─── formatCompareResult: standard ───────────────────────────────────────────

describe('formatCompareResult: standard モード', () => {
  it('key_changes が 5 件以内に絞られる', () => {
    const result = formatCompareResult(makeResult(), 'standard')
    expect(result.comparison_summary.key_changes.length).toBeLessThanOrEqual(5)
  })

  it('topic_changes が 6 件以内に絞られる', () => {
    const result = formatCompareResult(makeResult(), 'standard')
    expect(result.topic_changes.length).toBeLessThanOrEqual(6)
  })

  it('speaker_changes はそのまま保持される', () => {
    const result = formatCompareResult(makeResult(), 'standard')
    expect(result.speaker_changes.length).toBeGreaterThan(0)
  })
})

// ─── formatCompareResult: detailed ───────────────────────────────────────────

describe('formatCompareResult: detailed モード', () => {
  it('加工なし（フル出力）', () => {
    const original = makeResult()
    const result = formatCompareResult(original, 'detailed')
    expect(result.topic_changes.length).toBe(original.topic_changes.length)
    expect(result.speaker_changes.length).toBe(original.speaker_changes.length)
    expect(result.comparison_summary.key_changes.length).toBe(original.comparison_summary.key_changes.length)
  })
})

// ─── formatCompareResultAsMarkdown ───────────────────────────────────────────

describe('formatCompareResultAsMarkdown', () => {
  it('全セクションヘッダーを含む', () => {
    const md = formatCompareResultAsMarkdown(makeResult())
    expect(md).toContain('■ 比較概要')
    expect(md).toContain('■ 期間ごとの要約')
    expect(md).toContain('■ 主な変化点')
    expect(md).toContain('■ 継続している論点')
    expect(md).toContain('■ 新たに目立った論点')
    expect(md).toContain('■ 結論')
  })

  it('期間ラベルが含まれる', () => {
    const md = formatCompareResultAsMarkdown(makeResult())
    expect(md).toContain('2024年')
    expect(md).toContain('2025年')
  })

  it('発言者変化がある場合は発言者変化セクションを含む', () => {
    const md = formatCompareResultAsMarkdown(makeResult())
    expect(md).toContain('■ 発言者の変化')
    expect(md).toContain('田中大臣')
  })

  it('発言者変化が空の場合は発言者変化セクションを含まない', () => {
    const result = makeResult({ speaker_changes: [] })
    const md = formatCompareResultAsMarkdown(result)
    expect(md).not.toContain('■ 発言者の変化')
  })

  it('caution がある場合は注記を含む', () => {
    const result = makeResult({ caution: '精度注意' })
    const md = formatCompareResultAsMarkdown(result)
    expect(md).toContain('※ 精度注意')
  })
})

// ─── getImbalancedPeriods ─────────────────────────────────────────────────────

describe('getImbalancedPeriods', () => {
  it('均衡した件数は空配列を返す', () => {
    const periods: Pick<PeriodSummary, 'label' | 'itemCount'>[] = [
      { label: '2024年', itemCount: 10 },
      { label: '2025年', itemCount: 12 },
    ]
    expect(getImbalancedPeriods(periods)).toHaveLength(0)
  })

  it('3倍以上の差がある場合は少ない方の期間ラベルを返す', () => {
    const periods: Pick<PeriodSummary, 'label' | 'itemCount'>[] = [
      { label: '2024年', itemCount: 2 },
      { label: '2025年', itemCount: 20 },
    ]
    const result = getImbalancedPeriods(periods)
    expect(result).toContain('2024年')
  })

  it('0件の期間は不均衡として検出される', () => {
    const periods: Pick<PeriodSummary, 'label' | 'itemCount'>[] = [
      { label: '2024年', itemCount: 0 },
      { label: '2025年', itemCount: 15 },
    ]
    const result = getImbalancedPeriods(periods)
    expect(result).toContain('2024年')
  })
})

// ─── groupTopicChangesByType ──────────────────────────────────────────────────

describe('groupTopicChangesByType', () => {
  const topicChanges: TopicChange[] = [
    { topic: 'A', change_type: 'continued', description: '継続', sources: {} },
    { topic: 'B', change_type: 'expanded',  description: '拡大', sources: {} },
    { topic: 'C', change_type: 'reduced',   description: '縮小', sources: {} },
    { topic: 'D', change_type: 'new',       description: '新規', sources: {} },
    { topic: 'E', change_type: 'shifted',   description: '移動', sources: {} },
    { topic: 'F', change_type: 'continued', description: '継続2', sources: {} },
  ]

  it('各 change_type ごとに分類される', () => {
    const grouped = groupTopicChangesByType(topicChanges)
    expect(grouped.continued).toHaveLength(2)
    expect(grouped.expanded).toHaveLength(1)
    expect(grouped.reduced).toHaveLength(1)
    expect(grouped.new).toHaveLength(1)
    expect(grouped.shifted).toHaveLength(1)
  })

  it('空の配列でも全キーが存在する', () => {
    const grouped = groupTopicChangesByType([])
    expect(grouped).toHaveProperty('continued')
    expect(grouped).toHaveProperty('expanded')
    expect(grouped).toHaveProperty('reduced')
    expect(grouped).toHaveProperty('new')
    expect(grouped).toHaveProperty('shifted')
  })
})
