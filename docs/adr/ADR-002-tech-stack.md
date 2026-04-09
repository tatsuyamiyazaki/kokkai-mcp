# ADR-002: 技術スタック決定

- **ステータス:** 承認済み
- **日付:** 2026-04-09
- **決定者:** TL

## コンテキスト

MCP サーバーを Node.js + TypeScript で実装するにあたり、
各ライブラリの選定を行う。

## 決定事項

### 1. HTTP クライアント: Node.js 標準 `fetch`（axios 不採用）

**理由:**
- Node.js 20+ で `fetch` が安定標準化された
- 外部依存を増やさず、バンドルサイズを削減する
- 国会 API は単純な GET リクエストのみで、axios の高度な機能は不要

### 2. バリデーション: `zod`（joi / yup 不採用）

**理由:**
- TypeScript 型推論との親和性が高い（スキーマから型が自動導出される）
- MCP SDK の inputSchema は JSON Schema 形式で定義するが、
  実行時バリデーションは zod が簡潔に実装できる
- `z.object().parse()` が throw するため async/await との相性が良い

### 3. テスト: `vitest`（jest 不採用）

**理由:**
- ES Module（`"type": "module"`）との親和性が高い
  （jest + ts-jest は ESM 設定が複雑）
- TypeScript に追加設定なしで対応
- jest 互換 API のため既存知識を流用可能

### 4. キャッシュ: `node-cache`（自前実装不採用）

**理由:**
- TTL 管理・自動削除・統計情報が標準で揃っている
- シンプルな KV インターフェースで `cache.ts` でラップしやすい
- 将来 Redis 等に差し替える際は `cache.ts` の実装のみ変更すれば良い

### 5. 要約モデル: `claude-3-5-haiku-20241022` をデフォルトに採用

**理由:**
- コスト効率最優先（要件定義 §12）
- haiku は高速・低コストで部分要約に適している
- 環境変数 `ANTHROPIC_MODEL` で上位モデルへの切り替えが可能

### 6. `"type": "module"` (ESM) を採用

**理由:**
- `@modelcontextprotocol/sdk` が ESM を前提としている
- Node.js 20+ での公式推奨形式

## 影響

- `import` 文では拡張子 `.js` を明示する（TypeScript でも）
- `tsconfig.json` は `"module": "Node16"` を使用する
- `package.json` に `"type": "module"` を設定する
