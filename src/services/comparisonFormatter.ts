/**
 * comparisonFormatter.ts
 *
 * 比較結果の整形・モード別出力制御を担当するモジュール。
 * CompareOverTimeResult を SummaryMode に応じてフィルタリングして返す。
 */

import type { CompareOverTimeResult, SummaryMode, PeriodSummary, TopicChange, SpeakerChange } from '../types/index.js'

/**
 * brief モード向けに結果をフィルタリングする。
 * - key_changes を 2〜3 件に絞る
 * - topic_changes を 2〜3 件に絞る
 * - speaker_changes を省略（空配列）
 * - period_summaries.topics を空配列に
 */
function applyBriefFilter(result: CompareOverTimeResult): CompareOverTimeResult {
  return {
    ...result,
    comparison_summary: {
      ...result.comparison_summary,
      key_changes:  result.comparison_summary.key_changes.slice(0, 3),
      common_points: result.comparison_summary.common_points.slice(0, 2),
      new_points:   result.comparison_summary.new_points.slice(0, 2),
    },
    period_summaries: result.period_summaries.map((ps) => ({
      ...ps,
      topics: [],    // brief では論点詳細は省略
    })),
    topic_changes:  result.topic_changes.slice(0, 3),
    speaker_changes: [],   // brief では省略
  }
}

/**
 * standard モード向けに結果をフィルタリングする。
 * - key_changes を 5 件以内に絞る
 * - topic_changes を 6 件以内に絞る
 * - speaker_changes は include_speaker_changes の設定に委ねる（加工なし）
 */
function applyStandardFilter(result: CompareOverTimeResult): CompareOverTimeResult {
  return {
    ...result,
    comparison_summary: {
      ...result.comparison_summary,
      key_changes:  result.comparison_summary.key_changes.slice(0, 5),
      common_points: result.comparison_summary.common_points.slice(0, 5),
      new_points:   result.comparison_summary.new_points.slice(0, 5),
    },
    topic_changes: result.topic_changes.slice(0, 6),
  }
}

/**
 * detailed モードでは加工なし（フル出力）。
 */
function applyDetailedFilter(result: CompareOverTimeResult): CompareOverTimeResult {
  return result
}

/**
 * モード別に出力を制御して CompareOverTimeResult を返す。
 */
export function formatCompareResult(
  result: CompareOverTimeResult,
  mode: SummaryMode,
): CompareOverTimeResult {
  switch (mode) {
    case 'brief':
      return applyBriefFilter(result)
    case 'standard':
      return applyStandardFilter(result)
    case 'detailed':
      return applyDetailedFilter(result)
  }
}

/**
 * 比較結果を Markdown テキストに整形する（仕様書 §18 テンプレート準拠）。
 * MCP レスポンスの text フィールドには JSON を返すため、
 * このメソッドは任意出力用（デバッグ・ドキュメント生成向け）。
 */
export function formatCompareResultAsMarkdown(result: CompareOverTimeResult): string {
  const lines: string[] = []

  lines.push('■ 比較概要', '')
  lines.push(result.comparison_summary.overview, '')

  lines.push('■ 期間ごとの要約', '')
  for (const ps of result.period_summaries) {
    lines.push(`- ${ps.label}`)
    lines.push(`  ${ps.summary}`)
  }
  lines.push('')

  lines.push('■ 主な変化点', '')
  for (const change of result.comparison_summary.key_changes) {
    lines.push(`- ${change}`)
  }
  lines.push('')

  lines.push('■ 継続している論点', '')
  if (result.comparison_summary.common_points.length === 0) {
    lines.push('（継続論点なし）')
  } else {
    for (const point of result.comparison_summary.common_points) {
      lines.push(`- ${point}`)
    }
  }
  lines.push('')

  lines.push('■ 新たに目立った論点', '')
  if (result.comparison_summary.new_points.length === 0) {
    lines.push('（新規論点なし）')
  } else {
    for (const np of result.comparison_summary.new_points) {
      lines.push(`- [${np.period}] ${np.point}`)
    }
  }
  lines.push('')

  if (result.speaker_changes.length > 0) {
    lines.push('■ 発言者の変化', '')
    for (const sc of result.speaker_changes) {
      lines.push(`- ${sc.speaker}: ${sc.change}`)
    }
    lines.push('')
  }

  lines.push('■ 結論', '')
  lines.push(result.conclusion.text, '')

  // 出典（全体まとめ）
  const allSources = collectAllSources(result)
  if (allSources.length > 0) {
    lines.push('■ 出典', '')
    for (const src of allSources) {
      const parts: string[] = []
      if (src.speaker)       parts.push(src.speaker)
      if (src.nameOfMeeting) parts.push(src.nameOfMeeting)
      if (src.date)          parts.push(src.date)
      if (src.speechID)      parts.push(`speechID: ${src.speechID}`)
      lines.push(`- ${parts.join(' / ')}`)
    }
  }

  if (result.caution) {
    lines.push('', `※ ${result.caution}`)
  }

  return lines.join('\n')
}

/** 結果の全 sources を重複除去してフラット化する */
function collectAllSources(result: CompareOverTimeResult) {
  const seen = new Set<string>()
  const all: Array<{ speechID: string; issueID?: string; speaker?: string; nameOfMeeting?: string; date?: string; excerpt?: string }> = []
  const push = (src: { speechID: string; issueID?: string; speaker?: string; nameOfMeeting?: string; date?: string; excerpt?: string }) => {
    if (!seen.has(src.speechID)) {
      seen.add(src.speechID)
      all.push(src)
    }
  }
  for (const ps of result.period_summaries) {
    for (const s of ps.sources) push(s)
  }
  for (const tc of result.topic_changes) {
    for (const periodSources of Object.values(tc.sources)) {
      for (const s of periodSources) push(s)
    }
  }
  for (const s of result.conclusion.sources) push(s)
  return all
}

/**
 * 期間サマリの itemCount を検証して不均衡な場合の期間ラベルを返す。
 * （外部から利用できるようにエクスポート）
 */
export function getImbalancedPeriods(
  periodSummaries: Pick<PeriodSummary, 'label' | 'itemCount'>[],
): string[] {
  const counts = periodSummaries.map((ps) => ps.itemCount)
  const maxCount = Math.max(...counts)
  const minCount = Math.min(...counts)
  if (minCount === 0 || maxCount / minCount >= 3) {
    return periodSummaries
      .filter((ps) => ps.itemCount < maxCount / 3)
      .map((ps) => ps.label)
  }
  return []
}

/** TopicChange[] から change_type 別に分類するユーティリティ */
export function groupTopicChangesByType(
  topicChanges: TopicChange[],
): Record<TopicChange['change_type'], TopicChange[]> {
  return {
    continued: topicChanges.filter((tc) => tc.change_type === 'continued'),
    expanded:  topicChanges.filter((tc) => tc.change_type === 'expanded'),
    reduced:   topicChanges.filter((tc) => tc.change_type === 'reduced'),
    new:       topicChanges.filter((tc) => tc.change_type === 'new'),
    shifted:   topicChanges.filter((tc) => tc.change_type === 'shifted'),
  }
}
