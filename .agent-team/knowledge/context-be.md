# BE Agent コンテキスト: kokkai-mcp

## プロジェクト概要

国会議事録検索・要約 MCP サーバー。Node.js + TypeScript + @modelcontextprotocol/sdk で実装。
DB なし・メモリキャッシュのみの最小構成。

## 技術スタック

- Node.js 20+ LTS
- TypeScript 5.x strict
- @modelcontextprotocol/sdk（MCP サーバー）
- @anthropic-ai/sdk（LLM）
- zod（バリデーション）
- node-cache（キャッシュ）
- vitest（テスト）
- ESM (`"type": "module"`)、import に `.js` 拡張子必須

## 実装すべきファイル一覧

| タスク | ファイル | 依存 |
|--------|---------|------|
| TASK-001 | package.json, tsconfig.json, .gitignore, .env.example | - |
| TASK-002 | src/config/index.ts | TASK-001 |
| TASK-003 | src/types/index.ts | TASK-001 |
| TASK-004 | src/utils/errors.ts | TASK-001 |
| TASK-005 | src/utils/logger.ts | TASK-001 |
| TASK-006 | src/services/cache.ts | TASK-002,003,004 |
| TASK-007 | src/services/kokkaiApi.ts | TASK-006 |
| TASK-008 | src/services/preprocess.ts | TASK-003 |
| TASK-009 | src/services/summarizer.ts | TASK-002,003,004,008 |
| TASK-010 | src/tools/*.ts (4ファイル) | TASK-007,008,009 |
| TASK-011 | src/server.ts | TASK-010 |

## 重要な設計決定

1. `process.env` の直接参照は `src/config/index.ts` 以外で禁止
2. エラーは型付きエラークラス（utils/errors.ts）を使用する
3. `async/await` を使用（コールバック禁止）
4. LLM プロンプトインジェクション対策: 発言テキストを `<speech>` タグで囲む
5. `maxConcurrentRequests: 3` を config に追加すること（SEC-R-002）
6. `.env` を `.gitignore` に追加すること（SEC-R-001）

## 国会 API 仕様

- 発言検索: `GET https://kokkai.ndl.go.jp/api/speech?any=<query>&speaker=<speaker>&from=<from>&until=<until>&maximumRecords=<limit>&recordPacking=json`
- 会議録取得: `GET https://kokkai.ndl.go.jp/api/meeting?issueID=<issueID>&recordPacking=json`
- 認証: なし
- レスポンス: JSON

## キャッシュ TTL

- 発言検索: 86400秒（1日）
- 会議録: 604800秒（7日）
- 要約: 604800秒（7日）

## エラークラス一覧

- `KokkaiApiError(message, statusCode?, retryable=true)` — 国会 API エラー
- `LlmApiError(message, retryable=true)` — LLM API エラー
- `ValidationError(message)` — 入力バリデーションエラー
- `TooManyItemsError(message)` — 件数過多
- `NotFoundError(message)` — 0 件・存在しない
- `ConfigurationError(message)` — 環境変数未設定

## Worktree ルール

各タスクで必ず worktree を作成してから実装すること:
```bash
git worktree add ../cc-agent-harness-wt-task-001 -b claude/impl-task-001
```
ただし本プロジェクトは git repo 未初期化のため、先に `git init` が必要。
