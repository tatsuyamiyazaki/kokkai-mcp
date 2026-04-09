import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { LlmApiError, getErrorMessage } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { preprocessSpeeches, splitIntoChunks } from './preprocess.js'
import type {
  SpeechItem,
  SummaryMode,
  SummaryResult,
  SourceInfo,
  SourcedPoint,
  SourcedSpeakerPoint,
  SourcedConclusion,
} from '../types/index.js'

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey })

/** モード別の最大出典数（per 論点） */
const MODE_SOURCE_COUNT: Record<SummaryMode, { min: number; max: number }> = {
  brief:    { min: 1, max: 1 },
  standard: { min: 1, max: 2 },
  detailed: { min: 2, max: 3 },
}

/** モード別の要約指示 */
const MODE_INSTRUCTIONS: Record<SummaryMode, string> = {
  brief: '非常に短く要点のみをまとめてください。overview は 2〜3 文、main_points は最大 3 項目、speaker_points は主要な発言者のみ。',
  standard: '主な論点と登壇者別の発言ポイントを含めてまとめてください。',
  detailed: '論点別に詳細に整理してください。賛成・慎重・反対の意見も分けて記述し、各発言者の主張を丁寧に整理してください。',
}

/** コスト制御: LLMに渡す最大発言数 */
const MAX_SPEECHES_FOR_LLM = 25

/**
 * 発言リストを番号付きIDでフォーマットする（LLM入力用）
 * [S1] 発言者「...」 形式
 */
function assignSpeechIds(items: SpeechItem[]): Map<string, SpeechItem> {
  const map = new Map<string, SpeechItem>()
  items.forEach((item, index) => {
    map.set(`S${index + 1}`, item)
  })
  return map
}

/** LLM入力用にID付き発言テキストを生成する */
function formatSpeechesWithIds(idMap: Map<string, SpeechItem>): string {
  return Array.from(idMap.entries())
    .map(([id, item]) => `[${id}] ${item.speaker}「${item.speech.slice(0, 400)}」`)
    .join('\n\n')
}

/**
 * 発言テキストから excerpt を生成する
 * - 最大300文字
 * - 文の途中切断を避ける
 * - 改行・余分な空白を整形
 */
function generateExcerpt(text: string, maxLength = 300): string {
  // 改行・連続空白を整形
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  // 句読点で切る
  const cutoff = normalized.slice(0, maxLength)
  const lastPunct = Math.max(
    cutoff.lastIndexOf('。'),
    cutoff.lastIndexOf('、'),
    cutoff.lastIndexOf('．'),
    cutoff.lastIndexOf('，'),
  )
  if (lastPunct > maxLength * 0.5) {
    return normalized.slice(0, lastPunct + 1)
  }
  // 句読点が見つからない場合はそのまま切る
  return cutoff + '…'
}

/**
 * source_ids（例: ["S1","S2"]）を SourceInfo[] に変換する
 * 不明なIDは無視する（エラー処理ケース1）
 */
function resolveSourceIds(
  sourceIds: unknown,
  idMap: Map<string, SpeechItem>,
): SourceInfo[] {
  if (!Array.isArray(sourceIds)) return []
  const results: SourceInfo[] = []
  for (const rawId of sourceIds) {
    if (typeof rawId !== 'string') continue
    const item = idMap.get(rawId)
    if (!item) continue
    results.push({
      speechID:      item.speechID,
      issueID:       item.issueID,
      speaker:       item.speaker,
      date:          item.date ?? '',
      nameOfMeeting: item.nameOfMeeting ?? '',
      excerpt:       generateExcerpt(item.speech),
    })
  }
  return results
}

/** JSON レスポンスをパースする共通関数 */
function parseJsonResponse(text: string): Record<string, unknown> {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ?? text.match(/(\{[\s\S]*\})/)
  const jsonText = jsonMatch?.[1] ?? text
  try {
    return JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    throw new LlmApiError(`LLM レスポンスを JSON としてパースできませんでした: ${text.slice(0, 100)}`, false)
  }
}

