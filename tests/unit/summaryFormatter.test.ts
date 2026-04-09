import { describe, it, expect } from 'vitest'
import {
  formatAnalysisAsMarkdown,
  convertToAnalysisResult,
  isAnalysisResult,
} from '../../src/services/summaryFormatter.js'
import type { SummaryResult, TopicSummary, SpeakerComparison } from '../../src/types/index.js'

const baseSummary: SummaryResult = {
  overview: '生成AIに関する議論が行われた。',
  main_points: [
    { point: 'AI規制の必要性', sources: [] },
  ],
  speaker_points: [
    { speaker: '田中大臣', point: '慎重な検討が必要', sources: [] },
  ],
  conclusion: { text: '引き続き審議を継続する方針。', sources: [] },
}

const topics: TopicSummary[] = [
  { topic: 'AI規制', summary: '規制の必要性が議論された。', sources: [] },
  { topic: '活用促進', summary: '産業競争力の観点から活用推進が論じられた。', sources: [] },
]

const speakerComparison: SpeakerComparison[] = [
  { speaker: '田中大臣', position: '慎重', point: '慎重な検討が必要', sources: [] },
  { speaker: '山田委員', position: '推進', point: '活用促進が重要', sources: [] },
]

describe('convertToAnalysisResult', () => {
  it('基本要約から AnalysisResult を生成できる', () => {
    const result = convertToAnalysisResult(baseSummary, topics, speakerComparison)

    expect(result.overview).toBe(baseSummary.overview)
    expect(result.topics).toHaveLength(2)
    expect(result.speaker_comparison).toHaveLength(2)
    expect(result.conclusion.text).toBe(baseSummary.conclusion.text)
  })

  it('caution が基本要約に存在する場合は引き継ぐ', () => {
    const withCaution: SummaryResult = { ...baseSummary, caution: '一部推測あり' }
    const result = convertToAnalysisResult(withCaution, topics, speakerComparison)
    expect(result.caution).toBe('一部推測あり')
  })

  it('topics が空でも AnalysisResult を生成できる', () => {
    const result = convertToAnalysisResult(baseSummary, [], speakerComparison)
    expect(result.topics).toHaveLength(0)
    expect(result.speaker_comparison).toHaveLength(2)
  })

  it('speaker_comparison が空でも AnalysisResult を生成できる', () => {
    const result = convertToAnalysisResult(baseSummary, topics, [])
    expect(result.topics).toHaveLength(2)
    expect(result.speaker_comparison).toHaveLength(0)
  })
})

describe('formatAnalysisAsMarkdown', () => {
  it('全セクションを含む markdown を生成する', () => {
    const analysisResult = convertToAnalysisResult(baseSummary, topics, speakerComparison)
    const markdown = formatAnalysisAsMarkdown(analysisResult)

    expect(markdown).toContain('■ 会議概要')
    expect(markdown).toContain('■ 論点別整理')
    expect(markdown).toContain('■ 発言者別比較')
    expect(markdown).toContain('■ 結論')
  })

  it('overview テキストが出力に含まれる', () => {
    const analysisResult = convertToAnalysisResult(baseSummary, topics, speakerComparison)
    const markdown = formatAnalysisAsMarkdown(analysisResult)
    expect(markdown).toContain('生成AIに関する議論が行われた。')
  })

  it('論点タイトルが出力に含まれる', () => {
    const analysisResult = convertToAnalysisResult(baseSummary, topics, speakerComparison)
    const markdown = formatAnalysisAsMarkdown(analysisResult)
    expect(markdown).toContain('AI規制')
    expect(markdown).toContain('活用促進')
  })

  it('発言者名と立場が出力に含まれる', () => {
    const analysisResult = convertToAnalysisResult(baseSummary, topics, speakerComparison)
    const markdown = formatAnalysisAsMarkdown(analysisResult)
    expect(markdown).toContain('田中大臣')
    expect(markdown).toContain('慎重')
  })

  it('topics が空の場合は代替テキストを出力する', () => {
    const analysisResult = convertToAnalysisResult(baseSummary, [], speakerComparison)
    const markdown = formatAnalysisAsMarkdown(analysisResult)
    expect(markdown).toContain('論点を抽出できませんでした')
  })

  it('出典がある場合は ■ 出典 セクションを出力する', () => {
    const topicWithSource: TopicSummary[] = [
      {
        topic: 'AI規制',
        summary: '規制の必要性が議論された。',
        sources: [
          {
            speechID: 'S001',
            issueID: 'I001',
            speaker: '田中大臣',
            date: '2024-01-15',
            nameOfMeeting: '衆議院予算委員会',
            excerpt: '発言の一部',
          },
        ],
      },
    ]
    const analysisResult = convertToAnalysisResult(baseSummary, topicWithSource, [])
    const markdown = formatAnalysisAsMarkdown(analysisResult)
    expect(markdown).toContain('■ 出典')
    expect(markdown).toContain('S001')
  })

  it('出典の重複は除去される', () => {
    const sharedSource = {
      speechID: 'S001',
      issueID: 'I001',
      speaker: '田中大臣',
      date: '2024-01-15',
      nameOfMeeting: '衆議院予算委員会',
      excerpt: '発言の一部',
    }
    const topicWithSource: TopicSummary[] = [
      { topic: 'T1', summary: '...', sources: [sharedSource] },
      { topic: 'T2', summary: '...', sources: [sharedSource] },
    ]
    const analysisResult = convertToAnalysisResult(baseSummary, topicWithSource, [])
    const markdown = formatAnalysisAsMarkdown(analysisResult)
    // S001 の出典行が 1 回だけ出力される
    const occurrences = (markdown.match(/S001/g) ?? []).length
    expect(occurrences).toBe(1)
  })
})

describe('isAnalysisResult', () => {
  it('AnalysisResult 構造を正しく識別する', () => {
    const analysisResult = convertToAnalysisResult(baseSummary, topics, speakerComparison)
    expect(isAnalysisResult(analysisResult)).toBe(true)
  })

  it('SummaryResult は false を返す', () => {
    expect(isAnalysisResult(baseSummary)).toBe(false)
  })

  it('null は false を返す', () => {
    expect(isAnalysisResult(null)).toBe(false)
  })

  it('空オブジェクトは false を返す', () => {
    expect(isAnalysisResult({})).toBe(false)
  })
})
