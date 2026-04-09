import { z } from 'zod'
import { getMeeting } from '../services/kokkaiApi.js'
import { summarizeSpeeches } from '../services/summarizer.js'
import { buildCacheKey, getCache, setCache } from '../services/cache.js'
import { ValidationError, formatErrorForMcp } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import type { SummaryResult } from '../types/index.js'

export const SummarizeMeetingSchema = z.object({
  issueID: z.string().min(1, 'issueID は必須です'),
  mode: z.enum(['brief', 'standard', 'detailed']).default('standard'),
  focus: z.string().optional(),
})

export const summarizeMeetingTool = {
  name: 'summarize_meeting' as const,
  description:
    '会議録識別子 (issueID) を指定して会議録全体を取得・要約します。get_meeting と summarize_speeches を内部でまとめて実行します。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      issueID: {
        type: 'string',
        description: '会議録識別子（search_speeches の items[].issueID から取得）',
      },
      mode: {
        type: 'string',
        enum: ['brief', 'standard', 'detailed'],
        default: 'standard',
        description:
          '要約モード: brief（短く低コスト）/ standard（標準）/ detailed（詳細、コスト高）',
      },
      focus: {
        type: 'string',
        description: '要約の焦点（例: "生成AI規制"）。省略可',
      },
    },
    required: ['issueID'],
    additionalProperties: false,
  },
}

export async function handleSummarizeMeeting(input: unknown) {
  try {
    const parseResult = SummarizeMeetingSchema.safeParse(input)
    if (!parseResult.success) {
      throw new ValidationError(
        `入力値エラー: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      )
    }

    const { issueID, mode, focus } = parseResult.data

    // キャッシュ確認
    const cacheKey = buildCacheKey('summary-meeting', { issueID, mode, focus })
    const cached = getCache<SummaryResult & { issueID: string }>(cacheKey)
    if (cached) {
      logger.info('会議録要約キャッシュ HIT', { issueID, mode })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }],
      }
    }

    logger.debug('summarize_meeting 呼び出し', { issueID, mode })

    // 会議録取得（内部キャッシュあり）
    const meeting = await getMeeting(issueID)

    // 要約実行
    const summary = await summarizeSpeeches(meeting.speeches, {
      mode,
      ...(focus !== undefined ? { focus } : {}),
      meetingInfo: `${meeting.nameOfMeeting ?? ''}（${meeting.date ?? ''}）`,
    })

    const result: SummaryResult & { issueID: string } = {
      issueID,
      ...summary,
    }

    setCache(cacheKey, result, 'summary')

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    logger.error('summarize_meeting エラー', { error: err instanceof Error ? err.message : String(err) })
    return {
      isError: true,
      content: [{ type: 'text' as const, text: formatErrorForMcp(err) }],
    }
  }
}
