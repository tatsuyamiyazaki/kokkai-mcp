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

/** 要約結果 */
export interface SummaryResult {
  overview: string
  main_points: string[]
  speaker_points: Record<string, string>
  conclusion: string
  caution?: string
  issueID?: string
}

/** 要約モード */
export type SummaryMode = 'brief' | 'standard' | 'detailed'

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
