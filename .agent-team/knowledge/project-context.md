# プロジェクトコンテキスト

- **更新日:** 2026-04-09
- **フェーズ:** Phase 1.5（UI/UX と DB は不要。SEC/TEST の設計レビューへ）

## プロジェクト識別

- **名称:** 国会議事録検索・要約 MCP サーバー (kokkai-mcp)
- **種別:** MCP サーバー（画面・DB なし）
- **リポジトリ:** `C:\Users\t_miyazaki\Dev\mcp\kokkai-mcp`

## アーキテクチャ決定（確定済み）

| 決定事項 | 内容 | ADR |
|---------|------|-----|
| Transport | stdio | ADR-001 |
| ツール数 | 4（search_speeches / get_meeting / summarize_speeches / summarize_meeting）| ADR-001 |
| DB | なし（メモリキャッシュのみ）| ADR-001 |
| 要約戦略 | チャンク分割 → 部分要約 → 最終統合 | ADR-001 |
| LLM | Anthropic Claude（haiku デフォルト）| ADR-002 |
| HTTP クライアント | Node.js 標準 fetch | ADR-002 |
| バリデーション | zod | ADR-002 |
| テスト | vitest | ADR-002 |
| モジュール形式 | ESM（"type": "module"）| ADR-002 |

## ディレクトリ構成（確定）

```
src/
├── server.ts
├── config/index.ts
├── types/index.ts
├── utils/errors.ts
├── utils/logger.ts
├── tools/
│   ├── index.ts
│   ├── searchSpeeches.ts
│   ├── getMeeting.ts
│   ├── summarizeSpeeches.ts
│   └── summarizeMeeting.ts
└── services/
    ├── kokkaiApi.ts
    ├── preprocess.ts
    ├── summarizer.ts
    └── cache.ts
```

## 外部 API

- 国会 API: `https://kokkai.ndl.go.jp/api/`
  - `/speech`: 発言検索（最大 100 件/リクエスト）
  - `/meeting`: 会議録取得（最大 10 件/リクエスト）
  - 認証: なし（公開 API）
  - レスポンス: JSON（`recordPacking=json`）
- Anthropic API: `claude-3-5-haiku-20241022` デフォルト
  - 認証: `ANTHROPIC_API_KEY` 環境変数

## キャッシュ TTL

| 対象 | TTL |
|------|-----|
| 発言検索 | 1日（86400秒）|
| 会議録 | 7日（604800秒）|
| 要約 | 7日（604800秒）|

## エラー種別

- `KokkaiApiError` (retryable: true)
- `LlmApiError` (retryable: true)
- `ValidationError` (retryable: false)
- `TooManyItemsError` (retryable: false)
- `NotFoundError` (retryable: false)
- `ConfigurationError` (retryable: false)

## Gate 状態

- Gate 1 (ARCH-EVAL): APPROVE (2026-04-09)
- Gate 2 (DESIGN-EVAL): 未実施（DB・UIUX 不要のためスキップ → SEC/TEST 設計レビューのみ）
