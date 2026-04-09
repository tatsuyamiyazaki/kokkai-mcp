/**
 * partyComparator.ts
 *
 * 政党別比較機能のコアサービス。
 * 発言リストを政党別に集約し、スタンス比較・共通点・相違点を抽出する。
 */

import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { LlmApiError, getErrorMessage } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { attachParty, groupByParty, getMajorParties, GOVERNMENT_PARTY } from './partyResolver.js'
import {
  assignSpeechIds,
  formatSpeechesWithIds,
  resolveSourceIds,
  parseJsonResponse,
  itemsToSources,
} from './citationMapper.js'
import type { SpeechItem, SummaryMode, SourceInfo } from '../types/index.js'

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey })

/** 政党別要約エントリ */
export interface PartySummary {
  party: string
  position: string
  summary: string
  main_topics: string[]
  sources: SourceInfo[]
}

/** 共通点エントリ */
export interface CommonPoint {
  point: string
  sources: SourceInfo[]
}

/** 相違点エントリ */
export interface Difference {
  topic: string
  description: string
  sources: SourceInfo[]
}

/** compare_by_party の出力型 */
export interface PartyComparisonResult {
  query: string
  overview: string
  party_summaries: PartySummary[]
  common_points: CommonPoint[]
  differences: Difference[]
  conclusion: {
    text: string
    sources: SourceInfo[]
  }
}

/** モード別の出典数設定 */
const MODE_SOURCE_COUNT: Record<SummaryMode, {
  party: number
  common: number
  diff: number
  conclusion: number
}> = {
  brief:    { party: 1, common: 1, diff: 1, conclusion: 1 },
  standard: { party: 2, common: 2, diff: 2, conclusion: 2 },
  detailed: { party: 3, common: 2, diff: 3, conclusion: 3 },
}

/** position 値の検証 */
function safePosition(raw: unknown): string {
  const valid = ['活用推進', '慎重', '規制強化', '両立志向', '中立', '説明中心', '判定保留']
  if (typeof raw === 'string' && valid.includes(raw)) return raw
  if (typeof raw === 'string' && raw.length > 0) return raw  // LLM の自由記述も許容
  return '判定保留'
}

/**
 * 政党別比較を実行する。
 *
 * 処理フロー:
 * 1. 発言に政党情報を付与
 * 2. 政党別にグループ化
 * 3. LLM に政党別要約・共通点・相違点の抽出を依頼
 * 4. source_ids を SourceInfo[] に変換
 */
