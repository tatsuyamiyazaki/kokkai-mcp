import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { LlmApiError, getErrorMessage } from '../utils/errors.js'
import type { SpeechItem, SourceInfo, TopicSummary } from '../types/index.js'

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey })

/** LLM JSON レスポンスをパースする */
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
 * source_ids → SourceInfo[] に変換する
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
 * 発言リストから論点を抽出し、各論点に発言を分類する
 *
 * - 論点数: 2〜5 件
 * - 各論点に 1〜3 件の出典
 * - 分類不能な発言は「その他」に退避（内部処理）
 */
export async function extractTopics(
  items: SpeechItem[],
  idMap: Map<string, SpeechItem>,
  focus?: string,
): Promise<TopicSummary[]> {
  if (items.length === 0) return []

  const focusInstruction = focus
    ? `\n特に「${focus}」に関する論点を優先して抽出してください。`
    : ''

  // LLM 入力用：ID 付き発言一覧
  const speechListText = Array.from(idMap.entries())
    .map(([id, item]) => `[${id}] ${item.speaker}「${item.speech.slice(0, 300)}」`)
    .join('\n\n')

  const prompt = `以下は国会の発言記録です。議論の論点を 2〜5 件に分解し、各論点に関連する発言をまとめてください。${focusInstruction}

発言に含まれていない内容は推測せず、発言の整理に徹してください。
分類できない発言は無理に分類しないでください。
各論点の source_ids には、その論点に最も関連する発言 ID を 1〜3 件指定してください。

発言一覧:
${speechListText}

以下の JSON 形式で回答してください:
{
  "topics": [
    {
      "topic": "論点のタイトル（15文字以内）",
      "summary": "この論点に関する議論の要点（2〜3文）",
      "source_ids": ["S1", "S2"]
    }
  ]
}`

  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new LlmApiError('LLM からテキストレスポンスが返されませんでした')
    }

    const parsed = parseJsonResponse(content.text)
    const rawTopics = parsed['topics']
    if (!Array.isArray(rawTopics)) return []

    return rawTopics.map((t) => {
      const obj = typeof t === 'object' && t !== null ? (t as Record<string, unknown>) : {}
      const topic   = typeof obj['topic']   === 'string' ? obj['topic']   : '（論点不明）'
      const summary = typeof obj['summary'] === 'string' ? obj['summary'] : ''
      const sources = resolveSourceIds(obj['source_ids'], idMap, 3)
      return { topic, summary, sources }
    })
  } catch (err) {
    if (err instanceof LlmApiError) throw err
    throw new LlmApiError(`論点抽出 LLM 呼び出し失敗: ${getErrorMessage(err)}`)
  }
}
