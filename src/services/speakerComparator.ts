import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { LlmApiError, getErrorMessage } from '../utils/errors.js'
import type { SpeechItem, SourceInfo, SpeakerComparison } from '../types/index.js'

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey })

/** 立場ラベル候補（固定） */
const POSITION_LABELS = ['推進', '慎重', '規制強化', '中立', '説明中心'] as const

/** LLM JSON レスポンスをパースする */
function parseJsonResponse(text: string): Record<string, unknown> {
  // 閉じ ``` あり → 閉じ ``` なし（途中切れ）→ 裸の {...}
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) ??
    text.match(/```json\s*([\s\S]*)/) ??
    text.match(/(\{[\s\S]*\})/)
  const jsonText = jsonMatch?.[1] ?? text
  try {
    return JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    throw new LlmApiError(`LLM レスポンスを JSON としてパースできませんでした: ${text.slice(0, 100)}`, false)
  }
}

/**
 * 発言テキストから excerpt を生成する（最大 300 文字）
 */
function generateExcerpt(text: string, maxLength = 300): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
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
  return cutoff + '…'
}

/**
 * source_ids → SourceInfo[] に変換する（各発言者 1〜2 件）
 */
function resolveSourceIds(
  sourceIds: unknown,
  idMap: Map<string, SpeechItem>,
  maxSources: number,
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
    if (results.length >= maxSources) break
  }
  return results
}

/**
 * 発言者ごとに主張・立場をまとめて比較情報を生成する
 *
 * - 立場ラベル: 推進 / 慎重 / 規制強化 / 中立 / 説明中心（固定候補から選択）
 * - 各発言者に 1〜2 件の出典
 */
export async function compareSpeakers(
  items: SpeechItem[],
  idMap: Map<string, SpeechItem>,
  focus?: string,
): Promise<SpeakerComparison[]> {
  if (items.length === 0) return []

  const focusInstruction = focus
    ? `\n特に「${focus}」に関する立場の違いを明示してください。`
    : ''

  const speechListText = Array.from(idMap.entries())
    .map(([id, item]) => `[${id}] ${item.speaker}「${item.speech.slice(0, 300)}」`)
    .join('\n\n')

  const positionLabels = POSITION_LABELS.join(' / ')

  const prompt = `以下は国会の発言記録です。発言者ごとに主張をまとめ、立場の差を整理してください。${focusInstruction}

発言に含まれていない内容は推測せず、発言の整理に徹してください。
立場ラベルは以下の候補から最も適切なものを 1 つ選んでください: ${positionLabels}
各発言者の source_ids には、その発言者の代表的な発言 ID を 1〜2 件指定してください。
同一の発言者が複数回登場する場合は統合してください。

発言一覧:
${speechListText}

以下の JSON 形式で回答してください:
{
  "speaker_comparison": [
    {
      "speaker": "発言者名",
      "position": "立場ラベル（${positionLabels}）",
      "point": "主張の要旨（2〜3文）",
      "source_ids": ["S1", "S2"]
    }
  ]
}`

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new LlmApiError('LLM からテキストレスポンスが返されませんでした')
    }

    const parsed = parseJsonResponse(content.text)
    const rawComparisons = parsed['speaker_comparison']
    if (!Array.isArray(rawComparisons)) return []

    return rawComparisons.map((c) => {
      const obj = typeof c === 'object' && c !== null ? (c as Record<string, unknown>) : {}
      const speaker  = typeof obj['speaker']  === 'string' ? obj['speaker']  : '（発言者不明）'
      const position = typeof obj['position'] === 'string' ? obj['position'] : '中立'
      const point    = typeof obj['point']    === 'string' ? obj['point']    : ''
      const sources  = resolveSourceIds(obj['source_ids'], idMap, 2)
      return { speaker, position, point, sources }
    })
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`発言者比較 LLM 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}
