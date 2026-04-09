import { z } from 'zod'
import { searchSpeeches as apiSearchSpeeches } from '../services/kokkaiApi.js'
import { ValidationError, formatErrorForMcp } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export const SearchSpeechesSchema = z
  .object({
    query: z.string().optional(),
    speaker: z.string().optional(),
    nameOfMeeting: z.string().optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で指定してください')
      .optional(),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で指定してください')
      .optional(),
    limit: z.number().int().min(1).max(100).default(10),
  })
  .refine((data) => data.query ?? data.speaker ?? data.nameOfMeeting, {
    message: 'query, speaker, nameOfMeeting のいずれか 1 つ以上を指定してください',
  })

export const searchSpeechesTool = {
  name: 'search_speeches' as const,
  description:
    '国会議事録から発言を検索します。キーワード・発言者・会議名・期間を組み合わせて条件指定できます。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: '本文検索キーワード（AND 検索）',
      },
      speaker: {
        type: 'string',
        description: '発言者名（部分一致）',
      },
      nameOfMeeting: {
        type: 'string',
        description: '会議名（部分一致）',
      },
      from: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: '検索開始日 (YYYY-MM-DD)',
      },
      until: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: '検索終了日 (YYYY-MM-DD)',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 10,
        description: '最大取得件数（既定: 10）',
      },
    },
    additionalProperties: false,
  },
}

export async function handleSearchSpeeches(input: unknown) {
  try {
    const parseResult = SearchSpeechesSchema.safeParse(input)
    if (!parseResult.success) {
      throw new ValidationError(
        `入力値エラー: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      )
    }

    const params = parseResult.data
    logger.debug('search_speeches 呼び出し', { query: params.query, speaker: params.speaker })

    const result = await apiSearchSpeeches(params)

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    logger.error('search_speeches エラー', { error: err instanceof Error ? err.message : String(err) })
    return {
      isError: true,
      content: [{ type: 'text' as const, text: formatErrorForMcp(err) }],
    }
  }
}