/**
 * チャンクを 1 つ部分要約する（出典ID付き）
 * チャンク要約では source_ids を含む中間フォーマットを返す
 */
async function summarizeChunk(
  items: SpeechItem[],
  mode: SummaryMode,
  focus?: string,
): Promise<{ summaryText: string; idMap: Map<string, SpeechItem> }> {
  // コスト制御: 上位 MAX_SPEECHES_FOR_LLM 件のみ
  const limited = items.slice(0, MAX_SPEECHES_FOR_LLM)
  const idMap = assignSpeechIds(limited)
  const speechesText = formatSpeechesWithIds(idMap)

  const modeInstruction = MODE_INSTRUCTIONS[mode]
  const focusInstruction = focus ? `\n特に「${focus}」に関する内容に焦点を当ててください。` : ''

  const prompt = `以下は国会の発言記録です。${modeInstruction}${focusInstruction}

発言に含まれていない内容は推測せず、発言の整理に徹してください。

発言:
${speechesText}

以下の JSON 形式で回答してください:
{
  "summary": "この発言群の要約テキスト（出典IDの参照情報も含めて記述）"
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
    return { summaryText: content.text, idMap }
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`LLM API 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}

/** LLM の出力から SourcedPoint[] を構築する */
function buildSourcedPoints(
  rawPoints: unknown,
  idMap: Map<string, SpeechItem>,
  maxSources: number,
): SourcedPoint[] {
  if (!Array.isArray(rawPoints)) return []
  return rawPoints.map((p) => {
    const point = typeof p === 'object' && p !== null ? p : {}
    const text = typeof (point as Record<string, unknown>)['point'] === 'string'
      ? (point as Record<string, unknown>)['point'] as string
      : ''
    const sourceIds = (point as Record<string, unknown>)['source_ids']
    const sources = resolveSourceIds(sourceIds, idMap).slice(0, maxSources)
    return { point: text, sources }
  })
}

/** LLM の出力から SourcedSpeakerPoint[] を構築する */
function buildSourcedSpeakerPoints(
  rawPoints: unknown,
  idMap: Map<string, SpeechItem>,
  maxSources: number,
): SourcedSpeakerPoint[] {
  if (!Array.isArray(rawPoints)) return []
  return rawPoints.map((p) => {
    const point = typeof p === 'object' && p !== null ? p : {}
    const speaker = typeof (point as Record<string, unknown>)['speaker'] === 'string'
      ? (point as Record<string, unknown>)['speaker'] as string
      : ''
    const text = typeof (point as Record<string, unknown>)['point'] === 'string'
      ? (point as Record<string, unknown>)['point'] as string
      : ''
    const sourceIds = (point as Record<string, unknown>)['source_ids']
    const sources = resolveSourceIds(sourceIds, idMap).slice(0, maxSources)
    return { speaker, point: text, sources }
  })
}

/** LLM の出力から SourcedConclusion を構築する */
function buildSourcedConclusion(
  rawConclusion: unknown,
  idMap: Map<string, SpeechItem>,
  maxSources: number,
): SourcedConclusion {
  if (typeof rawConclusion === 'string') {
    // フォールバック: 出典なし
    return { text: rawConclusion, sources: [] }
  }
  if (typeof rawConclusion === 'object' && rawConclusion !== null) {
    const obj = rawConclusion as Record<string, unknown>
    const text = typeof obj['text'] === 'string' ? obj['text'] : '（結論の抽出に失敗しました）'
    const sources = resolveSourceIds(obj['source_ids'], idMap).slice(0, maxSources)
    return { text, sources }
  }
  return { text: '（結論の抽出に失敗しました）', sources: [] }
}

/**
 * 統合要約を生成する（出典ID付き）
 * 複数チャンクの部分要約テキストと全発言IDマップを受け取り、最終要約を生成する
 */
