/**
 * qaPairSummarizer.ts
 *
 * 質問・答弁ペア要約機能のコアサービス。
 * 発言リストから質問と答弁のペアを抽出・要約し、出典付きで返す。
 */

import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { LlmApiError, getErrorMessage } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { resolveSpeakerRole } from './speakerRoleResolver.js'
import {
  assignSpeechIds,
  formatSpeechesWithIds,
  resolveSourceIds,
  parseJsonResponse,
  itemsToSources,
} from './citationMapper.js'
import type { SpeechItem, SummaryMode, SourceInfo } from '../types/index.js'

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey })

/** 質問・答弁ペアの出力型 */
export interface QaPair {
  topic: string
  question: {
    speaker: string
    summary: string
    sources: SourceInfo[]
  }
  answer: {
    speaker: string
    summary: string
    sources: SourceInfo[]
  }
  assessment: {
    response_type: 'direct' | 'partial' | 'indirect' | 'unclear' | 'unanswered'
    note: string
  }
}

/** summarize_qa_pairs の出力型 */
export interface QaSummaryResult {
  issueID: string
  overview: string
  qa_pairs: QaPair[]
  conclusion: {
    text: string
    sources: SourceInfo[]
  }
}

/** モード別の最大ペア数 */
const MODE_MAX_PAIRS: Record<SummaryMode, number> = {
  brief:    5,
  standard: 10,
  detailed: 15,
}

/** モード別の出典数 */
const MODE_SOURCE_COUNT: Record<SummaryMode, { question: number; answer: number; conclusion: number }> = {
  brief:    { question: 1, answer: 1, conclusion: 1 },
  standard: { question: 1, answer: 2, conclusion: 2 },
  detailed: { question: 2, answer: 3, conclusion: 3 },
}

/** response_type の検証 */
function safeResponseType(raw: unknown): QaPair['assessment']['response_type'] {
  const valid = ['direct', 'partial', 'indirect', 'unclear', 'unanswered'] as const
  if (typeof raw === 'string' && (valid as readonly string[]).includes(raw)) {
    return raw as QaPair['assessment']['response_type']
  }
  return 'unclear'
}

/**
 * 発言リストから質問・答弁ペアを抽出・要約する。
 *
 * 処理フロー:
 * 1. 発言者属性判定（質問者/答弁者）
 * 2. LLM にペアリングと要約を依頼
 * 3. source_ids を SourceInfo[] に変換
 */
