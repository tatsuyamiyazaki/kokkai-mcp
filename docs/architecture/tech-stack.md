# 技術スタック

## ランタイム・言語

| 技術 | バージョン | 選定理由 |
|------|-----------|---------|
| Node.js | 20+ LTS | MCP SDK の推奨ランタイム。`fetch` が標準組み込み（Node 18+）|
| TypeScript | 5.x (strict) | 型安全性。MCP SDK が TypeScript ファーストの設計 |

## 主要ライブラリ

| ライブラリ | 用途 | バージョン目安 |
|-----------|------|-------------|
| `@modelcontextprotocol/server` | MCP サーバー実装（SDK v2 系） | ^2.x |
| `@anthropic-ai/sdk` | Anthropic Claude API クライアント | 最新安定版 |
| `zod` | 入力スキーマバリデーション | ^4.x（SDK v2 が >=4.2 を要求）|
| `node-cache` | TTL 付きメモリキャッシュ | ^5.x |

## HTTP クライアント

国会 API 呼び出しには Node.js 組み込みの `fetch`（Node 20+ 標準）を使用する。
`axios` は導入しない（標準 fetch で十分かつ依存を減らす）。

## 開発ツール

| ツール | 用途 | バージョン |
|--------|------|-----------|
| `tsc` | TypeScript コンパイル | TypeScript 同梱 |
| `vitest` | テスト | ^2.x |
| `eslint` | Linter | ^9.x |
| `prettier` | Formatter | ^3.x |
| `dotenv` | `.env` ファイルの読み込み（開発時） | ^16.x |

## ビルド・実行

```
npm run build    → tsc → dist/
npm run start    → node dist/server.js
npm run dev      → tsx watch src/server.ts（開発時ホットリロード）
npm run test     → vitest run
npm run lint     → eslint src/
npm run format   → prettier --write src/
```

## package.json の type フィールド

`"type": "module"` を設定し、ES Module として実行する。
MCP SDK が ESM 前提のため。

## 環境変数一覧

| 変数名 | 必須 | 既定値 | 説明 |
|--------|------|--------|------|
| `ANTHROPIC_API_KEY` | 必須 | - | Anthropic Claude API キー |
| `ANTHROPIC_MODEL` | 任意 | `claude-3-5-haiku-20241022` | 使用モデル |
| `KOKKAI_API_BASE_URL` | 任意 | `https://kokkai.ndl.go.jp/api` | 国会 API ベース URL |
| `REQUEST_TIMEOUT_MS` | 任意 | `30000` | API タイムアウト (ms) |
| `MAX_RETRIES` | 任意 | `2` | API リトライ上限 |
| `CACHE_SPEECH_TTL_SEC` | 任意 | `86400` | 発言検索キャッシュ TTL |
| `CACHE_MEETING_TTL_SEC` | 任意 | `604800` | 会議録キャッシュ TTL |
| `CACHE_SUMMARY_TTL_SEC` | 任意 | `604800` | 要約キャッシュ TTL |
| `MAX_SUMMARIZE_ITEMS` | 任意 | `200` | 要約対象発言数の上限 |
