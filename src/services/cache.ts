/**
 * cache.ts
 *
 * キャッシュサービスのエントリポイント。
 * 既存のツールコードが `import { buildCacheKey, getCache, setCache, deleteCache } from './cache.js'`
 * でそのまま動作するよう、cacheGateway へ委譲する形で再エクスポートする。
 *
 * 旧実装（node-cache のみ）から、二層キャッシュ（L1: メモリ、L2: SQLite）へ移行済み。
 * 仕様: docs/Requirement_Rev05.md
 */

export {
  buildCacheKey,
  getCache,
  setCache,
  deleteCache,
} from './cacheGateway.js'

// 新規コードはこちらを使う
export {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeleteByType,
  cacheDeleteAll,
} from './cacheGateway.js'

export type { GetOptions, SetOptions } from './cacheGateway.js'

// キービルダー（新規コード用）
export {
  buildSearchResultKey,
  buildMeetingDetailKey,
  buildSummaryKey,
  buildQaPairsKey,
  buildPartyCompareKey,
  buildTimeCompareKey,
  buildTopicChangesKey,
  buildSourceHash,
  type CacheType,
} from './cacheKeyBuilder.js'

// ポリシー（version・TTL参照用）
export {
  CACHE_VERSIONS,
  CACHE_TTL_SEC,
  EMPTY_SEARCH_TTL_SEC,
} from './cachePolicy.js'
