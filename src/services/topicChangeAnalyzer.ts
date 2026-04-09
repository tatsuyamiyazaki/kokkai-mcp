/**
 * topicChangeAnalyzer.ts
 *
 * 論点の増減分析機能のコアサービス。
 * 複数期間の発言を収集・要約し、論点の変化（増加・減少・継続・新規）を分析する。
 */

import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { LlmApiError, getErrorMessage } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { collectPeriodSpeeches, summarizePeriod } from './periodSummarizer.js'
import { parseJsonResponse, itemsToSources } from './citationMapper.js'
import type { ComparePeriod, SummaryMode, SourceInfo } from '../types/index.js'

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey })

/** 論点変化の種別（既存の TopicChangeType に 'unclear' を加えた拡張版） */
export type TopicChangeTypeExt =
  | 'continued'
  | 'expanded'
  | 'reduced'
  | 'new'
  | 'shifted'
  | 'unclear'

/** 論点変化エントリ（analyze_topic_changes 専用） */
export interface TopicChangeEntry {
  topic: string
  change_type: TopicChangeTypeExt
  description: string
  /** 期間ラベル → 出典の辞書 */
  sources: Record<string, SourceInfo[]>
}

/** 期間別サマリ */
export interface PeriodTopicSummary {
  label: string
  main_topics: string[]
  sources: SourceInfo[]
}

/** analyze_topic_changes の出力型 */
export interface TopicChangesResult {
  query: string
  overview: string
  topic_changes: TopicChangeEntry[]
  summary_by_period: PeriodTopicSummary[]
  conclusion: {
    text: string
    sources: SourceInfo[]
  }
}

/** change_type の検証 */
function safeChangeTypeExt(raw: unknown): TopicChangeTypeExt {
  const valid: TopicChangeTypeExt[] = [
    'continued', 'expanded', 'reduced', 'new', 'shifted', 'unclear',
  ]
  if (typeof raw === 'string' && (valid as string[]).includes(raw)) {
    return raw as TopicChangeTypeExt
  }
  return 'unclear'
}

/** モード別の出典数 */
const MODE_SOURCE_COUNT: Record<SummaryMode, { topic: number; period: number; conclusion: number }> = {
  brief:    { topic: 1, period: 1, conclusion: 1 },
  standard: { topic: 2, period: 2, conclusion: 2 },
  detailed: { topic: 2, period: 3, conclusion: 3 },
}

/** モード別の論点数 */
const MODE_TOPIC_COUNT: Record<SummaryMode, number> = {
  brief:    3,
  standard: 6,
  detailed: 10,
}

/**
 * 複数期間の論点変化を分析する。
 *
 * 処理フロー:
 * 1. 各期間の発言を収集・要約（既存 periodSummarizer を再利用）
 * 2. LLM に論点対応づけ・増減判定を依頼
 * 3. 出典を期間別に付与
 */
