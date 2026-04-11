/**
 * cacheKeyBuilder.ts
 *
 * キャッシュキー生成モジュール。
 * 仕様: docs/Requirement_Rev05.md §8
 *
 * - 同一意味の入力は同一キーになること
 * - 不要な空白・順不同差異を吸収すること
 * - モードや出力オプションの違いを区別すること
 */

import { createHash } from 'crypto'

export type CacheType =
  | 'search_result'
  | 'meeting_detail'
  | 'summary'
  | 'qa_pairs'
  | 'party_compare'
  | 'time_compare'
  | 'topic_changes'

// ─── 正規化ユーティリティ ──────────────────────────────────────────────────────

/** 文字列の前後空白除去・undefinedは空文字に統一 */
function norm(v: string | undefined | null): string {
  return (v ?? '').trim()
}

/** 真偽値を 'true'/'false' に統一 */
function normBool(v: boolean | undefined): string {
  return v === true ? 'true' : 'false'
}

/** 日付文字列を正規化（YYYY-MM-DD のみ許容、それ以外は空文字） */
function normDate(v: string | undefined): string {
  const s = norm(v)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/** キー文字列を組み立てて SHA-256 先頭 16 文字でハッシュ化 */
function hashKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16)
}

// ─── 各種キャッシュキー生成関数 ───────────────────────────────────────────────

export interface SearchResultKeyParams {
  query?: string
  from?: string
  until?: string
  nameOfMeeting?: string
  speaker?: string
  limit?: number
}

/**
 * 検索結果キャッシュキー
 * 例: search_result:query=生成AI|from=2025-01-01|until=2025-12-31|meeting=予算委員会|speaker=
 */
export function buildSearchResultKey(params: SearchResultKeyParams): string {
  const raw = [
    `query=${norm(params.query)}`,
    `from=${normDate(params.from)}`,
    `until=${normDate(params.until)}`,
    `meeting=${norm(params.nameOfMeeting)}`,
    `speaker=${norm(params.speaker)}`,
    `limit=${params.limit ?? ''}`,
  ].join('|')
  return `search_result:${raw}`
}

export interface MeetingDetailKeyParams {
  issueID: string
}

/**
 * 会議録取得キャッシュキー
 * 例: meeting_detail:issueID=abc123
 */
export function buildMeetingDetailKey(params: MeetingDetailKeyParams): string {
  return `meeting_detail:issueID=${norm(params.issueID)}`
}

export interface SummaryKeyParams {
  issueID?: string
  /** speechID一覧（issueIDがない場合） */
  speechIDs?: string[]
  mode?: string
  focus?: string
  include_topics?: boolean
  include_speaker_comparison?: boolean
  output_template?: string
}

/**
 * 要約キャッシュキー
 * 例: summary:issueID=abc123|mode=analysis|focus=生成AI|include_topics=true|include_speaker_comparison=true
 */
export function buildSummaryKey(params: SummaryKeyParams): string {
  let idPart: string
  if (params.issueID) {
    idPart = `issueID=${norm(params.issueID)}`
  } else {
    // speechIDsでキーを生成（ソートして順序固定）
    const sorted = [...(params.speechIDs ?? [])].sort()
    idPart = `speechIDs=${hashKey(sorted.join(','))}`
  }
  const raw = [
    idPart,
    `mode=${norm(params.mode)}`,
    `focus=${norm(params.focus)}`,
    `include_topics=${normBool(params.include_topics)}`,
    `include_speaker_comparison=${normBool(params.include_speaker_comparison)}`,
    `output_template=${norm(params.output_template)}`,
  ].join('|')
  return `summary:${raw}`
}

export interface QaPairsKeyParams {
  issueID: string
  focus?: string
  mode?: string
  max_pairs?: number
  include_unanswered?: boolean
}

/**
 * QAペアキャッシュキー
 * 例: qa_pairs:issueID=abc123|focus=生成AI|mode=standard|max_pairs=10
 */
export function buildQaPairsKey(params: QaPairsKeyParams): string {
  const raw = [
    `issueID=${norm(params.issueID)}`,
    `focus=${norm(params.focus)}`,
    `mode=${norm(params.mode)}`,
    `max_pairs=${params.max_pairs ?? ''}`,
    `include_unanswered=${normBool(params.include_unanswered)}`,
  ].join('|')
  return `qa_pairs:${raw}`
}

