/** 発言アイテム（search_speeches / get_meeting の出力） */
export interface SpeechItem {
  speechID: string
  issueID: string
  date?: string
  nameOfMeeting?: string
  speaker: string
  speech: string
  speechOrder?: number
}

/** search_speeches の出力 */
export interface SearchResult {
  total: number
  items: SpeechItem[]
}

/** 会議録 */
export interface MeetingRecord {
  issueID: string
  date: string
  nameOfMeeting: string
  speeches: SpeechItem[]
}

/** 出典情報 */
export interface SourceInfo {
  speechID: string
  issueID: string
  speaker: string
  date: string
  nameOfMeeting: string
  excerpt: string
}

/** 出典付き論点（main_points の各要素） */
export interface SourcedPoint {
  point: string
  sources: SourceInfo[]
}

/** 出典付き発言者要点（speaker_points の各要素） */
export interface SourcedSpeakerPoint {
  speaker: string
  point: string
  sources: SourceInfo[]
}

/** 出典付き結論 */
export interface SourcedConclusion {
  text: string
  sources: SourceInfo[]
}

/** 要約結果 */
export interface SummaryResult {
  overview: string
  main_points: SourcedPoint[]
  speaker_points: SourcedSpeakerPoint[]
  conclusion: SourcedConclusion
  caution?: string
  issueID?: string
}

/** 要約モード */
export type SummaryMode = 'brief' | 'standard' | 'detailed'

/** 出力テンプレート */
export type OutputTemplate = 'standard' | 'analysis' | 'brief_report'

/** 論点別要約（analysis モード） */
export interface TopicSummary {
  topic: string
  summary: string
  sources: SourceInfo[]
}

/** 発言者比較（analysis モード） */
export interface SpeakerComparison {
  speaker: string
  position: string
  point: string
  sources: SourceInfo[]
}

/** analysis モードの要約結果 */
export interface AnalysisResult {
  overview: string
  topics: TopicSummary[]
  speaker_comparison: SpeakerComparison[]
  conclusion: SourcedConclusion
  caution?: string
  issueID?: string
}

/** summarize 共通オプション（rev02 追加パラメータ） */
export interface SummarizeExtendedOptions {
  include_topics?: boolean
  include_speaker_comparison?: boolean
  output_template?: OutputTemplate
}

/** 国会 API の speech エンドポイントレスポンス */
export interface KokkaiSpeechApiResponse {
  numberOfRecords: number
  numberOfReturn: number
  startRecord: number
  nextRecordPosition: number | null
  speechRecord: KokkaiSpeechRecord[]
}

export interface KokkaiSpeechRecord {
  speechID: string
  issueID: string
  date: string
  nameOfMeeting: string
  speaker: string
  speech: string
  speechOrder?: number
  [key: string]: unknown
}

// ─── Rev03: 時系列比較機能 ────────────────────────────────────────────────────

/** 比較期間の指定 */
export interface ComparePeriod {
  label: string
  from: string
  until: string
}

/** 期間ごとの要約（compare_over_time 内部用） */
export interface PeriodSummary {
  label: string
  summary: string
  topics: TopicSummary[]
  sources: SourceInfo[]
  itemCount: number
}

/** 論点変化の種別 */
export type TopicChangeType = 'continued' | 'expanded' | 'reduced' | 'new' | 'shifted'

/** 論点変化エントリ */
export interface TopicChange {
  topic: string
  change_type: TopicChangeType
  description: string
  sources: Record<string, SourceInfo[]>
}

/** 発言者変化エントリ */
export interface SpeakerChange {
  speaker: string
  change: string
  sources: Record<string, SourceInfo[]>
}

/** 比較サマリ */
export interface ComparisonSummary {
  overview: string
  key_changes: string[]
  common_points: string[]
  new_points: Array<{ period: string; point: string; sources: SourceInfo[] }>
}

/** compare_over_time の出力結果 */
export interface CompareOverTimeResult {
  query: string
  comparison_summary: ComparisonSummary
  period_summaries: PeriodSummary[]
  topic_changes: TopicChange[]
  speaker_changes: SpeakerChange[]
  conclusion: SourcedConclusion
  caution?: string
}

/** 国会 API の meeting エンドポイントレスポンス */
export interface KokkaiMeetingApiResponse {
  numberOfRecords: number
  numberOfReturn: number
  meetingRecord: KokkaiMeetingRecord[]
}

export interface KokkaiMeetingRecord {
  issueID: string
  date: string
  nameOfMeeting: string
  speechRecord: KokkaiSpeechRecord[]
  [key: string]: unknown
}
