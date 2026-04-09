# TEST Agent コンテキスト: kokkai-mcp

## テストフレームワーク

- vitest（jest 互換 API）
- ESM 対応（追加設定不要）
- モック: `vi.mock()`, `vi.setSystemTime()`

## テストタスク

- TASK-012: ユニットテスト（preprocess.ts + cache.ts）
- TASK-013: 統合テスト（kokkaiApi.ts + summarizer.ts、モック使用）
- TASK-014: 受入テスト（MCP ツール、§18 受入条件 1〜6）

## 受入条件（§18）

1. キーワード指定で発言検索ができること
2. issueID 指定で会議録取得ができること
3. 検索結果を brief / standard で要約できること
4. 同一条件でキャッシュが効くこと
5. 国会 API または LLM API 異常時に適切なエラー応答を返せること
6. MCP クライアントから呼び出して利用できること

## テストファイル配置

```
tests/
├── unit/
│   ├── preprocess.test.ts
│   └── cache.test.ts
├── integration/
│   ├── kokkaiApi.test.ts
│   └── summarizer.test.ts
└── acceptance/
    ├── searchSpeeches.test.ts
    ├── getMeeting.test.ts
    ├── summarizeSpeeches.test.ts
    └── summarizeMeeting.test.ts
```

## モック方針

- 国会 API: `vi.mock` で fetch をモック
- Anthropic API: `vi.mock('@anthropic-ai/sdk')` でモック
- 時刻: `vi.setSystemTime()` でキャッシュ TTL テスト

## Worktree ルール

TASK-012〜014 は `tests/` 配下にテストファイルを書くため worktree が必要。