export interface PartyCompareKeyParams {
  query: string
  from?: string
  until?: string
  nameOfMeeting?: string
  mode?: string
  include_common_points?: boolean
  include_differences?: boolean
  max_items?: number
}

/**
 * 政党別比較キャッシュキー
 * 例: party_compare:query=生成AI|from=2025-01-01|until=2025-12-31|mode=standard
 */
export function buildPartyCompareKey(params: PartyCompareKeyParams): string {
  const raw = [
    `query=${norm(params.query)}`,
    `from=${normDate(params.from)}`,
    `until=${normDate(params.until)}`,
    `meeting=${norm(params.nameOfMeeting)}`,
    `mode=${norm(params.mode)}`,
    `common=${normBool(params.include_common_points)}`,
    `diff=${normBool(params.include_differences)}`,
    `max=${params.max_items ?? ''}`,
  ].join('|')
  return `party_compare:${raw}`
}

export interface TimeCompareKeyParams {
  query: string
  periods: Array<{ label: string; from: string; until: string }>
  nameOfMeeting?: string
  speaker?: string
  mode?: string
  include_topics?: boolean
  include_speaker_changes?: boolean
  max_items_per_period?: number
}

/**
 * 時系列比較キャッシュキー
 * 期間配列はラベル順をそのまま使用（ユーザー指定順序に意味があるため）
 */
export function buildTimeCompareKey(params: TimeCompareKeyParams): string {
  const periodStr = params.periods
    .map((p) => `${norm(p.label)}:${normDate(p.from)}_${normDate(p.until)}`)
    .join(',')
  const raw = [
    `query=${norm(params.query)}`,
    `periods=${hashKey(periodStr)}`,
    `meeting=${norm(params.nameOfMeeting)}`,
    `speaker=${norm(params.speaker)}`,
    `mode=${norm(params.mode)}`,
    `topics=${normBool(params.include_topics)}`,
    `spk_chg=${normBool(params.include_speaker_changes)}`,
    `max=${params.max_items_per_period ?? ''}`,
  ].join('|')
  return `time_compare:${raw}`
}

export interface TopicChangesKeyParams {
  query: string
  periods: Array<{ label: string; from: string; until: string }>
  mode?: string
  max_items_per_period?: number
  include_emerging_topics?: boolean
  nameOfMeeting?: string
}

/**
 * 論点増減分析キャッシュキー
 * 例: topic_changes:query=生成AI|period1=2024-01-01_2024-12-31|period2=2025-01-01_2025-12-31|mode=standard
 */
export function buildTopicChangesKey(params: TopicChangesKeyParams): string {
  const periodStr = params.periods
    .map((p) => `${norm(p.label)}:${normDate(p.from)}_${normDate(p.until)}`)
    .join(',')
  const raw = [
    `query=${norm(params.query)}`,
    `periods=${hashKey(periodStr)}`,
    `mode=${norm(params.mode)}`,
    `max=${params.max_items_per_period ?? ''}`,
    `emerging=${normBool(params.include_emerging_topics)}`,
    `meeting=${norm(params.nameOfMeeting)}`,
  ].join('|')
  return `topic_changes:${raw}`
}

// ─── 汎用ハッシュキー生成（後方互換・テスト用） ───────────────────────────────

/**
 * 汎用キャッシュキー生成（既存 cache.ts から移行した buildCacheKey の代替）
 * params をソート済みJSONにして SHA-256 先頭16文字でハッシュ化する。
 */
export function buildGenericCacheKey(prefix: string, params: unknown): string {
  const keys =
    typeof params === 'object' && params !== null
      ? Object.keys(params as Record<string, unknown>).sort()
      : []
  const json = JSON.stringify(params, keys)
  const hash = hashKey(json)
  return `${prefix}:${hash}`
}

// ─── source_hash 生成 ─────────────────────────────────────────────────────────

export interface SourceHashInput {
  speechIDs?: string[]
  issueIDs?: string[]
  speakers?: string[]
  dates?: string[]
  texts?: string[]
}

/**
 * source_hash 生成（仕様 §11）
 * 発言順を固定し、必須項目を連結して SHA-256 ハッシュ化する。
 */
export function buildSourceHash(input: SourceHashInput): string {
  const parts: string[] = [
    (input.speechIDs ?? []).join(','),
    (input.issueIDs ?? []).join(','),
    (input.speakers ?? []).join(','),
    (input.dates ?? []).join(','),
    (input.texts ?? []).join('\n'),
  ]
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex')
}
