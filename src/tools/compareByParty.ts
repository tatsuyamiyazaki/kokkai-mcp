/**
 * compareByParty.ts
 *
 * compare_by_party ツールの定義とハンドラ。
 * 指定テーマについて政党別の発言を集約・比較し、スタンスの違いを返す。
 */

import { z } from 'zod'
import { searchSpeeches } from '../services/kokkaiApi.js'
import { compareByParty } from '../services/partyComparator.js'
import { buildCacheKey, getCache, setCache } from '../services/cache.js'
import { ValidationError, formatErrorForMcp } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import type { PartyComparisonResult } from '../services/partyComparator.js'

// ─── 入力スキーマ ─────────────────────────────────────────────────────────────

export const CompareByPartySchema = z.object({
  query:                 z.string().min(1, '検索キーワード（query）は必須です'),
  from:                  z.string().optional(),
  until:                 z.string().optional(),
  nameOfMeeting:         z.string().optional(),
  mode:                  z.enum(['brief', 'standard', 'detailed']).default('standard'),
  include_common_points: z.boolean().default(true),
  include_differences:   z.boolean().default(true),
  max_items:             z.number().int().min(1).max(100).default(30),
})

export type CompareByPartyInput = z.infer<typeof CompareByPartySchema>

// ─── MCP ツール定義 ────────────────────────────────────────────────────────────

export const compareByPartyTool = {
  name: 'compare_by_party' as const,
  description:
    '指定テーマについて政党別の発言を集約・比較します。' +
    '各政党のスタンス・主要論点の違い、共通点・相違点を出典付きで返します。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: '比較対象テーマ（例: "生成AI", "財政政策"）',
      },
      from: {
        type: 'string',
        description: '検索開始日 (YYYY-MM-DD)。省略可',
      },
      until: {
        type: 'string',
        description: '検索終了日 (YYYY-MM-DD)。省略可',
      },
      nameOfMeeting: {
        type: 'string',
        description: '特定会議に絞る場合に指定（例: "予算委員会"）',
      },
      mode: {
        type: 'string',
        enum: ['brief', 'standard', 'detailed'],
        default: 'standard',
        description: '出力粒度: brief（主要政党のみ・簡潔）/ standard（標準）/ detailed（詳細・コスト高）',
      },
      include_common_points: {
        type: 'boolean',
        default: true,
        description: '共通点を出力に含めるか',
      },
      include_differences: {
        type: 'boolean',
        default: true,
        description: '相違点を出力に含めるか',
      },
      max_items: {
        type: 'integer',
        default: 30,
        minimum: 1,
        maximum: 100,
        description: '最大対象発言件数（既定: 30）',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
}

// ─── ハンドラ ──────────────────────────────────────────────────────────────────

export async function handleCompareByParty(input: unknown) {
  try {
    const parseResult = CompareByPartySchema.safeParse(input)
    if (!parseResult.success) {
      throw new ValidationError(
        `入力値エラー: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
      )
    }

    const {
      query,
      from,
      until,
      nameOfMeeting,
      mode,
      include_common_points,
      include_differences,
      max_items,
    } = parseResult.data

    // キャッシュ確認
    const cacheKey = buildCacheKey('compare-by-party', {
      query, from, until, nameOfMeeting, mode,
      include_common_points, include_differences, max_items,
    })
    const cached = getCache<PartyComparisonResult>(cacheKey)
    if (cached) {
      logger.info('compare_by_party キャッシュ HIT', { query, mode })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(cached, null, 2) }],
      }
    }

    logger.info('compare_by_party 開始', { query, mode, max_items: String(max_items) })

    // 発言検索
    const searchResult = await searchSpeeches({
      query,
      from,
      until,
      nameOfMeeting,
      limit: max_items,
    })

    logger.info('発言取得完了', {
      total: String(searchResult.total),
      returned: String(searchResult.items.length),
    })

    // 政党別比較
    const result = await compareByParty(searchResult.items, {
      query,
      mode,
      includeCommonPoints: include_common_points,
      includeDifferences:  include_differences,
    })

    setCache(cacheKey, result, 'summary')

    logger.info('compare_by_party 完了', {
      partyCount: String(result.party_summaries.length),
    })

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    logger.error('compare_by_party エラー', {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      isError: true,
      content: [{ type: 'text' as const, text: formatErrorForMcp(err) }],
    }
  }
}
