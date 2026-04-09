import { z } from 'zod'
import { getMeeting as apiGetMeeting } from '../services/kokkaiApi.js'
import { ValidationError, formatErrorForMcp } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export const GetMeetingSchema = z.object({
  issueID: z.string().min(1, 'issueID は必須です'),
})

export const getMeetingTool = {
  name: 'get_meeting' as const,
  description:
    '会議録識別子 (issueID) を指定して会議録全体を取得します。search_speeches の results[].issueID から取得した ID を使用してください。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      issueID: {
        type: 'string',
        description: '会議録識別子（search_speeches の items[].issueID から取得）',
      },
    },
    required: ['issueID'],
    additionalProperties: false,
  },
}

export async function handleGetMeeting(input: unknown) {
  try {
    const parseResult = GetMeetingSchema.safeParse(input)
    if (!parseResult.success) {
      throw new ValidationError(
        `入力値エラー: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      )
    }

    const { issueID } = parseResult.data
    logger.debug('get_meeting 呼び出し', { issueID })

    const result = await apiGetMeeting(issueID)

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    logger.error('get_meeting エラー', { error: err instanceof Error ? err.message : String(err) })
    return {
      isError: true,
      content: [{ type: 'text' as const, text: formatErrorForMcp(err) }],
    }
  }
}
