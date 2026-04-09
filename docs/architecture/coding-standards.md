# コーディング規約

## 基本方針

- TypeScript strict mode を使用する（`"strict": true`）
- `any` 型の使用を禁止する（`unknown` または具体的な型を使用する）
- `async/await` を使用する（コールバックおよび `.then()/.catch()` は禁止）
- `process.env` の直接参照は `src/config/index.ts` 以外で禁止する

## ファイル・命名規則

| 対象 | 規則 | 例 |
|------|------|----|
| ファイル名 | camelCase | `kokkaiApi.ts`, `searchSpeeches.ts` |
| クラス名 | PascalCase | `KokkaiApiError`, `CacheService` |
| 関数・変数 | camelCase | `searchSpeeches`, `cacheKey` |
| 定数 | UPPER_SNAKE_CASE（モジュールスコープ） | `DEFAULT_LIMIT` |
| 型・インターフェース | PascalCase | `SpeechItem`, `SummaryResult` |
| enum | PascalCase + UPPER_SNAKE_CASE の値 | （enum は使用せず union type を優先）|

## インポート順序

1. Node.js 標準モジュール
2. 外部ライブラリ（node_modules）
3. 内部モジュール（`../`, `./`）

各グループの間に空行を入れる。

## エラーハンドリング

### エラークラス定義

```typescript
// src/utils/errors.ts に集約する
export class KokkaiApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = true,
  ) {
    super(message)
    this.name = 'KokkaiApiError'
  }
}
```

### エラー変換

Service 層でキャッチした外部エラーは、必ず内部エラークラスへ変換してから re-throw する。

```typescript
// 良い例
try {
  const res = await fetch(url)
} catch (err) {
  throw new KokkaiApiError(`国会 API 呼び出し失敗: ${getErrorMessage(err)}`)
}

// 悪い例
try {
  const res = await fetch(url)
} catch (err) {
  throw new Error('failed') // 型情報が失われる
}
```

### MCP ツールのエラーラップ

ツールハンドラは、すべての例外を MCP エラーレスポンスに変換する責務を持つ。

```typescript
export async function handleSearchSpeeches(input: unknown) {
  try {
    const params = SearchSpeechesSchema.parse(input)
    const result = await kokkaiApi.searchSpeeches(params)
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: formatError(err) }],
    }
  }
}
```

## ログ規約

```typescript
// src/utils/logger.ts を使用する
import { logger } from '../utils/logger.js'

logger.info('API 呼び出し開始', { endpoint: '/speech', params: { speaker: '田中' } })
logger.error('API 呼び出し失敗', { error: err.message, retryable: true })
```

### ログ禁止事項

- `ANTHROPIC_API_KEY` 等の API キーをログに出力しない
- 発言本文（`speech` フィールド）全文をログに出力しない（最大 50 文字まで）
- ユーザー入力のクエリ文字列は DEBUG レベルのみで出力する

## 非同期制御

```typescript
// 良い例: 並列実行が必要な場合は Promise.all を使用
const [part1, part2] = await Promise.all([
  summarizeChunk(chunks[0]),
  summarizeChunk(chunks[1]),
])

// 悪い例: 不要な逐次実行
const part1 = await summarizeChunk(chunks[0])
const part2 = await summarizeChunk(chunks[1])
```

ただし、外部 API への同時接続数が多くなりすぎないよう、
並列数は `config.maxConcurrentRequests`（既定: 3）に制限する。

## バリデーション

入力バリデーションは `zod` を使用する。

```typescript
import { z } from 'zod'

const SearchSpeechesSchema = z.object({
  query: z.string().optional(),
  speaker: z.string().optional(),
  nameOfMeeting: z.string().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(100).default(10),
}).refine(
  (data) => data.query || data.speaker || data.nameOfMeeting,
  { message: 'query, speaker, nameOfMeeting のいずれかが必須です' },
)
```

## TypeScript コンパイラ設定

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

## 外部 API 呼び出し制約

- 国会 API: レート制限は設けられていないが、1 秒に 1 リクエスト以内を推奨（§17）
- Anthropic API: `maxRetries: 2`、`timeout: 30000ms`
- すべての外部 API 呼び出しに AbortController によるタイムアウトを設定する
