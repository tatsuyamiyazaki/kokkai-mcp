/**
 * timeSeriesComparator.ts
 *
 * 期間ごとの要約結果を比較し、論点変化・発言者変化・比較サマリを生成するモジュール。
 * LLM を呼び出して差分判定と change_type の付与を行う。
 */

import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { LlmApiError, getErrorMessage } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import type {
  PeriodSummary,
  ComparisonSummary,
  TopicChange,
  SpeakerChange,
  SourceInfo,
  SummaryMode,
} from '../types/index.js'

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey })

/** LLM JSON レスポンスをパースする */
function parseJsonResponse(text: string): Record<string, unknown> {
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) ??
    text.match(/```json\s*([\s\S]*)/) ??
    text.match(/(\{[\s\S]*\})/)
  const jsonText = jsonMatch?.[1] ?? text
  try {
    return JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    throw new LlmApiError(
      `LLM レスポンスを JSON としてパースできませんでした: ${text.slice(0, 100)}`,
      false,
    )
  }
}

/** change_type の値を検証して安全に返す */
function safeChangeType(raw: unknown): TopicChange['change_type'] {
  const valid = ['continued', 'expanded', 'reduced', 'new', 'shifted'] as const
  if (typeof raw === 'string' && (valid as readonly string[]).includes(raw)) {
    return raw as TopicChange['change_type']
  }
  return 'shifted'
}

/**
 * 期間サマリの論点リストを比較し、TopicChange[] を生成する。
 * LLM に論点名一覧と要約を与えて差分分類を依頼する。
 */
export async function compareTopics(
  periodSummaries: PeriodSummary[],
  mode: SummaryMode,
): Promise<TopicChange[]> {
  if (periodSummaries.length < 2) return []

  // 各期間の論点一覧と要約をテキスト化
  const periodsText = periodSummaries
    .map((ps) => {
      const topicLines = ps.topics.map((t) => `  - ${t.topic}: ${t.summary}`).join('\n')
      return `【${ps.label}】\n要約: ${ps.summary}\n論点:\n${topicLines}`
    })
    .join('\n\n')

  const changeCountInstruction =
    mode === 'brief'
      ? '主要な論点変化を 2〜3 件に絞ってください。'
      : mode === 'standard'
      ? '主要な論点変化を 3〜6 件程度抽出してください。'
      : '論点変化を網羅的に抽出してください（最大 10 件）。'

  const prompt = `以下は複数の期間における国会議論の要約です。各論点について変化を分類し、整理してください。
${changeCountInstruction}

change_type は以下の候補から最も適切なものを 1 つ選んでください:
- continued: 複数期間で継続して議論されている
- expanded: 後の期間で議論の比重が増した・拡大した
- reduced: 後の期間で議論が減った・縮小した
- new: 後の期間で初めて登場した論点
- shifted: 論点の主旨・重心が変化した

出典IDの参照は不要です。topic名を使って sources のキーを期間ラベルと対応させてください。

期間データ:
${periodsText}

以下の JSON 形式で回答してください:
{
  "topic_changes": [
    {
      "topic": "論点タイトル（20文字以内）",
      "change_type": "continued|expanded|reduced|new|shifted",
      "description": "変化の説明（2〜3文）",
      "period_refs": {
        "${periodSummaries[0]?.label ?? ''}": ["関連する論点の要約キーワードや要旨"],
        "${periodSummaries[1]?.label ?? ''}": ["関連する論点の要約キーワードや要旨"]
      }
    }
  ]
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
    const rawChanges = parsed['topic_changes']
    if (!Array.isArray(rawChanges)) return []

    // 各 TopicChange に sources を期間別に紐づける（出典は期間サマリの sources から取得）
    return rawChanges.map((raw) => {
      const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const topic       = typeof obj['topic']       === 'string' ? obj['topic']       : '（論点不明）'
      const change_type = safeChangeType(obj['change_type'])
      const description = typeof obj['description'] === 'string' ? obj['description'] : ''

      // sources を期間別に構築（各期間の代表 sources から最大 2 件）
      const sources: Record<string, SourceInfo[]> = {}
      for (const ps of periodSummaries) {
        sources[ps.label] = ps.sources.slice(0, 2)
      }

      return { topic, change_type, description, sources }
    })
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`論点比較 LLM 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}

/**
 * 発言者の期間別変化を分析して SpeakerChange[] を生成する。
 * 複数期間の要約から発言者の立場・重点の変化を整理する。
 */
export async function compareSpeakersOverTime(
  periodSummaries: PeriodSummary[],
  mode: SummaryMode,
): Promise<SpeakerChange[]> {
  if (periodSummaries.length < 2) return []

  const periodsText = periodSummaries
    .map((ps) => {
      return `【${ps.label}】\n要約: ${ps.summary}`
    })
    .join('\n\n')

  const speakerCountInstruction =
    mode === 'brief'
      ? '主要な発言者のみ（最大 2 名）。'
      : mode === 'standard'
      ? '主要な発言者（最大 4 名）。'
      : '発言者を網羅的に（最大 8 名）。'

  const prompt = `以下は複数の期間における国会議論の要約です。期間をまたいで発言が確認できる議員・大臣について、立場や重点の変化を整理してください。
${speakerCountInstruction}

変化が確認できない場合や、同一人物が複数期間に登場していない場合は無理に挙げないでください。

期間データ:
${periodsText}

以下の JSON 形式で回答してください:
{
  "speaker_changes": [
    {
      "speaker": "発言者名",
      "change": "期間による立場・重点の変化（2〜3文）"
    }
  ]
}`

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: mode === 'brief' ? 500 : 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new LlmApiError('LLM からテキストレスポンスが返されませんでした')
    }

    const parsed = parseJsonResponse(content.text)
    const rawChanges = parsed['speaker_changes']
    if (!Array.isArray(rawChanges)) return []

    return rawChanges.map((raw) => {
      const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const speaker = typeof obj['speaker'] === 'string' ? obj['speaker'] : '（発言者不明）'
      const change  = typeof obj['change']  === 'string' ? obj['change']  : ''

      // sources を期間別に構築（各期間の代表 sources から最大 1 件）
      const sources: Record<string, SourceInfo[]> = {}
      for (const ps of periodSummaries) {
        sources[ps.label] = ps.sources.slice(0, 1)
      }

      return { speaker, change, sources }
    })
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`発言者変化分析 LLM 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}

/**
 * 比較サマリ（overview / key_changes / common_points / new_points）を生成する。
 * topic_changes を入力として LLM で統合的な比較サマリを作成する。
 */
export async function generateComparisonSummary(
  periodSummaries: PeriodSummary[],
  topicChanges: TopicChange[],
  query: string,
  mode: SummaryMode,
): Promise<ComparisonSummary> {
  const periodsText = periodSummaries
    .map((ps) => `【${ps.label}】: ${ps.summary}`)
    .join('\n')

  const topicChangesText = topicChanges
    .map((tc) => `- [${tc.change_type}] ${tc.topic}: ${tc.description}`)
    .join('\n')

  const keyChangesCount = mode === 'brief' ? 2 : mode === 'standard' ? 3 : 5
  const commonCount     = mode === 'brief' ? 2 : mode === 'standard' ? 3 : 5
  const newCount        = mode === 'brief' ? 2 : mode === 'standard' ? 3 : 5

  const prompt = `以下は「${query}」に関する複数期間の国会議論の比較結果です。全体的な変化のサマリを作成してください。

期間別要約:
${periodsText}

論点変化:
${topicChangesText}

以下の JSON 形式で回答してください:
{
  "overview": "比較全体の要約（2〜4文）",
  "key_changes": [
    "変化点1（最大${keyChangesCount}件）",
    "変化点2"
  ],
  "common_points": [
    "継続論点1（最大${commonCount}件）",
    "継続論点2"
  ],
  "new_points": [
    {
      "period": "論点が現れた期間のラベル",
      "point": "新規論点の説明（最大${newCount}件）"
    }
  ]
}`

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: mode === 'brief' ? 1200 : mode === 'standard' ? 2500 : 5000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new LlmApiError('LLM からテキストレスポンスが返されませんでした')
    }

    const parsed = parseJsonResponse(content.text)

    const overview       = typeof parsed['overview'] === 'string' ? parsed['overview'] : '（比較概要の生成に失敗しました）'
    const rawKeyChanges  = Array.isArray(parsed['key_changes'])  ? parsed['key_changes']  : []
    const rawCommon      = Array.isArray(parsed['common_points']) ? parsed['common_points'] : []
    const rawNewPoints   = Array.isArray(parsed['new_points'])    ? parsed['new_points']    : []

    const key_changes: string[] = rawKeyChanges.filter((x): x is string => typeof x === 'string')
    const common_points: string[] = rawCommon.filter((x): x is string => typeof x === 'string')
    const new_points = rawNewPoints.map((np) => {
      const obj    = typeof np === 'object' && np !== null ? (np as Record<string, unknown>) : {}
      const period = typeof obj['period'] === 'string' ? obj['period'] : ''
      const point  = typeof obj['point']  === 'string' ? obj['point']  : ''
      // new_points の出典は comparison_summary レベルでは空（topic_changes に詳細あり）
      return { period, point, sources: [] as SourceInfo[] }
    })

    return { overview, key_changes, common_points, new_points }
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`比較サマリ LLM 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}

/**
 * 比較結論を生成する。
 */
export async function generateConclusion(
  periodSummaries: PeriodSummary[],
  comparisonSummary: ComparisonSummary,
  query: string,
): Promise<{ text: string; sources: SourceInfo[] }> {
  const periodsText = periodSummaries
    .map((ps) => `【${ps.label}】: ${ps.summary}`)
    .join('\n')

  const prompt = `以下は「${query}」に関する複数期間の国会議論の比較結果です。全体を踏まえた結論を 2〜3 文で述べてください。

期間別要約:
${periodsText}

比較概要:
${comparisonSummary.overview}

主な変化点:
${comparisonSummary.key_changes.map((c) => `- ${c}`).join('\n')}

以下の JSON 形式で回答してください:
{
  "conclusion": "比較全体の結論（2〜3文）"
}`

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new LlmApiError('LLM からテキストレスポンスが返されませんでした')
    }

    const parsed = parseJsonResponse(content.text)
    const text = typeof parsed['conclusion'] === 'string'
      ? parsed['conclusion']
      : '（結論の生成に失敗しました）'

    // 結論の出典は全期間の代表 sources から最大各 1 件
    const sources: SourceInfo[] = []
    for (const ps of periodSummaries) {
      const first = ps.sources[0]
      if (first !== undefined) {
        sources.push(first)
      }
    }

    return { text, sources }
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`結論生成 LLM 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}

