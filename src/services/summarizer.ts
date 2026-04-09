import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { LlmApiError, getErrorMessage } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { preprocessSpeeches, splitIntoChunks } from './preprocess.js'
import type { SpeechItem, SummaryMode, SummaryResult } from '../types/index.js'

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey })

/** モード別の要約指示 */
const MODE_INSTRUCTIONS: Record<SummaryMode, string> = {
  brief: '非常に短く要点のみをまとめてください。overview は 2〜3 文、main_points は最大 3 項目、speaker_points は主要な発言者のみ。',
  standard: '主な論点と登壇者別の発言ポイントを含めてまとめてください。',
  detailed: '論点別に詳細に整理してください。賛成・慎重・反対の意見も分けて記述し、各発言者の主張を丁寧に整理してください。',
}

/** 発言テキストを LLM 入力用にフォーマットする */
function formatSpeechesForPrompt(items: SpeechItem[]): string {
  return items
    .map(
      (item) =>
        `<speech speaker="${item.speaker}" date="${item.date}" meeting="${item.nameOfMeeting}">\n${item.speech}\n</speech>`,
    )
    .join('\n\n')
}

/** JSON レスポンスをパースして SummaryResult に変換する */
function parseSummaryResponse(text: string): Partial<SummaryResult> {
  // JSON ブロックを抽出
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ?? text.match(/(\{[\s\S]*\})/)
  const jsonText = jsonMatch?.[1] ?? text
  try {
    return JSON.parse(jsonText) as Partial<SummaryResult>
  } catch {
    throw new LlmApiError(`LLM レスポンスを JSON としてパースできませんでした: ${text.slice(0, 100)}`, false)
  }
}

/** チャンクを 1 つ要約する */
async function summarizeChunk(
  items: SpeechItem[],
  mode: SummaryMode,
  focus?: string,
): Promise<string> {
  const modeInstruction = MODE_INSTRUCTIONS[mode]
  const focusInstruction = focus ? `\n特に「${focus}」に関する内容に焦点を当ててください。` : ''

  const prompt = `以下は国会の発言記録です。${modeInstruction}${focusInstruction}

発言に含まれていない内容は推測せず、発言の整理に徹してください。

${formatSpeechesForPrompt(items)}

以下の JSON 形式で回答してください:
{
  "summary": "この発言群の要約テキスト"
}`

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: mode === 'brief' ? 500 : mode === 'standard' ? 1000 : 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new LlmApiError('LLM からテキストレスポンスが返されませんでした')
    }
    return content.text
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`LLM API 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}

/** 複数のチャンク要約を統合して最終要約を生成する */
async function integrateSummaries(
  chunkSummaries: string[],
  mode: SummaryMode,
  focus?: string,
  meetingInfo?: string,
): Promise<SummaryResult> {
  const modeInstruction = MODE_INSTRUCTIONS[mode]
  const focusInstruction = focus ? `\n特に「${focus}」に関する内容に焦点を当ててください。` : ''
  const meetingLine = meetingInfo ? `\n会議: ${meetingInfo}` : ''

  const prompt = `以下は国会議事録の分割要約です。これらを統合して最終的な要約を作成してください。${meetingLine}
${modeInstruction}${focusInstruction}

発言に含まれていない内容は推測せず、議論の整理に徹してください。

--- 分割要約 ---
${chunkSummaries.join('\n\n---\n\n')}

以下の JSON 形式で回答してください:
{
  "overview": "会議の概要（2〜4文）",
  "main_points": ["論点1", "論点2", "..."],
  "speaker_points": {
    "発言者名": "発言要旨",
    "...": "..."
  },
  "conclusion": "結論または審議の方向性",
  "caution": "推測や不確かな情報がある場合のみ記載。不要なら省略可"
}`

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: mode === 'brief' ? 800 : mode === 'standard' ? 1500 : 3000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new LlmApiError('LLM からテキストレスポンスが返されませんでした')
    }

    const parsed = parseSummaryResponse(content.text)

    return {
      overview: parsed.overview ?? '（要約生成に失敗しました）',
      main_points: parsed.main_points ?? [],
      speaker_points: parsed.speaker_points ?? {},
      conclusion: parsed.conclusion ?? '（結論の抽出に失敗しました）',
      ...(parsed.caution ? { caution: parsed.caution } : {}),
    }
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`LLM API 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}

export interface SummarizeOptions {
  mode?: SummaryMode | undefined
  focus?: string | undefined
  meetingInfo?: string | undefined
  keywords?: string[] | undefined
}

/**
 * 発言群を要約する
 * 1. preprocess（前処理）
 * 2. チャンク分割
 * 3. チャンクごとの部分要約
 * 4. 最終統合要約
 */
export async function summarizeSpeeches(
  items: SpeechItem[],
  options: SummarizeOptions = {},
): Promise<SummaryResult> {
  const mode = options.mode ?? 'standard'
  const keywords = options.keywords ?? (options.focus ? [options.focus] : [])

  logger.info('要約開始', { mode, itemCount: String(items.length) })

  // 前処理
  const processed = preprocessSpeeches(items, { keywords })
  logger.info('前処理完了', { before: String(items.length), after: String(processed.length) })

  if (processed.length === 0) {
    return {
      overview: '要約対象の発言が見つかりませんでした。',
      main_points: [],
      speaker_points: {},
      conclusion: '発言データが不足しているため、結論を抽出できませんでした。',
      caution: '形式的な発言のみ、または短い発言のみが含まれていた可能性があります。',
    }
  }

  // チャンク分割
  const chunks = splitIntoChunks(
    processed,
    config.summarize.maxCharsPerChunk,
    config.summarize.maxItemsPerChunk,
  )
  logger.info('チャンク分割完了', { chunkCount: String(chunks.length) })

  // チャンクごとの部分要約（最大並列数を制限）
  const maxConcurrent = config.maxConcurrentRequests
  const chunkSummaries: string[] = []

  for (let i = 0; i < chunks.length; i += maxConcurrent) {
    const batch = chunks.slice(i, i + maxConcurrent)
    const batchResults = await Promise.all(
      batch.map((chunk) => summarizeChunk(chunk.items, mode, options.focus)),
    )
    chunkSummaries.push(...batchResults)
  }

  // 最終統合要約
  logger.info('最終統合要約開始', { chunkCount: String(chunkSummaries.length) })
  const result = await integrateSummaries(chunkSummaries, mode, options.focus, options.meetingInfo)
  logger.info('要約完了')

  return result
}
