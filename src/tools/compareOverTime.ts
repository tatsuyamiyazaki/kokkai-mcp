/**
 * compareOverTime.ts
 *
 * compare_over_time ツールの定義とハンドラ。
 * 同一テーマについて複数期間の国会議事録を比較し、議論の変化を返す。
 */

import { z } from 'zod'
import { buildCacheKey, getCache, setCache } from '../services/cache.js'
import { collectPeriodSpeeches, summarizePeriod } from '../services/periodSummarizer.js'
import { performTimeSeriesComparison, checkItemCountDisparity } from '../services/timeSeriesComparator.js'
import { formatCompareResult } from '../services/comparisonFormatter.js'
import { ValidationError, formatErrorForMcp } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import type { CompareOverTimeResult, SummaryMode } from '../types/index.js'

// ─── 入力スキーマ ─────────────────────────────────────────────────────────────

const PeriodSchema = z.object({
  label: z.string().min(1, '期間ラベルを入力してください'),
  from:  z.string().min(1, '開始日を入力してください (YYYY-MM-DD)'),
  until: z.string().min(1, '終了日を入力してください (YYYY-MM-DD)'),
})

export const CompareOverTimeSchema = z.object({
  query:                  z.string().min(1, '検索キーワード（query）は必須です'),
  periods:                z
    .array(PeriodSchema)
    .min(2, '比較には2期間以上必要です')
    .max(3, '比較期間は3期間まで指定できます'),
  nameOfMeeting:          z.string().optional(),
  speaker:                z.string().optional(),
  mode:                   z.enum(['brief', 'standard', 'detailed']).default('standard'),
  include_topics:         z.boolean().default(true),
  include_speaker_changes: z.boolean().default(true),
  max_items_per_period:   z.number().int().min(1).max(50).default(20),
})

export type CompareOverTimeInput = z.infer<typeof CompareOverTimeSchema>

// ─── MCP ツール定義 ────────────────────────────────────────────────────────────

export const compareOverTimeTool = {
  name: 'compare_over_time' as const,
  description:
    '同一テーマについて複数期間（2〜3期間）の国会議事録を比較し、議論の変化（論点の増減・新規・継続）を返します。' +
    'periods に複数の期間を指定し、query で比較対象テーマを指定してください。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: '比較対象テーマ（例: "生成AI", "財政政策"）',
      },
      periods: {
        type: 'array',
        description: '比較する期間一覧（2〜3期間）',
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
        maxItems: 3,
      },
      nameOfMeeting: {
        type: 'string',
        description: '特定会議に絞る場合に指定（例: "予算委員会"）',
      },
      speaker: {
        type: 'string',
        description: '特定発言者に絞る場合に指定',
      },
      mode: {
        type: 'string',
        enum: ['brief', 'standard', 'detailed'],
        default: 'standard',
        description:
          '出力粒度: brief（主要変化2〜3件・低コスト）/ standard（主要論点変化）/ detailed（詳細・コスト高）',
      },
      include_topics: {
        type: 'boolean',
        default: true,
        description: '論点比較を含めるか',
      },
      include_speaker_changes: {
        type: 'boolean',
        default: true,
        description: '発言者傾向の比較を含めるか',
      },
      max_items_per_period: {
        type: 'integer',
        default: 20,
        minimum: 1,
        maximum: 50,
        description: '各期間で取得する最大発言件数（既定: 20）',
      },
    },
    required: ['query', 'periods'],
    additionalProperties: false,
  },
}

// ─── ハンドラ ──────────────────────────────────────────────────────────────────

export async function handleCompareOverTime(input: unknown) {
  try {
    // バリデーション
    const parseResult = CompareOverTimeSchema.safeParse(input)
    if (!parseResult.success) {
      throw new ValidationError(
        `入力値エラー: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      )
    }

    const {
      query,
      periods,
      nameOfMeeting,
      speaker,
      mode,
      include_topics,
      include_speaker_changes,
      max_items_per_period,
    } = parseResult.data

    logger.info('compare_over_time 開始', {
      query,
      periods:  periods.map((p) => p.label).join(', '),
      mode,
    })

    // キャッシュ確認
    const cacheKey = buildCacheKey('compare-over-time', {
      query,
      periods,
      nameOfMeeting,
      speaker,
      mode,
      include_topics,
      include_speaker_changes,
      max_items_per_period,
    })
    const cached = getCache<CompareOverTimeResult>(cacheKey)
    if (cached) {
      logger.info('compare_over_time キャッシュ HIT')
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }],
      }
    }

    // Step 1 & 2: 各期間の発言収集 → 並列実行
    logger.info('各期間の発言収集開始')
    const collectOptions = {
      query,
      nameOfMeeting,
      speaker,
      maxItems: max_items_per_period,
    }

    const periodItemsList = await Promise.all(
      periods.map((period) => collectPeriodSpeeches(period, collectOptions)),
    )

    // Step 3: 各期間を要約 → 並列実行
    // brief/standard は include_topics を活かす。brief では topics は後で削る
    logger.info('各期間の要約開始')
    const summaryMode: SummaryMode = mode
    const periodSummaries = await Promise.all(
      periods.map((period, i) =>
        summarizePeriod(period, periodItemsList[i] ?? [], summaryMode, query),
      ),
    )

    // Step 4 & 5 & 6: 比較分析（論点変化・発言者変化・比較サマリ・結論）
    logger.info('時系列比較分析開始')
    const { comparisonSummary, topicChanges, speakerChanges, conclusion } =
      await performTimeSeriesComparison(
        periodSummaries,
        query,
        mode,
        include_speaker_changes,
      )

    // 件数不均衡の警告
    const caution = checkItemCountDisparity(periodSummaries)

    // 結果を組み立て
    const rawResult: CompareOverTimeResult = {
      query,
      comparison_summary: comparisonSummary,
      period_summaries: periodSummaries,
      topic_changes:    include_topics ? topicChanges : [],
      speaker_changes:  include_speaker_changes ? speakerChanges : [],
      conclusion,
      ...(caution ? { caution } : {}),
    }

    // モード別フィルタリング
    const result = formatCompareResult(rawResult, mode)

    setCache(cacheKey, result, 'summary')

    logger.info('compare_over_time 完了', {
      topicChanges:   String(result.topic_changes.length),
      speakerChanges: String(result.speaker_changes.length),
    })

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    logger.error('compare_over_time エラー', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      isError: true,
      content: [{ type: 'text' as const, text: formatErrorForMcp(err) }],
    }
  }
}
