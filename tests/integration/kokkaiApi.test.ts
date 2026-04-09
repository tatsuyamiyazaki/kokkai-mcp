import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 環境変数設定（config が読み込まれる前に必要）
process.env['ANTHROPIC_API_KEY'] = 'test-key'

// fetch をモック化
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { searchSpeeches, getMeeting } from '../../src/services/kokkaiApi.js'
import { KokkaiApiError, NotFoundError } from '../../src/utils/errors.js'

function makeSpeechApiResponse(count = 1) {
  return {
    numberOfRecords: count,
    numberOfReturn: count,
    startRecord: 1,
    nextRecordPosition: null,
    speechRecord: Array.from({ length: count }, (_, i) => ({
      speechID: `SPEECH_${i + 1}`,
      issueID: 'ISSUE_001',
      date: '2024-01-15',
      nameOfMeeting: '衆議院予算委員会',
      speaker: `議員${i + 1}`,
      speech: `生成AIに関する${i + 1}番目の発言です。政府の対応を求めます。`,
      speechOrder: i + 1,
    })),
  }
}

function makeMeetingApiResponse() {
  return {
    numberOfRecords: 1,
    numberOfReturn: 1,
    meetingRecord: [
      {
        issueID: 'ISSUE_001',
        date: '2024-01-15',
        nameOfMeeting: '衆議院予算委員会',
        speechRecord: [
          {
            speechID: 'SPEECH_001',
            issueID: 'ISSUE_001',
            date: '2024-01-15',
            nameOfMeeting: '衆議院予算委員会',
            speaker: '委員長',
            speech: 'これより質疑に入ります。',
            speechOrder: 1,
          },
          {
            speechID: 'SPEECH_002',
            issueID: 'ISSUE_001',
            date: '2024-01-15',
            nameOfMeeting: '衆議院予算委員会',
            speaker: '田中議員',
            speech: '生成AIの活用と規制について政府の見解を伺います。',
            speechOrder: 2,
          },
        ],
      },
    ],
  }
}

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  }
}

describe('searchSpeeches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正常レスポンスを SpeechItem[] に変換する', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse(makeSpeechApiResponse(2)))
    const result = await searchSpeeches({ query: '生成AI' })
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]?.speechID).toBe('SPEECH_1')
    expect(result.items[0]?.speaker).toBe('議員1')
  })

  it('検索結果 0 件のとき total: 0, items: [] を返す', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ numberOfRecords: 0, numberOfReturn: 0, startRecord: 1, nextRecordPosition: null, speechRecord: [] }),
    )
    const result = await searchSpeeches({ query: '存在しないキーワード' })
    expect(result.total).toBe(0)
    expect(result.items).toHaveLength(0)
  })

  it('5xx エラー時に KokkaiApiError (retryable: true) をスローする', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) })
    await expect(searchSpeeches({ query: 'AI' })).rejects.toThrow(KokkaiApiError)
  })

  it('fetch 例外（ネットワークエラー）時に KokkaiApiError をスローする', async () => {
    mockFetch.mockRejectedValue(new Error('ネットワークエラー'))
    await expect(searchSpeeches({ query: 'AI' })).rejects.toThrow(KokkaiApiError)
  })
})

describe('getMeeting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正常レスポンスを MeetingRecord に変換する', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse(makeMeetingApiResponse()))
    const result = await getMeeting('ISSUE_001')
    expect(result.issueID).toBe('ISSUE_001')
    expect(result.nameOfMeeting).toBe('衆議院予算委員会')
    expect(result.speeches).toHaveLength(2)
  })

  it('meetingRecord が空のとき NotFoundError をスローする', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ numberOfRecords: 0, numberOfReturn: 0, meetingRecord: [] }),
    )
    await expect(getMeeting('NONEXISTENT')).rejects.toThrow(NotFoundError)
  })
})
