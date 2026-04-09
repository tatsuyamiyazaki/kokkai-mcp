# TEST 設計レビュー: 受入条件・テスト観点

- **評価者:** TEST
- **対象 Dispatch:** DISPATCH-003
- **評価日:** 2026-04-09
- **判定:** PASS

---

## 受入条件マッピング

### 要件定義 §18 vs 設計の対応

| 受入条件 | 設計での対応 | テスト可能性 |
|---------|------------|------------|
| 1. キーワード指定で発言検索ができること | `search_speeches` ツール + kokkaiApi.ts /speech エンドポイント | TESTABLE |
| 2. issueID 指定で会議録取得ができること | `get_meeting` ツール + kokkaiApi.ts /meeting エンドポイント | TESTABLE |
| 3. brief / standard で要約できること | `summarize_speeches` の mode パラメータ + summarizer.ts | TESTABLE |
| 4. 同一条件でキャッシュが効くこと | cache.ts の TTL 管理 + キャッシュキー生成 | TESTABLE |
| 5. API 異常時に適切なエラー応答を返せること | KokkaiApiError / LlmApiError + MCP isError レスポンス | TESTABLE |
| 6. MCP クライアントから呼び出せること | server.ts stdio transport | TESTABLE（統合テスト） |

**全受入条件がテスト可能と判断。**

---

## テスト観点一覧

### preprocess.ts（純粋関数 → 単体テスト容易）

| テストケース | 観点 |
|------------|------|
| 形式的発言除外 | 「以上で〜を終了します」等が除外されること |
| 短発言除外 | 20文字未満の発言が除外されること |
| 境界値: 20文字ちょうど | 除外されないこと |
| 連続発言結合 | 同一話者の連続発言が結合されること |
| 異なる話者 | 結合されないこと |
| チャンク分割 | 8000文字超で分割されること |
| 空配列入力 | 空配列が返ること |

### cache.ts（純粋関数 → 単体テスト容易）

| テストケース | 観点 |
|------------|------|
| キャッシュ HIT | 同一キーで保存した値が返ること |
| キャッシュ MISS | 存在しないキーで undefined が返ること |
| TTL 期限切れ | TTL 経過後にキャッシュが無効になること |
| キャッシュキー生成 | 同一パラメータで同一キーが生成されること |
| 異なるパラメータ | 異なるキーが生成されること |

### kokkaiApi.ts（外部 API → モックが必要）

| テストケース | 観点 |
|------------|------|
| 正常レスポンス変換 | API レスポンスが SpeechItem[] に変換されること |
| 0 件レスポンス | NotFoundError がスローされること |
| 5xx エラー | KokkaiApiError (retryable: true) がスローされること |
| タイムアウト | KokkaiApiError (retryable: true) がスローされること |
| リトライ動作 | 失敗後にリトライされ、成功時に結果が返ること |
| リトライ上限 | maxRetries 超過後に例外がスローされること |
| キャッシュ統合 | 2 回目の呼び出しで API が呼ばれないこと |

### summarizer.ts（外部 LLM API → モックが必要）

| テストケース | 観点 |
|------------|------|
| brief モード | 短い要約が返ること |
| standard モード | main_points と speaker_points を含む要約が返ること |
| detailed モード | 詳細な論点整理を含む要約が返ること |
| チャンク複数 | 複数チャンクが統合されること |
| LLM API 失敗 | LlmApiError がスローされること |
| JSON パース失敗 | 不正な LLM レスポンスでエラーが返ること |
| focus 指定 | focus が要約に反映されること |

### tools/searchSpeeches.ts（統合テスト）

| テストケース | 観点 |
|------------|------|
| 正常検索 | query 指定で結果が返ること |
| 全条件省略 | ValidationError が返ること |
| limit 境界値 | limit=1 と limit=100 が正常動作すること |
| limit=101 | ValidationError が返ること |
| 日付形式不正 | ValidationError が返ること |

### tools/getMeeting.ts（統合テスト）

| テストケース | 観点 |
|------------|------|
| 正常取得 | issueID で会議録が返ること |
| issueID 未指定 | ValidationError が返ること |
| 存在しない issueID | NotFoundError が MCP エラーとして返ること |

### tools/summarizeSpeeches.ts（統合テスト）

| テストケース | 観点 |
|------------|------|
| brief モード | SummaryResult が返ること |
| standard モード | SummaryResult に main_points あり |
| items 0 件 | ValidationError が返ること |
| items 201 件 | TooManyItemsError が返ること |
| キャッシュ動作 | 2 回目で LLM が呼ばれないこと |

### E2E テスト（受入条件 6）

| テストケース | 観点 |
|------------|------|
| MCP stdio 起動 | server.ts が起動し tools/list に 4 ツールが含まれること |
| search_speeches 呼び出し | MCP クライアントから実際に呼び出しができること |
| エラーレスポンス | isError: true がクライアントに届くこと |

---

## テストツール推奨設定

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],  // E2E でカバー
    },
  },
})
```

### モック方針

- 国会 API: `vi.mock` または MSW（Mock Service Worker）でモック
- Anthropic API: `vi.mock('@anthropic-ai/sdk')` でモック
- 時刻: `vi.setSystemTime()` でキャッシュ TTL テスト

---

## 結論

**PASS**

4 ツール全てが受入条件に対応した設計になっており、テスト可能性が高い。
純粋関数（preprocess.ts, cache.ts）は単体テストが容易で、
外部 API 依存モジュールはモック化でテスト可能。
