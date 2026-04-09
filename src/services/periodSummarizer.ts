/**
 * periodSummarizer.ts
 *
 * 期間単位の発言収集・前処理・要約を担当するモジュール。
 * 既存の searchSpeeches / preprocessSpeeches / summarizeSpeechesAnalysis を再利用する。
 */

import { searchSpeeches } from './kokkaiApi.js'
import { preprocessSpeeches } from './preprocess.js'
import { summarizeSpeechesAnalysis } from './summarizer.js'
import { logger } from '../utils/logger.js'
import type { ComparePeriod, PeriodSummary, SpeechItem, SummaryMode, TopicSummary, SourceInfo } from '../types/index.js'

export interface CollectPeriodOptions {
  query?: string | undefined
  nameOfMeeting?: string | undefined
  speaker?: string | undefined
  maxItems: number
}

/** 1期間分の発言を検索して返す */
export async function collectPeriodSpeeches(
  period: ComparePeriod,
  options: CollectPeriodOptions,
): Promise<SpeechItem[]> {
  const result = await searchSpeeches({
    query: options.query,
    nameOfMeeting: options.nameOfMeeting,
    speaker: options.speaker,
    from: period.from,
    until: period.until,
    limit: options.maxItems,
  })

  logger.info('期間発言取得完了', {
    label: period.label,
    total: String(result.total),
    returned: String(result.items.length),
  })

  return result.items
}

/**
 * 1期間分の発言を要約して PeriodSummary を返す。
 * 発言が0件の場合は空の PeriodSummary を返す。
 */
export async function summarizePeriod(
  period: ComparePeriod,
  items: SpeechItem[],
  mode: SummaryMode,
  query?: string,
): Promise<PeriodSummary> {
  if (items.length === 0) {
    logger.info('期間発言なし、空のサマリを返す', { label: period.label })
    return {
      label:     period.label,
      summary:   `${period.label} の期間内に該当する発言が見つかりませんでした。`,
      topics:    [],
      sources:   [],
      itemCount: 0,
    }
  }

  // 前処理（重要度ソート・形式発言除外・連続発言結合）
  const keywords = query ? [query] : []
  const processed = preprocessSpeeches(items, { keywords })

  logger.info('期間要約開始', {
    label:      period.label,
    rawCount:   String(items.length),
    processed:  String(processed.length),
    mode,
  })

  // 既存の analysis 要約ロジックを再利用
  const analysisResult = await summarizeSpeechesAnalysis(processed, {
    mode,
    focus:                    query,
    include_topics:           true,
    include_speaker_comparison: false,   // 期間単位では発言者比較は不要
  })

  // overview を summary として使用
  // topics は TopicSummary[]（論点別整理）
  // sources は topics の sources を flatten して重複除去

  const topicSummaries: TopicSummary[] = analysisResult.topics

  const seenIds = new Set<string>()
  const flatSources: SourceInfo[] = []
  for (const t of topicSummaries) {
    for (const s of t.sources) {
      if (!seenIds.has(s.speechID)) {
        seenIds.add(s.speechID)
        flatSources.push(s)
      }
    }
  }
  // conclusion の sources も追加
  for (const s of analysisResult.conclusion.sources) {
    if (!seenIds.has(s.speechID)) {
      seenIds.add(s.speechID)
      flatSources.push(s)
    }
  }

  return {
    label:     period.label,
    summary:   analysisResult.overview,
    topics:    topicSummaries,
    sources:   flatSources,
    itemCount: items.length,
  }
}
