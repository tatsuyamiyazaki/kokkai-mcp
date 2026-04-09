import { config } from '../config/index.js'
import { KokkaiApiError, NotFoundError, getErrorMessage } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { buildCacheKey, getCache, setCache } from './cache.js'
import type {
  SearchResult,
  MeetingRecord,
  SpeechItem,
  KokkaiSpeechApiResponse,
  KokkaiMeetingApiResponse,
} from '../types/index.js'

export interface SearchSpeechesParams {
  query?: string | undefined
  speaker?: string | undefined
  nameOfMeeting?: string | undefined
  from?: string | undefined
  until?: string | undefined
  limit?: number | undefined
}

/** fetch with timeout using AbortController */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    return response
  } finally {
    clearTimeout(timer)
  }
}

/** リトライ付き fetch */
async function fetchWithRetry(url: string, maxRetries: number): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, config.requestTimeoutMs)
      if (response.ok) {
        return response
      }
      // 4xx は即時エラー（リトライ不要）
      if (response.status >= 400 && response.status < 500) {
        throw new KokkaiApiError(
          `国会 API エラー: HTTP ${response.status}`,
          response.status,
          false,
        )
      }
      // 5xx はリトライ対象
      lastError = new KokkaiApiError(
        `国会 API サーバーエラー: HTTP ${response.status}`,
        response.status,
        true,
      )
    } catch (err) {
      if (err instanceof KokkaiApiError && !err.retryable) {
        throw err
      }
      lastError = err
      if (attempt < maxRetries) {
        const waitMs = 1000 * (attempt + 1)
        logger.warn('国会 API 呼び出し失敗、リトライ中', {
          attempt: String(attempt + 1),
          maxRetries: String(maxRetries),
          waitMs: String(waitMs),
          error: getErrorMessage(err),
        })
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }
    }
  }
  throw lastError instanceof KokkaiApiError
    ? lastError
    : new KokkaiApiError(`国会 API 呼び出し失敗: ${getErrorMessage(lastError)}`)
}

/** SpeechRecord を SpeechItem に変換 */
function toSpeechItem(record: KokkaiSpeechApiResponse['speechRecord'][number]): SpeechItem {
  return {
    speechID: record.speechID,
    issueID: record.issueID,
    date: record.date,
    nameOfMeeting: record.nameOfMeeting,
    speaker: record.speaker,
    speech: record.speech,
    ...(record.speechOrder !== undefined ? { speechOrder: record.speechOrder } : {}),
  }
}

/** 発言検索 */
export async function searchSpeeches(params: SearchSpeechesParams): Promise<SearchResult> {
  const limit = params.limit ?? 10
  const cacheKey = buildCacheKey('speech', { ...params, limit })
  const cached = getCache<SearchResult>(cacheKey)
  if (cached) {
    return cached
  }

  const url = new URL(`${config.kokkaiApiBaseUrl}/speech`)
  if (params.query) url.searchParams.set('any', params.query)
  if (params.speaker) url.searchParams.set('speaker', params.speaker)
  if (params.nameOfMeeting) url.searchParams.set('nameOfMeeting', params.nameOfMeeting)
  if (params.from) url.searchParams.set('from', params.from)
  if (params.until) url.searchParams.set('until', params.until)
  url.searchParams.set('maximumRecords', String(limit))
  url.searchParams.set('recordPacking', 'json')

  logger.info('国会 API 発言検索', { query: params.query, speaker: params.speaker })

  const response = await fetchWithRetry(url.toString(), config.maxRetries)
  const json = (await response.json()) as KokkaiSpeechApiResponse

  if (!json.speechRecord || json.speechRecord.length === 0) {
    const result: SearchResult = { total: 0, items: [] }
    setCache(cacheKey, result, 'speech')
    return result
  }

  const result: SearchResult = {
    total: json.numberOfRecords,
    items: json.speechRecord.map(toSpeechItem),
  }

  setCache(cacheKey, result, 'speech')
  logger.info('発言検索完了', { total: String(result.total), returned: String(result.items.length) })
  return result
}

/** 会議録取得 */
export async function getMeeting(issueID: string): Promise<MeetingRecord> {
  const cacheKey = `meeting:${issueID}`
  const cached = getCache<MeetingRecord>(cacheKey)
  if (cached) {
    return cached
  }

  const url = new URL(`${config.kokkaiApiBaseUrl}/meeting`)
  url.searchParams.set('issueID', issueID)
  url.searchParams.set('recordPacking', 'json')

  logger.info('国会 API 会議録取得', { issueID })

  const response = await fetchWithRetry(url.toString(), config.maxRetries)
  const json = (await response.json()) as KokkaiMeetingApiResponse

  if (!json.meetingRecord || json.meetingRecord.length === 0) {
    throw new NotFoundError(`issueID "${issueID}" の会議録が見つかりませんでした。`)
  }

  const meeting = json.meetingRecord[0]
  if (!meeting) {
    throw new NotFoundError(`issueID "${issueID}" の会議録が見つかりませんでした。`)
  }

  const record: MeetingRecord = {
    issueID: meeting.issueID,
    date: meeting.date,
    nameOfMeeting: meeting.nameOfMeeting,
    speeches: (meeting.speechRecord ?? []).map(toSpeechItem),
  }

  setCache(cacheKey, record, 'meeting')
  logger.info('会議録取得完了', { issueID, speechCount: String(record.speeches.length) })
  return record
}