async function integrateSummaries(
  chunkSummaries: string[],
  globalIdMap: Map<string, SpeechItem>,
  mode: SummaryMode,
  focus?: string,
  meetingInfo?: string,
): Promise<SummaryResult> {
  const modeInstruction = MODE_INSTRUCTIONS[mode]
  const focusInstruction = focus ? `\n特に「${focus}」に関する内容に焦点を当ててください。` : ''
  const meetingLine = meetingInfo ? `\n会議: ${meetingInfo}` : ''
  const { max: maxSources } = MODE_SOURCE_COUNT[mode]

  // 全発言のID一覧をプロンプトに含める
  const speechListText = formatSpeechesWithIds(globalIdMap)
  const sourceCountInstruction = mode === 'brief'
    ? '各論点に source_ids を 1 件指定してください。'
    : mode === 'standard'
    ? '各論点に source_ids を 1〜2 件指定してください。'
    : '各論点に source_ids を 2〜3 件指定してください。発言者別の source_ids も指定してください。'

  const prompt = `以下は国会議事録の分割要約と発言一覧です。これらを統合して最終的な要約を作成してください。${meetingLine}
${modeInstruction}${focusInstruction}

発言に含まれていない内容は推測せず、議論の整理に徹してください。
出典IDは必ず発言一覧に存在するIDのみ使用してください。
${sourceCountInstruction}

--- 発言一覧 ---
${speechListText}

--- 分割要約 ---
${chunkSummaries.join('\n\n---\n\n')}

以下の JSON 形式で回答してください:
{
  "overview": "会議の概要（2〜4文）",
  "main_points": [
    {
      "point": "論点の説明",
      "source_ids": ["S1", "S2"]
    }
  ],
  "speaker_points": [
    {
      "speaker": "発言者名",
      "point": "発言要旨",
      "source_ids": ["S3"]
    }
  ],
  "conclusion": {
    "text": "結論または審議の方向性",
    "source_ids": ["S1"]
  },
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

    const parsed = parseJsonResponse(content.text)

    const mainPoints = buildSourcedPoints(parsed['main_points'], globalIdMap, maxSources)
    const speakerPoints = buildSourcedSpeakerPoints(parsed['speaker_points'], globalIdMap, maxSources)
    const conclusion = buildSourcedConclusion(parsed['conclusion'], globalIdMap, maxSources)

    return {
      overview:       typeof parsed['overview'] === 'string' ? parsed['overview'] : '（要約生成に失敗しました）',
      main_points:    mainPoints,
      speaker_points: speakerPoints,
      conclusion,
      ...(typeof parsed['caution'] === 'string' ? { caution: parsed['caution'] } : {}),
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
 * 発言群を要約する（出典付き）
 * 1. preprocess（前処理）
 * 2. チャンク分割
 * 3. チャンクごとの部分要約
 * 4. 最終統合要約（出典IDをMCP側で復元）
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
      speaker_points: [],
      conclusion: { text: '発言データが不足しているため、結論を抽出できませんでした。', sources: [] },
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

  // 統合要約用にグローバルIDマップを作成
  // コスト制御: 全体でも最大 MAX_SPEECHES_FOR_LLM 件
  const globalItems = processed.slice(0, MAX_SPEECHES_FOR_LLM)
  const globalIdMap = assignSpeechIds(globalItems)

  // チャンクごとの部分要約（最大並列数を制限）
  const maxConcurrent = config.maxConcurrentRequests
  const chunkSummaries: string[] = []

  for (let i = 0; i < chunks.length; i += maxConcurrent) {
    const batch = chunks.slice(i, i + maxConcurrent)
    const batchResults = await Promise.all(
      batch.map((chunk) => summarizeChunk(chunk.items, mode, options.focus)),
    )
    chunkSummaries.push(...batchResults.map((r) => r.summaryText))
  }

  // 最終統合要約（グローバルIDマップを渡して出典を復元）
  logger.info('最終統合要約開始', { chunkCount: String(chunkSummaries.length) })
  const result = await integrateSummaries(
    chunkSummaries,
    globalIdMap,
    mode,
    options.focus,
    options.meetingInfo,
  )
  logger.info('要約完了')

  return result
}