export async function summarizeQaPairs(
  items: SpeechItem[],
  options: {
    issueID: string
    focus?: string
    mode?: SummaryMode
    maxPairs?: number
    includeUnanswered?: boolean
  },
): Promise<QaSummaryResult> {
  const mode = options.mode ?? 'standard'
  const modeMaxPairs = MODE_MAX_PAIRS[mode]
  const maxPairs = Math.min(options.maxPairs ?? modeMaxPairs, modeMaxPairs)
  const includeUnanswered = options.includeUnanswered ?? true
  const sourceCounts = MODE_SOURCE_COUNT[mode]

  logger.info('QAペア要約開始', {
    mode,
    maxPairs: String(maxPairs),
    itemCount: String(items.length),
  })

  // 発言が0件の場合
  if (items.length === 0) {
    return {
      issueID: options.issueID,
      overview: '対象の発言が見つかりませんでした。',
      qa_pairs: [],
      conclusion: { text: '発言データが不足しているため、結論を抽出できませんでした。', sources: [] },
    }
  }

  // 上位 MAX 件に絞る（コスト制御）
  const MAX_SPEECHES = 40
  const limited = items.slice(0, MAX_SPEECHES)

  // ID付きマップ生成
  const idMap = assignSpeechIds(limited)
  const speechesText = formatSpeechesWithIds(idMap)

  // 発言者属性を付与したメタ情報（LLMへのヒント用）
  const roleHints = limited
    .map((item, i) => {
      const role = resolveSpeakerRole(item)
      const label = role.role === 'answerer'
        ? `[答弁者: ${role.roleLabel ?? '政府側'}]`
        : role.role === 'questioner'
        ? '[質問者: 議員側]'
        : role.role === 'chair'
        ? '[議事進行]'
        : '[不明]'
      return `S${i + 1}: ${label}`
    })
    .join(', ')

  const focusInstruction = options.focus
    ? `\n「${options.focus}」に関する質疑を優先してください。`
    : ''

  const modeInstruction = mode === 'brief'
    ? `主要な質疑を${maxPairs}件程度、各ペアを短く要約してください。`
    : mode === 'standard'
    ? `主要な質疑を${maxPairs}件程度、topic・question・answer・assessmentを返してください。`
    : `主要な質疑を詳しく返してください。必要に応じて複数の答弁も含めてください（最大${maxPairs}件）。`

  const unansweredInstruction = includeUnanswered
    ? '明確な答弁が見当たらない質問も unanswered として含めてください。'
    : '明確な答弁が確認できるペアのみ返してください。'

  const questionSourceCount = sourceCounts.question
  const answerSourceCount = sourceCounts.answer
  const conclusionSourceCount = sourceCounts.conclusion

  const prompt = `以下は国会の発言記録です。質問と答弁のペアを抽出・要約してください。
${modeInstruction}${focusInstruction}

発言者の役割ヒント: ${roleHints}

ペアリングのルール:
- 質問者（議員・委員）の発言の後に続く政府側（大臣・副大臣・政府参考人等）の発言を答弁とする
- 複数の答弁が連続する場合は同一ペアに束ねる
- 明らかに別論点へ移行した場合は区切る
${unansweredInstruction}

response_type の定義:
- direct: 質問に概ね直接回答している
- partial: 一部回答しているが論点が十分ではない
- indirect: 関連説明はあるが、質問に正面から答えていない
- unclear: 判定困難
- unanswered: 明確な答弁が確認できない

出典IDは必ず発言一覧に存在するIDのみ使用してください。
question の source_ids を${questionSourceCount}件、answer の source_ids を${answerSourceCount}件、conclusion の source_ids を${conclusionSourceCount}件指定してください。

発言一覧:
${speechesText}

以下の JSON 形式で回答してください:
{
  "overview": "この会議の質疑全体の概要（2〜3文）",
  "qa_pairs": [
    {
      "topic": "この質疑の論点タイトル（20文字以内）",
      "question": {
        "speaker": "質問者名",
        "summary": "質問の要旨（2〜3文）",
        "source_ids": ["S1"]
      },
      "answer": {
        "speaker": "答弁者名（複数の場合は最初の答弁者）",
        "summary": "答弁の要旨（2〜3文）",
        "source_ids": ["S2", "S3"]
      },
      "assessment": {
        "response_type": "direct|partial|indirect|unclear|unanswered",
        "note": "回答関係の評価（1文）"
      }
    }
  ],
  "conclusion": {
    "text": "この会議の質疑全体を踏まえた結論（2〜3文）",
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

    // overview
    const overview = typeof parsed['overview'] === 'string'
      ? parsed['overview']
      : '（概要の生成に失敗しました）'

    // qa_pairs
    const rawPairs = Array.isArray(parsed['qa_pairs']) ? parsed['qa_pairs'] : []
    const qa_pairs: QaPair[] = rawPairs.slice(0, maxPairs).map((raw) => {
      const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const topic = typeof obj['topic'] === 'string' ? obj['topic'] : '（論点不明）'

      // question
      const rawQ = typeof obj['question'] === 'object' && obj['question'] !== null
        ? (obj['question'] as Record<string, unknown>)
        : {}
      const questionSpeaker = typeof rawQ['speaker'] === 'string' ? rawQ['speaker'] : '（発言者不明）'
      const questionSummary = typeof rawQ['summary'] === 'string' ? rawQ['summary'] : ''
      const questionSources = resolveSourceIds(rawQ['source_ids'], idMap, sourceCounts.question)

      // answer
      const rawA = typeof obj['answer'] === 'object' && obj['answer'] !== null
        ? (obj['answer'] as Record<string, unknown>)
        : {}
      const answerSpeaker = typeof rawA['speaker'] === 'string' ? rawA['speaker'] : '（発言者不明）'
      const answerSummary = typeof rawA['summary'] === 'string' ? rawA['summary'] : ''
      const answerSources = resolveSourceIds(rawA['source_ids'], idMap, sourceCounts.answer)

      // assessment
      const rawAss = typeof obj['assessment'] === 'object' && obj['assessment'] !== null
        ? (obj['assessment'] as Record<string, unknown>)
        : {}
      const responseType = safeResponseType(rawAss['response_type'])
      const note = typeof rawAss['note'] === 'string' ? rawAss['note'] : ''

      return {
        topic,
        question: { speaker: questionSpeaker, summary: questionSummary, sources: questionSources },
        answer:   { speaker: answerSpeaker,   summary: answerSummary,   sources: answerSources },
        assessment: { response_type: responseType, note },
      }
    })

    // unanswered フィルタ
    const filteredPairs = includeUnanswered
      ? qa_pairs
      : qa_pairs.filter((p) => p.assessment.response_type !== 'unanswered')

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

    // conclusion の出典が空の場合は代表発言から補完
    const finalConclusionSources = conclusionSources.length > 0
      ? conclusionSources
      : itemsToSources(limited.slice(0, sourceCounts.conclusion), sourceCounts.conclusion)

    logger.info('QAペア要約完了', { pairCount: String(filteredPairs.length) })

    return {
      issueID: options.issueID,
      overview,
      qa_pairs: filteredPairs,
      conclusion: { text: conclusionText, sources: finalConclusionSources },
    }
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`QAペア要約 LLM 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}
