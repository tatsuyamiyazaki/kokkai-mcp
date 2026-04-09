# 設計決定レジストリ

| ID | 決定内容 | 理由 | 影響範囲 | 日付 |
|----|---------|------|---------|------|
| D-001 | stdio transport 採用 | Claude Desktop 統合最適 | server.ts | 2026-04-09 |
| D-002 | 4 ツール構成 | 認知負荷最小化 | tools/ 全体 | 2026-04-09 |
| D-003 | DB なし・メモリキャッシュ | 初期最小構成 | cache.ts | 2026-04-09 |
| D-004 | チャンク段階要約 | LLM コスト抑制 | summarizer.ts | 2026-04-09 |
| D-005 | claude-3-5-haiku デフォルト | コスト最優先 | summarizer.ts | 2026-04-09 |
| D-006 | Node.js fetch（axios 不採用）| 依存最小化 | kokkaiApi.ts | 2026-04-09 |
| D-007 | zod バリデーション | TypeScript 型推論との親和性 | tools/ 全体 | 2026-04-09 |
| D-008 | vitest（jest 不採用）| ESM 親和性 | tests/ | 2026-04-09 |
| D-009 | ESM ("type": "module") | MCP SDK 要件 | 全ファイル | 2026-04-09 |
| D-010 | 件数上限 200 件（要約対象）| コスト・性能保護 | summarizeSpeeches.ts | 2026-04-09 |
