# モジュール設計

## ディレクトリ構成

```
src/
├── server.ts                    # MCP サーバーエントリポイント
├── config/
│   └── index.ts                 # 環境変数一元管理
├── types/
│   └── index.ts                 # 全型定義（共有型）
├── utils/
│   ├── errors.ts                # 型付きエラークラス
│   └── logger.ts                # ログユーティリティ
├── tools/
│   ├── index.ts                 # ツール一覧エクスポート
│   ├── searchSpeeches.ts        # search_speeches ツール定義
│   ├── getMeeting.ts            # get_meeting ツール定義
│   ├── summarizeSpeeches.ts     # summarize_speeches ツール定義
│   └── summarizeMeeting.ts      # summarize_meeting ツール定義
└── services/
    ├── kokkaiApi.ts             # 国会 API クライアント
    ├── preprocess.ts            # 発言前処理
    ├── summarizer.ts            # LLM 要約
    └── cache.ts                 # メモリキャッシュ
```

## 各モジュールの責務

### `src/server.ts`

- MCP サーバーインスタンス生成（`@modelcontextprotocol/sdk`）
- 4 ツールの登録
- stdio transport での起動
- プロセス終了ハンドリング

### `src/config/index.ts`

- 環境変数の読み取りと型変換
- 必須変数未設定時の早期エラー
- デフォルト値の定義

公開する設定値:
```typescript
export const config = {
  anthropicApiKey: string,
  anthropicModel: string,          // 既定: claude-3-5-haiku-20241022
  kokkaiApiBaseUrl: string,        // 既定: https://kokkai.ndl.go.jp/api
  requestTimeoutMs: number,        // 既定: 30000
  maxRetries: number,              // 既定: 2
  cache: {
    speechSearchTtlSec: number,    // 既定: 86400 (1日)
    meetingTtlSec: number,         // 既定: 604800 (7日)
    summaryTtlSec: number,         // 既定: 604800 (7日)
  },
  summarize: {
    maxItemsPerChunk: number,      // 既定: 20
    maxCharsPerChunk: number,      // 既定: 8000
    maxTotalItems: number,         // 既定: 200
  },
}
```

### `src/types/index.ts`

共有型定義:

```typescript
// 発言アイテム（search_speeches / get_meeting の出力）
export interface SpeechItem {
  speechID: string
  issueID: string
  date: string
  nameOfMeeting: string
  speaker: string
  speech: string
  speechOrder?: number
}

// search_speeches 出力
export interface SearchResult {
  total: number
  items: SpeechItem[]
}

// 会議録
export interface MeetingRecord {
  issueID: string
  date: string
  nameOfMeeting: string
  speeches: SpeechItem[]
}

// 要約結果
export interface SummaryResult {
  overview: string
  main_points: string[]
  speaker_points: Record<string, string>
  conclusion: string
  caution?: string
  issueID?: string
}

// 要約モード
export type SummaryMode = 'brief' | 'standard' | 'detailed'
```

### `src/utils/errors.ts`

型付きエラークラス:

```typescript
export class KokkaiApiError extends Error { ... }     // 国会 API エラー
export class LlmApiError extends Error { ... }         // LLM API エラー
export class ValidationError extends Error { ... }     // 入力バリデーションエラー
export class TooManyItemsError extends Error { ... }   // 件数過多エラー
export class NotFoundError extends Error { ... }       // 結果 0 件
```

### `src/services/kokkaiApi.ts`

責務:
- 国会 API の `/speech` エンドポイント呼び出し
- 国会 API の `/meeting` エンドポイント呼び出し
- リトライ制御（最大 `config.maxRetries` 回）
- タイムアウト制御
- レスポンスを内部型 (`SpeechItem[]`, `MeetingRecord`) へ変換

依存: `cache.ts`（透過キャッシュ）、`config`、`errors.ts`

### `src/services/cache.ts`

責務:
- TTL 付きメモリキャッシュ（`Map<string, {value, expiresAt}>`）
- キャッシュキー生成（URL + パラメータのハッシュ）
- TTL 種別管理（searchSpeech / meeting / summary）

依存: `config`

### `src/services/preprocess.ts`

責務:
- 形式的議事進行発言の除外（正規表現パターン）
- 極端に短い発言の除外（閾値: 20文字未満）
- 同一話者連続発言の結合
- 重要度スコアリング（文字数・キーワード一致・役職）
- チャンク分割（文字数 or 発言数ベース）

依存: なし（純粋関数として実装）

### `src/services/summarizer.ts`

責務:
- チャンク単位の部分要約（Anthropic API）
- 最終統合要約
- モード別プロンプト切り替え（brief / standard / detailed）
- 固定出力形式の強制（JSON レスポンス）
- 要約結果の内部型への変換

依存: `@anthropic-ai/sdk`、`config`、`errors.ts`

### `src/tools/searchSpeeches.ts`

責務:
- MCP ツール定義（name, description, inputSchema）
- 入力バリデーション
- `kokkaiApi.searchSpeeches()` 呼び出し
- 出力フォーマット整形

### `src/tools/getMeeting.ts`

責務:
- MCP ツール定義
- `issueID` 必須バリデーション
- `kokkaiApi.getMeeting()` 呼び出し
- 出力フォーマット整形

### `src/tools/summarizeSpeeches.ts`

責務:
- MCP ツール定義
- `items` 配列の入力バリデーション（件数上限チェック）
- `preprocess → summarizer` の連結
- キャッシュキー生成・キャッシュ利用

### `src/tools/summarizeMeeting.ts`

責務:
- MCP ツール定義
- 内部で `getMeeting` を呼び出し
- `preprocess → summarizer` の連結
- キャッシュキー生成・キャッシュ利用
