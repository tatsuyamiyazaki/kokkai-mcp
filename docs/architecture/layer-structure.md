# レイヤー構成

## レイヤー図

```
┌─────────────────────────────────────────────────┐
│  MCP Protocol Layer（stdio transport）           │
│  src/server.ts                                  │
├─────────────────────────────────────────────────┤
│  Tools Layer（入力検証・ハンドラ）               │
│  src/tools/searchSpeeches.ts                    │
│  src/tools/getMeeting.ts                        │
│  src/tools/summarizeSpeeches.ts                 │
│  src/tools/summarizeMeeting.ts                  │
├─────────────────────────────────────────────────┤
│  Service Layer（ビジネスロジック）               │
│  src/services/kokkaiApi.ts  ← 国会 API 呼び出し │
│  src/services/preprocess.ts ← 前処理             │
│  src/services/summarizer.ts ← LLM 要約          │
│  src/services/cache.ts      ← TTL キャッシュ     │
├─────────────────────────────────────────────────┤
│  Infrastructure Layer（外部 I/O）               │
│  国会会議録 API (HTTPS GET)                     │
│  Anthropic Claude API (HTTPS POST)              │
├─────────────────────────────────────────────────┤
│  Cross-cutting                                  │
│  src/config/index.ts  ← 環境変数一元管理         │
│  src/types/index.ts   ← 型定義                  │
│  src/utils/errors.ts  ← 型付きエラークラス        │
│  src/utils/logger.ts  ← ログ（機微情報除外）      │
└─────────────────────────────────────────────────┘
```

## 依存方向（依存はすべて上から下）

```
server.ts
  └─ tools/ (ツール登録・入力検証)
       └─ services/ (ビジネスロジック)
            ├─ kokkaiApi.ts
            │    └─ cache.ts (キャッシュ介在)
            ├─ preprocess.ts (依存なし)
            └─ summarizer.ts
                 └─ Anthropic SDK
```

## レイヤー境界ルール

- Tools → Services: 型付き引数で呼び出す。生の HTTP リクエストを直接実行しない
- Services → Infrastructure: kokkaiApi.ts と summarizer.ts のみ外部 I/O を持つ
- cache.ts: kokkaiApi.ts の内部で透過的に使用する（Tools は cache を直接参照しない）
- config/: どのレイヤーからも参照可（ただし `process.env` の直接参照は config/ 以外禁止）
