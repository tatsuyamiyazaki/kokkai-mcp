import type {
  SummaryResult,
  AnalysisResult,
  TopicSummary,
  SpeakerComparison,
  SourcedConclusion,
  SourceInfo,
  OutputTemplate,
} from '../types/index.js'

/** SourceInfo を markdown 出典行に変換する */
function formatSource(src: SourceInfo): string {
  const parts: string[] = []
  if (src.speaker)       parts.push(src.speaker)
  if (src.nameOfMeeting) parts.push(src.nameOfMeeting)
  if (src.date)          parts.push(src.date)
  if (src.speechID)      parts.push(`speechID: ${src.speechID}`)
  return `- ${parts.join(' / ')}`
}

/** 全 sources を重複除去してフラット化する */
function collectAllSources(result: AnalysisResult): SourceInfo[] {
  const seen = new Set<string>()
  const all: SourceInfo[] = []

  const push = (src: SourceInfo) => {
    if (!seen.has(src.speechID)) {
      seen.add(src.speechID)
      all.push(src)
    }
  }

  for (const t of result.topics) {
    for (const s of t.sources) push(s)
  }
  for (const sc of result.speaker_comparison) {
    for (const s of sc.sources) push(s)
  }
  for (const s of result.conclusion.sources) push(s)

  return all
}

/**
 * analysis モードの結果を markdown テキストに整形する
 */
export function formatAnalysisAsMarkdown(result: AnalysisResult): string {
  const lines: string[] = []

  // 会議概要
  lines.push('■ 会議概要', '')
  lines.push(result.overview, '')

  // 論点別整理
  lines.push('■ 論点別整理', '')
  if (result.topics.length === 0) {
    lines.push('（論点を抽出できませんでした）', '')
  } else {
    result.topics.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.topic}`)
      lines.push(`   ${t.summary}`)
    })
    lines.push('')
  }

  // 発言者別比較
  lines.push('■ 発言者別比較', '')
  if (result.speaker_comparison.length === 0) {
    lines.push('（発言者比較情報がありません）', '')
  } else {
    for (const sc of result.speaker_comparison) {
      lines.push(`- ${sc.speaker}（${sc.position}）: ${sc.point}`)
    }
    lines.push('')
  }

  // 結論
  lines.push('■ 結論', '')
  lines.push(result.conclusion.text, '')

  // 出典（全体まとめ）
  const allSources = collectAllSources(result)
  if (allSources.length > 0) {
    lines.push('■ 出典', '')
    for (const src of allSources) {
      lines.push(formatSource(src))
    }
  }

  if (result.caution) {
    lines.push('', `※ ${result.caution}`)
  }

  return lines.join('\n')
}

/**
 * SummaryResult（既存形式）を analysis モード向け AnalysisResult に変換する
 *
 * - main_points → topics へマッピング（簡略変換）
 * - speaker_points → speaker_comparison へマッピング
 */
export function convertToAnalysisResult(
  base: SummaryResult,
  topics: TopicSummary[],
  speakerComparison: SpeakerComparison[],
): AnalysisResult {
  return {
    overview:           base.overview,
    topics,
    speaker_comparison: speakerComparison,
    conclusion:         base.conclusion,
    ...(base.caution ? { caution: base.caution } : {}),
    ...(base.issueID ? { issueID: base.issueID } : {}),
  }
}

/**
 * OutputTemplate に応じて結果を整形する
 *
 * - 'analysis': AnalysisResult の JSON + markdown テキスト
 * - 'standard' / 'brief_report': 既存 SummaryResult の JSON
 */
export function formatOutput(
  template: OutputTemplate,
  base: SummaryResult,
  topics: TopicSummary[],
  speakerComparison: SpeakerComparison[],
): AnalysisResult | SummaryResult {
  if (template === 'analysis') {
    return convertToAnalysisResult(base, topics, speakerComparison)
  }
  // standard / brief_report は既存形式をそのまま返す
  return base
}

/**
 * analysis モード結果の構造を検証する（テスト用）
 */
export function isAnalysisResult(obj: unknown): obj is AnalysisResult {
  if (typeof obj !== 'object' || obj === null) return false
  const r = obj as Record<string, unknown>
  return (
    typeof r['overview'] === 'string' &&
    Array.isArray(r['topics']) &&
    Array.isArray(r['speaker_comparison']) &&
    typeof r['conclusion'] === 'object'
  )
}

/**
 * SourcedConclusion を整形する（再エクスポート用）
 */
export type { AnalysisResult, TopicSummary, SpeakerComparison, SourcedConclusion, OutputTemplate }