export async function compareByParty(
  items: SpeechItem[],
  options: {
    query: string
    mode?: SummaryMode
    includeCommonPoints?: boolean
    includeDifferences?: boolean
  },
): Promise<PartyComparisonResult> {
  const mode = options.mode ?? 'standard'
  const sourceCounts = MODE_SOURCE_COUNT[mode]
  const includeCommonPoints = options.includeCommonPoints ?? true
  const includeDifferences = options.includeDifferences ?? true

  logger.info('政党別比較開始', {
    mode,
    itemCount: String(items.length),
    query: options.query,
  })

  if (items.length === 0) {
    return {
      query: options.query,
      overview: '対象の発言が見つかりませんでした。',
      party_summaries: [],
      common_points: [],
      differences: [],
      conclusion: { text: '発言データが不足しているため、結論を抽出できませんでした。', sources: [] },
    }
  }

  // 上位 MAX 件に絞る
  const MAX_SPEECHES = 40
  const limited = items.slice(0, MAX_SPEECHES)

  // 政党情報を付与
  const withParty = attachParty(limited)
  const partyGroups = groupByParty(withParty)
  const majorParties = getMajorParties(partyGroups)

  logger.info('政党グループ生成完了', {
    parties: majorParties.join(', '),
    hasGovernment: String(partyGroups.has(GOVERNMENT_PARTY)),
  })

  // ID付きマップ生成（全発言）
  const idMap = assignSpeechIds(limited)
  const speechesText = formatSpeechesWithIds(idMap)

  // 政党別の発言ID一覧を作成（LLM へのヒント）
  const partyHints = Array.from(partyGroups.entries())
    .filter(([party]) => party !== GOVERNMENT_PARTY)
    .map(([party, partyItems]) => {
      const ids = partyItems
        .map((item) => {
          // limited の index で S番号を特定
          const idx = limited.indexOf(item)
          return idx >= 0 ? `S${idx + 1}` : null
        })
        .filter((id): id is string => id !== null)
        .slice(0, 10)
      return `${party}: ${ids.join(', ')}`
    })
    .join('\n')

  const partiesList = majorParties.length > 0
    ? majorParties.join('、')
    : '（政党情報なし）'

  const modeInstruction = mode === 'brief'
    ? '主要政党のみ比較し、共通点と違いを簡潔に返してください。'
    : mode === 'standard'
    ? '政党別要約・共通点・相違点・結論を返してください。'
    : '政党別の主張や論点を詳述し、トピック別の差異を厚く返してください。'

  const commonInstruction = includeCommonPoints
    ? `共通点を${sourceCounts.common}件程度抽出してください。`
    : '共通点は省略してください（common_points: []）。'

  const diffInstruction = includeDifferences
    ? `相違点を${sourceCounts.diff}件程度抽出してください。`
    : '相違点は省略してください（differences: []）。'

  const prompt = `以下は「${options.query}」に関する国会の発言記録です。発言を政党別に比較してください。
${modeInstruction}

対象政党: ${partiesList}

政党別発言ID一覧（ヒント）:
${partyHints}

${commonInstruction}
${diffInstruction}

position の候補: 活用推進 / 慎重 / 規制強化 / 両立志向 / 中立 / 説明中心 / 判定保留
（LLM が自由に表現しても構いません）

出典IDは必ず発言一覧に存在するIDのみ使用してください。
party_summaries の source_ids を${sourceCounts.party}件、common_points の source_ids を${sourceCounts.common}件、differences の source_ids を${sourceCounts.diff}件、conclusion の source_ids を${sourceCounts.conclusion}件指定してください。

発言一覧:
${speechesText}

以下の JSON 形式で回答してください:
{
  "overview": "各政党の比較全体の概要（2〜3文）",
  "party_summaries": [
    {
      "party": "政党名",
      "position": "スタンス",
      "summary": "この政党の主張の要約（2〜3文）",
      "main_topics": ["主な論点1", "主な論点2"],
      "source_ids": ["S1", "S2"]
    }
  ],
  "common_points": [
    {
      "point": "共通点の説明",
      "source_ids": ["S1"]
    }
  ],
  "differences": [
    {
      "topic": "差異のある論点タイトル",
      "description": "差異の説明（2〜3文）",
      "source_ids": ["S1", "S2"]
    }
  ],
  "conclusion": {
    "text": "比較全体の結論（2〜3文）",
    "source_ids": ["S1", "S2"]
  }
}`

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: mode === 'brief' ? 1200 : mode === 'standard' ? 2500 : 4000,
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

    // party_summaries
    const rawParties = Array.isArray(parsed['party_summaries']) ? parsed['party_summaries'] : []
    const party_summaries: PartySummary[] = rawParties.map((raw) => {
      const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const party    = typeof obj['party']   === 'string' ? obj['party']   : '（政党不明）'
      const position = safePosition(obj['position'])
      const summary  = typeof obj['summary'] === 'string' ? obj['summary'] : ''
      const rawTopics = Array.isArray(obj['main_topics']) ? obj['main_topics'] : []
      const main_topics = rawTopics.filter((t): t is string => typeof t === 'string')
      const sources  = resolveSourceIds(obj['source_ids'], idMap, sourceCounts.party)
      return { party, position, summary, main_topics, sources }
    })

    // common_points
    const rawCommon = includeCommonPoints && Array.isArray(parsed['common_points'])
      ? parsed['common_points']
      : []
    const common_points: CommonPoint[] = rawCommon.map((raw) => {
      const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const point   = typeof obj['point'] === 'string' ? obj['point'] : ''
      const sources = resolveSourceIds(obj['source_ids'], idMap, sourceCounts.common)
      return { point, sources }
    })

    // differences
    const rawDiffs = includeDifferences && Array.isArray(parsed['differences'])
      ? parsed['differences']
      : []
    const differences: Difference[] = rawDiffs.map((raw) => {
      const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const topic       = typeof obj['topic']       === 'string' ? obj['topic']       : '（論点不明）'
      const description = typeof obj['description'] === 'string' ? obj['description'] : ''
      const sources     = resolveSourceIds(obj['source_ids'], idMap, sourceCounts.diff)
      return { topic, description, sources }
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
    const conclusionSources = resolveSourceIds(rawConclusion['source_ids'], idMap, sourceCounts.conclusion)
    const finalConclusionSources = conclusionSources.length > 0
      ? conclusionSources
      : itemsToSources(limited.slice(0, sourceCounts.conclusion), sourceCounts.conclusion)

    logger.info('政党別比較完了', {
      partyCount: String(party_summaries.length),
      commonCount: String(common_points.length),
      diffCount: String(differences.length),
    })

    return {
      query: options.query,
      overview,
      party_summaries,
      common_points,
      differences,
      conclusion: { text: conclusionText, sources: finalConclusionSources },
    }
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`政党別比較 LLM 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}