/**
 * 期間ごとの件数差が大きい場合の警告テキストを生成する（LLM 不使用）。
 * 件数比が 3 倍以上の場合に注意を返す。
 */
export function checkItemCountDisparity(periodSummaries: PeriodSummary[]): string | undefined {
  if (periodSummaries.length < 2) return undefined
  const counts = periodSummaries.map((ps) => ps.itemCount)
  const maxCount = Math.max(...counts)
  const minCount = Math.min(...counts)

  if (minCount === 0) {
    const emptyPeriods = periodSummaries
      .filter((ps) => ps.itemCount === 0)
      .map((ps) => ps.label)
      .join('、')
    return `${emptyPeriods} の期間は検索結果が0件でした。比較精度が低下している可能性があります。`
  }

  if (maxCount / minCount >= 3) {
    const labels = periodSummaries.map((ps) => `${ps.label}: ${ps.itemCount}件`).join('、')
    return `期間ごとの発言件数に大きな差があります（${labels}）。比較精度が低下している可能性があります。`
  }

  return undefined
}

/**
 * 時系列比較のメイン処理。
 * 各期間の要約結果を受け取り、論点変化・発言者変化・比較サマリ・結論を並列生成する。
 */
export async function performTimeSeriesComparison(
  periodSummaries: PeriodSummary[],
  query: string,
  mode: SummaryMode,
  includeSpeakerChanges: boolean,
): Promise<{
  comparisonSummary: ComparisonSummary
  topicChanges: TopicChange[]
  speakerChanges: SpeakerChange[]
  conclusion: { text: string; sources: SourceInfo[] }
}> {
  logger.info('時系列比較開始', {
    periods:      periodSummaries.map((ps) => ps.label).join(', '),
    mode,
    includeSpeakerChanges: String(includeSpeakerChanges),
  })

  // 1. 論点比較（先に実行: 比較サマリの入力に使うため）
  const topicChanges = await compareTopics(periodSummaries, mode)
  logger.info('論点比較完了', { count: String(topicChanges.length) })

  // 2. 比較サマリ・発言者変化・結論を並列生成
  const [comparisonSummary, speakerChanges, conclusion] = await Promise.all([
    generateComparisonSummary(periodSummaries, topicChanges, query, mode),
    includeSpeakerChanges
      ? compareSpeakersOverTime(periodSummaries, mode)
      : Promise.resolve([]),
    generateConclusion(periodSummaries, { overview: '', key_changes: [], common_points: [], new_points: [] }, query),
  ])

  logger.info('時系列比較完了', {
    topicChanges:   String(topicChanges.length),
    speakerChanges: String(speakerChanges.length),
  })

  return { comparisonSummary, topicChanges, speakerChanges, conclusion }
}
