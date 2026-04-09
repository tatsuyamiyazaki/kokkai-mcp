import { z } from 'zod'
import { summarizeSpeeches as apiSummarize, summarizeSpeechesAnalysis } from '../services/summarizer.js'
import { buildCacheKey, getCache, setCache } from '../services/cache.js'
import { config } from '../config/index.js'
import { ValidationError, TooManyItemsError, formatErrorForMcp } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import type { SummaryResult, AnalysisResult } from '../types/index.js'

const SpeechItemSchema = z.object({
  speechID: z.string(),
  issueID: z.string(),
  date: z.string().optional(),
  nameOfMeeting: z.string().optional(),
  speaker: z.string(),
  speech: z.string(),
  speechOrder: z.number().int().optional(),
})

export const SummarizeSpeechesSchema = z.object({
  items: z
    .array(SpeechItemSchema)
    .min(1, '要約対象の発言が 1 件以上必要です'),
  mode: z.enum(['brief', 'standard', 'detailed']).default('standard'),
  focus: z.string().optional(),
  include_topics: z.boolean().default(true),
  include_speaker_comparison: z.boolean().default(true),
  output_template: z.enum(['standard', 'analysis', 'brief_report']).default('analysis'),
})

export const summarizeSpeechesTool = {
  name: 'summarize_speeches' as const,
  description:
    '発言一覧を入力として要約を生成します。search_speeches の出力を直接渡して利用できます。mode で要約の詳細度を指定し、focus で焦点を絞ることができます。output_template="analysis" で論点別整理・発言者比較を含む詳細分析結果を返します。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        description: '要約対象の発言一覧（search_speeches の items フィールドをそのまま渡せます）',
        items: {
          type: 'object',
          properties: {
            speechID: { type: 'string' },
            issueID: { type: 'string' },
            date: { type: 'string' },
            nameOfMeeting: { type: 'string' },
            speaker: { type: 'string' },
            speech: { type: 'string' },
            speechOrder: { type: 'integer' },
          },
          required: ['speechID', 'issueID', 'speaker', 'speech'],
        },
        minItems: 1,
        maxItems: 200,
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
        description: '要約の焦点（例: "生成AI規制", "財政政策"）。省略可',
      },
      include_topics: {
        type: 'boolean',
        default: true,
        description: '論点別整理を含めるか（output_template="analysis" のときのみ有効）',
      },
      include_speaker_comparison: {
        type: 'boolean',
        default: true,
        description: '発言者比較を含めるか（output_template="analysis" のときのみ有効）',
      },
      output_template: {
        type: 'string',
        enum: ['standard', 'analysis', 'brief_report'],
        default: 'analysis',
        description:
          '出力テンプレート: analysis（論点・発言者比較あり）/ standard（従来形式）/ brief_report（従来形式の短縮版）',
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
}

export async function handleSummarizeSpeeches(input: unknown) {
  try {
    const parseResult = SummarizeSpeechesSchema.safeParse(input)
    if (!parseResult.success) {
      throw new ValidationError(
        `入力値エラー: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      )
    }

    const { items, mode, focus, include_topics, include_speaker_comparison, output_template } = parseResult.data

    if (items.length > config.summarize.maxTotalItems) {
      throw new TooManyItemsError(
        `発言数が上限（${config.summarize.maxTotalItems}件）を超えています。現在: ${items.length}件。` +
          `limit パラメータを小さくして検索件数を絞ってください。`,
      )
    }

    // キャッシュ確認
    const cacheKey = buildCacheKey('summary-speeches', {
      items: items.map((i) => i.speechID),
      mode,
      focus,
      include_topics,
      include_speaker_comparison,
      output_template,
    })
    const cached = getCache<SummaryResult | AnalysisResult>(cacheKey)
    if (cached) {
      logger.info('要約キャッシュ HIT', { mode, output_template })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }],
      }
    }

    logger.debug('summarize_speeches 呼び出し', {
      itemCount: String(items.length),
      mode,
      output_template,
    })

    const speechItems = items.map((i) => ({
      speechID: i.speechID,
      issueID: i.issueID,
      speaker: i.speaker,
      speech: i.speech,
      ...(i.date !== undefined ? { date: i.date } : {}),
      ...(i.nameOfMeeting !== undefined ? { nameOfMeeting: i.nameOfMeeting } : {}),
      ...(i.speechOrder !== undefined ? { speechOrder: i.speechOrder } : {}),
    }))

    let result: SummaryResult | AnalysisResult

    if (output_template === 'analysis') {
      result = await summarizeSpeechesAnalysis(speechItems, {
        mode,
        ...(focus !== undefined ? { focus } : {}),
        include_topics,
        include_speaker_comparison,
        output_template,
      })
    } else {
      result = await apiSummarize(speechItems, {
        mode,
        ...(focus !== undefined ? { focus } : {}),
      })
    }

    setCache(cacheKey, result, 'summary')

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    logger.error('summarize_speeches エラー', { error: err instanceof Error ? err.message : String(err) })
    return {
      isError: true,
      content: [{ type: 'text' as const, text: formatErrorForMcp(err) }],
    }
  }
}