export async function analyzeTopicChanges(
  options: {
    query: string
    periods: ComparePeriod[]
    mode?: SummaryMode
    maxItemsPerPeriod?: number
    includeEmergingTopics?: boolean
    nameOfMeeting?: string
  },
): Promise<TopicChangesResult> {
  const mode = options.mode ?? 'standard'
  const maxItems = options.maxItemsPerPeriod ?? 20
  const includeEmergingTopics = options.includeEmergingTopics ?? true
  const sourceCounts = MODE_SOURCE_COUNT[mode]
  const topicCount = MODE_TOPIC_COUNT[mode]

  logger.info('論点変化分析開始', {
    mode,
    periodCount: String(options.periods.length),
    query: options.query,
  })

  // Step 1: 各期間の発言収集（並列）
  const collectOptions = {
    query: options.query,
    nameOfMeeting: options.nameOfMeeting,
    maxItems,
  }

  const periodItemsList = await Promise.all(
    options.periods.map((period) => collectPeriodSpeeches(period, collectOptions)),
  )

  // Step 2: 各期間の要約（並列）
  const periodSummaries = await Promise.all(
    options.periods.map((period, i) =>
      summarizePeriod(period, periodItemsList[i] ?? [], mode, options.query),
    ),
  )

  // 各期間の代表ソース（topic の sources を flatten）
  const periodSources: Record<string, SourceInfo[]> = {}
  for (const ps of periodSummaries) {
    periodSources[ps.label] = ps.sources.slice(0, sourceCounts.period)
    // sources が空の場合は items から補完
    if (periodSources[ps.label]?.length === 0) {
      const idx = periodSummaries.indexOf(ps)
      const rawItems = periodItemsList[idx] ?? []
      periodSources[ps.label] = itemsToSources(rawItems, sourceCounts.period)
    }
  }

  // 期間別サマリ（出力用）
  const summary_by_period: PeriodTopicSummary[] = periodSummaries.map((ps) => ({
    label: ps.label,
    main_topics: ps.topics.map((t) => t.topic),
    sources: periodSources[ps.label] ?? [],
  }))

  // Step 3: LLM に論点変化の分析を依頼
  const periodsText = periodSummaries
    .map((ps) => {
      const topicLines = ps.topics.map((t) => `  - ${t.topic}: ${t.summary}`).join('\n')
      return `【${ps.label}】\n概要: ${ps.summary}\n論点:\n${topicLines || '  （論点なし）'}`
    })
    .join('\n\n')

  const modeInstruction = mode === 'brief'
    ? `主な増加論点・新規論点・継続論点のみ返してください（最大${topicCount}件）。`
    : mode === 'standard'
    ? `主要な論点変化を${topicCount}件程度抽出してください。`
    : `論点変化を網羅的に返してください（最大${topicCount}件）。shifted の説明を詳しく返してください。`

  const emergingInstruction = includeEmergingTopics
    ? 'new（新規論点）も含めてください。'
    : 'new（新規論点）は含めないでください。'

  const prompt = `以下は「${options.query}」に関する複数期間の国会議論の要約です。論点の変化を分析してください。
${modeInstruction}
${emergingInstruction}

change_type の定義:
- continued: 複数期間で継続して議論されている
- expanded: 後の期間で議論の比重が増した・拡大した
- reduced: 後の期間で議論が減った・縮小した
- new: 後の期間で初めて登場した論点
- shifted: 論点の主旨・重心が変化した
- unclear: 判定困難

比重の判定は厳密な統計ではなく、発言件数・発言長・要約内での中心性などを総合的に判断してください。

期間データ:
${periodsText}

以下の JSON 形式で回答してください:
{
  "overview": "論点変化全体の概要（2〜3文）",
  "topic_changes": [
    {
      "topic": "論点タイトル（20文字以内）",
      "change_type": "continued|expanded|reduced|new|shifted|unclear",
      "description": "変化の説明（2〜3文）"
    }
  ],
  "conclusion": {
    "text": "論点変化全体を踏まえた結論（2〜3文）"
  }
}`

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: mode === 'brief' ? 1200 : mode === 'standard' ? 2500 : 6000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new LlmApiError('LLM からテキストレスポンスが返されませんでした')
    }

    const parsed = parseJsonResponse(content.text)

    const overview = typeof parsed['overview'] === 'string'
      ? parsed['overview']
      : '（概要の生成に失敗しました）'

    // topic_changes
    const rawChanges = Array.isArray(parsed['topic_changes']) ? parsed['topic_changes'] : []
    const topic_changes: TopicChangeEntry[] = rawChanges.slice(0, topicCount).map((raw) => {
      const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const topic       = typeof obj['topic']       === 'string' ? obj['topic']       : '（論点不明）'
      const change_type = safeChangeTypeExt(obj['change_type'])
      const description = typeof obj['description'] === 'string' ? obj['description'] : ''

      // 出典を期間別に付与（各期間の代表 sources から）
      const sources: Record<string, SourceInfo[]> = {}
      for (const ps of periodSummaries) {
        // 'new' の場合、初期期間には出典なし
        if (change_type === 'new' && ps === periodSummaries[0]) continue
        // 'reduced' の場合、最終期間には出典なし
        if (change_type === 'reduced' && ps === periodSummaries[periodSummaries.length - 1]) continue
        const srcs = periodSources[ps.label]
        if (srcs && srcs.length > 0) {
          sources[ps.label] = srcs.slice(0, sourceCounts.topic)
        }
      }

      return { topic, change_type, description, sources }
    })

    // conclusion
    const rawConclusion = typeof parsed['conclusion'] === 'object' && parsed['conclusion'] !== null
      ? (parsed['conclusion'] as Record<string, unknown>)
      : {}
    const conclusionText = typeof rawConclusion['text'] === 'string'
      ? rawConclusion['text']
      : typeof parsed['conclusion'] === 'string'
      ? parsed['conclusion']
      : '（結論の抽出に失敗しました）'

    // conclusion の出典: 全期間の代表 sources から
    const conclusionSources: SourceInfo[] = []
    for (const ps of periodSummaries) {
      const srcs = periodSources[ps.label]
      if (srcs && srcs[0]) {
        conclusionSources.push(srcs[0])
      }
    }

    logger.info('論点変化分析完了', { topicCount: String(topic_changes.length) })

    return {
      query: options.query,
      overview,
      topic_changes,
      summary_by_period,
      conclusion: { text: conclusionText, sources: conclusionSources },
    }
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`論点変化分析 LLM 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}
