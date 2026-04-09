/**
 * summarizeQaPairs.ts
 *
 * summarize_qa_pairs ツールの定義とハンドラ。
 * 会議録の質問・答弁ペアを抽出・要約して出典付きで返す。
 */

import { z } from 'zod'
import { getMeeting } from '../services/kokkaiApi.js'
import { summarizeQaPairs } from '../services/qaPairSummarizer.js'
import { buildCacheKey, getCache, setCache } from '../services/cache.js'
import { ValidationError, formatErrorForMcp } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import type { QaSummaryResult } from '../services/qaPairSummarizer.js'

// ─── 入力スキーマ ─────────────────────────────────────────────────────────────

export const SummarizeQaPairsSchema = z.object({
  issueID:           z.string().min(1, 'issueID は必須です'),
  focus:             z.string().optional(),
  mode:              z.enum(['brief', 'standard', 'detailed']).default('standard'),
  max_pairs:         z.number().int().min(1).max(20).default(10),
  include_unanswered: z.boolean().default(true),
})

export type SummarizeQaPairsInput = z.infer<typeof SummarizeQaPairsSchema>

// ─── MCP ツール定義 ────────────────────────────────────────────────────────────

export const summarizeQaPairsTool = {
  name: 'summarize_qa_pairs' as const,
  description:
    '会議録識別子 (issueID) を指定して、質問と答弁のペアを抽出・要約します。' +
    '各ペアに論点タイトル・質問要旨・答弁要旨・回答関係の評価（response_type）が付与されます。' +
    'focus で特定テーマに絞り込めます。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      issueID: {
        type: 'string',
        description: '会議録識別子（search_speeches の items[].issueID から取得）',
      },
      focus: {
        type: 'string',
        description: '要約の焦点となるテーマ（例: "生成AI"）。省略可',
      },
      mode: {
        type: 'string',
        enum: ['brief', 'standard', 'detailed'],
        default: 'standard',
        description: '出力粒度: brief（3〜5件・短縮）/ standard（5〜10件）/ detailed（詳細・コスト高）',
      },
      max_pairs: {
        type: 'integer',
        default: 10,
        minimum: 1,
        maximum: 20,
        description: '返却する最大ペア数（既定: 10）',
      },
      include_unanswered: {
        type: 'boolean',
        default: true,
        description: '明確な答弁が取れない質問も含めるか',
      },
    },
    required: ['issueID'],
    additionalProperties: false,
  },
}

// ─── ハンドラ ──────────────────────────────────────────────────────────────────

export async function handleSummarizeQaPairs(input: unknown) {
  try {
    const parseResult = SummarizeQaPairsSchema.safeParse(input)
    if (!parseResult.success) {
      throw new ValidationError(
        `入力値エラー: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      )
    }

    const { issueID, focus, mode, max_pairs, include_unanswered } = parseResult.data

    // キャッシュ確認
    const cacheKey = buildCacheKey('summarize-qa-pairs', {
      issueID,
      focus,
      mode,
      max_pairs,
      include_unanswered,
    })
    const cached = getCache<QaSummaryResult>(cacheKey)
    if (cached) {
      logger.info('summarize_qa_pairs キャッシュ HIT', { issueID, mode })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }],
      }
    }

    logger.info('summarize_qa_pairs 開始', { issueID, mode, focus })

    // 会議録取得
    const meeting = await getMeeting(issueID)

    // QAペア要約
    const result = await summarizeQaPairs(meeting.speeches, {
      issueID,
      ...(focus !== undefined ? { focus } : {}),
      mode,
      maxPairs: max_pairs,
      includeUnanswered: include_unanswered,
    })

    setCache(cacheKey, result, 'summary')

    logger.info('summarize_qa_pairs 完了', {
      issueID,
      pairCount: String(result.qa_pairs.length),
    })

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    logger.error('summarize_qa_pairs エラー', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      isError: true,
      content: [{ type: 'text' as const, text: formatErrorForMcp(err) }],
    }
  }
}
