# SEC 設計レビュー: kokkai-mcp

- **評価者:** SEC
- **対象 Dispatch:** DISPATCH-003
- **評価日:** 2026-04-09
- **判定:** PASS（軽微な推奨事項あり）

---

## 脅威モデル概要

### 攻撃面

```
MCP クライアント（Claude Desktop）
  → stdio: 信頼済みプロセス間通信（外部ネットワーク未公開）
  → 国会 API: 外部 HTTPS GET（認証なし）
  → Anthropic API: 外部 HTTPS POST（APIキー認証）
```

### 主要脅威

| 脅威 | 影響 | 対策状況 |
|------|------|---------|
| ANTHROPIC_API_KEY の漏洩 | 不正 LLM 利用・課金 | 環境変数管理（設計済み）|
| ログへの機微情報出力 | APIキー・発言内容の露出 | コーディング規約で禁止（設計済み）|
| 国会 API への大量リクエスト | API ブロック・ポリシー違反 | リトライ制限・件数上限（設計済み）|
| 悪意ある入力によるインジェクション | LLM プロンプトインジェクション | zod バリデーション + 構造化 JSON 出力 |
| 依存ライブラリの脆弱性 | サプライチェーン攻撃 | 設計段階では未対応（実装後に npm audit 推奨）|

---

## 認証・認可方針

### 国会 API（認証なし）

- 公開 API のため認証不要
- レート制限: 明示的なレート制限は公開されていないが、§17 の「短時間の大量アクセスを避ける」方針に従い、リトライ間隔を 1 秒以上に設定すること（実装時確認事項）
- 評価: PASS

### Anthropic API

- `ANTHROPIC_API_KEY` を環境変数で管理する設計が `config/index.ts` に明記されている
- `process.env` 直接参照禁止がコーディング規約に明記されている
- 評価: PASS

---

## 秘密情報管理

### 設計レビュー結果

- `ANTHROPIC_API_KEY` は `config/index.ts` 経由でのみアクセスする設計: PASS
- ログに APIキーを出力しない規約が `coding-standards.md` に明記されている: PASS
- `.env` ファイルは開発時のみで、`.gitignore` への追加が実装時に必要（設計書に未記載）

### 推奨事項 (SEC-R-001)

`.env` を `.gitignore` に追加すること。
`docs/architecture/tech-stack.md` または README に明記することを推奨する。

---

## 外部 API 呼び出し制約

- `config.maxRetries: 2` が設定されており、無限リトライを防止: PASS
- `requestTimeoutMs: 30000` でタイムアウト設定あり: PASS
- AbortController によるタイムアウト実装が `coding-standards.md` に記載: PASS
- 並列リクエスト上限 `maxConcurrentRequests: 3` が想定されているが、config 定義に未記載（ARCH-EVAL でも指摘済み）

---

## ログ機微情報

### 設計レビュー結果

- `coding-standards.md` にログ禁止事項が明記されている
  - APIキー: 禁止
  - 発言本文全文: 禁止（50文字まで）
  - クエリ文字列: DEBUG レベルのみ
- 評価: PASS

---

## 入力バリデーション

### zod スキーマ設計評価

- `search_speeches`: 少なくとも 1 条件必須の制約が `api-design.md` に明記: PASS
- `get_meeting`: `issueID` 必須が明記: PASS
- `summarize_speeches`: `items` 配列 1〜200 件制約が明記: PASS
- 日付形式 `YYYY-MM-DD` の正規表現バリデーションが明記: PASS

### プロンプトインジェクション対策

- `summarizer.ts` で LLM への入力は発言テキストとなるため、
  ユーザーの悪意ある入力がシステムプロンプトを破壊するリスクがある
- 対策: summarizer.ts 実装時に、ユーザー入力を system prompt ではなく
  user content に含め、発言テキストは `<speech>` タグ等で囲む構造にすること（推奨）

---

## 推奨事項一覧

| ID | 重要度 | 内容 | 対応時期 |
|----|--------|------|---------|
| SEC-R-001 | Low | `.env` を `.gitignore` に追加、README に記載 | 実装フェーズ |
| SEC-R-002 | Low | `maxConcurrentRequests` を config に追加 | 実装フェーズ |
| SEC-R-003 | Medium | LLM 入力でプロンプトインジェクション対策（タグ囲み）| summarizer.ts 実装時 |
| SEC-R-004 | Low | `npm audit` を CI に組み込む | CICD フェーズ |

---

## 結論

**PASS**

設計段階のセキュリティ要件（APIキー管理・ログ制約・入力バリデーション・外部 API 制約）は
適切に設計されている。指摘事項は軽微であり、実装フェーズでの対処で十分。
