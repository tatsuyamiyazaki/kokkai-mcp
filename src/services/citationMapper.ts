/**
 * citationMapper.ts
 *
 * 出典ID紐づけ・excerpt生成・出典整形モジュール。
 * 既存 summarizer.ts の resolveSourceIds / generateExcerpt ロジックを共通化する。
 */

import type { SpeechItem, SourceInfo } from '../types/index.js'

/**
 * 発言テキストから excerpt を生成する（最大 300 文字）。
 * 句読点で切り詰め、文の途中切断を避ける。
 */
export function generateExcerpt(text: string, maxLength = 300): string {
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
 * SpeechItem を SourceInfo に変換する。
 */
export function toSourceInfo(item: SpeechItem): SourceInfo {
  return {
    speechID:      item.speechID,
    issueID:       item.issueID,
    speaker:       item.speaker,
    date:          item.date ?? '',
    nameOfMeeting: item.nameOfMeeting ?? '',
    excerpt:       generateExcerpt(item.speech),
  }
}

/**
 * source_ids（LLM が返す文字列配列）を SourceInfo[] に変換する。
 * 不明なIDは無視する。
 *
 * @param sourceIds - LLM が返した source_ids（任意型）
 * @param idMap     - ID → SpeechItem のマップ
 * @param maxSources - 最大出典数
 */
export function resolveSourceIds(
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
    results.push(toSourceInfo(item))
    if (results.length >= maxSources) break
  }
  return results
}

/**
 * SpeechItem のリストから SourceInfo[] を生成する（直接マッピング）。
 * source_ids を介さず、渡された発言をそのまま出典にする。
 *
 * @param items      - 出典にする発言リスト
 * @param maxSources - 最大出典数
 */
export function itemsToSources(items: SpeechItem[], maxSources: number): SourceInfo[] {
  return items.slice(0, maxSources).map(toSourceInfo)
}

/**
 * 発言リストに連番ID（S1, S2, ...）を付与してマップを返す。
 */
export function assignSpeechIds(items: SpeechItem[]): Map<string, SpeechItem> {
  const map = new Map<string, SpeechItem>()
  items.forEach((item, index) => {
    map.set(`S${index + 1}`, item)
  })
  return map
}

/**
 * ID付き発言テキストを生成する（LLM 入力用）。
 * 各発言を "[S1] 発言者「...」" 形式にフォーマットする。
 */
export function formatSpeechesWithIds(
  idMap: Map<string, SpeechItem>,
  maxSpeechLength = 400,
): string {
  return Array.from(idMap.entries())
    .map(([id, item]) => `[${id}] ${item.speaker}「${item.speech.slice(0, maxSpeechLength)}」`)
    .join('\n\n')
}

/**
 * JSON レスポンスをパースする共通関数。
 */
export function parseJsonResponse(text: string): Record<string, unknown> {
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) ??
    text.match(/```json\s*([\s\S]*)/) ??
    text.match(/(\{[\s\S]*\})/)
  const jsonText = jsonMatch?.[1] ?? text
  try {
    return JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    // パース失敗時は空オブジェクトを返す（呼び出し元でフォールバック）
    return {}
  }
}
