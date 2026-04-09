/**
 * analyzeTopicChanges.ts
 *
 * analyze_topic_changes ツールの定義とハンドラ。
 * 複数期間における論点の増加・減少・継続・新規を分析する。
 */

import { z } from 'zod'
import { analyzeTopicChanges } from '../services/topicChangeAnalyzer.js'
import { buildCacheKey, getCache, setCache } from '../services/cache.js'
import { ValidationError, formatErrorForMcp } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import type { TopicChangesResult } from '../services/topicChangeAnalyzer.js'

// ─── 入力スキーマ ─────────────────────────────────────────────────────────────

const PeriodSchema = z.object({
  label: z.string().min(1, '期間ラベルを入力してください'),
  from:  z.string().min(1, '開始日を入力してください (YYYY-MM-DD)'),
  until: z.string().min(1, '終了日を入力してください (YYYY-MM-DD)'),
})

export const AnalyzeTopicChangesSchema = z.object({
  query:                  z.string().min(1, '検索キーワード（query）は必須です'),
  periods:                z
    .array(PeriodSchema)
    .min(2, '比較には2期間以上必要です')
    .max(5, '比較期間は5期間まで指定できます'),
  mode:                   z.enum(['brief', 'standard', 'detailed']).default('standard'),
  max_items_per_period:   z.number().int().min(1).max(50).default(20),
  include_emerging_topics: z.boolean().default(true),
  nameOfMeeting:          z.string().optional(),
})

export type AnalyzeTopicChangesInput = z.infer<typeof AnalyzeTopicChangesSchema>

// ─── MCP ツール定義 ────────────────────────────────────────────────────────────

export const analyzeTopicChangesTool = {
  name: 'analyze_topic_changes' as const,
  description:
    '同一テーマについて複数期間（2〜5期間）の国会議事録を分析し、' +
    '論点の増加・減少・継続・新規（change_type）を出典付きで返します。' +
    '政策議論の流れや重心の変化を把握するのに適しています。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: '比較対象テーマ（例: "生成AI", "財政政策"）',
      },
      periods: {
        type: 'array',
        description: '比較する期間一覧（2〜5期間）',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: '期間ラベル（例: "2024年"）' },
            from:  { type: 'string', description: '開始日 (YYYY-MM-DD)' },
            until: { type: 'string', description: '終了日 (YYYY-MM-DD)' },
          },
          required: ['label', 'from', 'until'],
        },
        minItems: 2,
        maxItems: 5,
      },
      mode: {
        type: 'string',
        enum: ['brief', 'standard', 'detailed'],
        default: 'standard',
        description: '出力粒度: brief（主要変化のみ・低コスト）/ standard（標準）/ detailed（詳細・コスト高）',
      },
      max_items_per_period: {
        type: 'integer',
        default: 20,
        minimum: 1,
        maximum: 50,
        description: '各期間で取得する最大発言件数（既定: 20）',
      },
      include_emerging_topics: {
        type: 'boolean',
        default: true,
        description: '新規論点（new）を含めるか',
      },
      nameOfMeeting: {
        type: 'string',
        description: '特定会議に絞る場合に指定（例: "予算委員会"）',
      },
    },
    required: ['query', 'periods'],
    additionalProperties: false,
  },
}

// ─── ハンドラ ──────────────────────────────────────────────────────────────────

export async function handleAnalyzeTopicChanges(input: unknown) {
  try {
    const parseResult = AnalyzeTopicChangesSchema.safeParse(input)
    if (!parseResult.success) {
      throw new ValidationError(
        `入力値エラー: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      )
    }

    const {
      query,
      periods,
      mode,
      max_items_per_period,
      include_emerging_topics,
      nameOfMeeting,
    } = parseResult.data

    // キャッシュ確認
    const cacheKey = buildCacheKey('analyze-topic-changes', {
      query,
      periods,
      mode,
      max_items_per_period,
      include_emerging_topics,
      nameOfMeeting,
    })
    const cached = getCache<TopicChangesResult>(cacheKey)
    if (cached) {
      logger.info('analyze_topic_changes キャッシュ HIT', { query, mode })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }],
      }
    }

    logger.info('analyze_topic_changes 開始', {
      query,
      mode,
      periods: periods.map((p) => p.label).join(', '),
    })

    const result = await analyzeTopicChanges({
      query,
      periods,
      mode,
      maxItemsPerPeriod:    max_items_per_period,
      includeEmergingTopics: include_emerging_topics,
      ...(nameOfMeeting !== undefined ? { nameOfMeeting } : {}),
    })

    setCache(cacheKey, result, 'summary')

    logger.info('analyze_topic_changes 完了', {
      topicChangeCount: String(result.topic_changes.length),
    })

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    logger.error('analyze_topic_changes エラー', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      isError: true,
      content: [{ type: 'text' as const, text: formatErrorForMcp(err) }],
    }
  }
}
