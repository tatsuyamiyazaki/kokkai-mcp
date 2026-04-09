# DISPATCH-003: SEC 設計レビュー + TEST 受入条件策定

## 依頼元

CEO

## 対象Agent

SEC（設計レビュー）、TEST（受入条件・テスト観点レビュー）

---

## 背景

DB・UIUX は本プロジェクトの対象外（要件定義 §4.2）のため Phase 1.5 をスキップする。
Gate 1 (ARCH-EVAL) が APPROVE されたため、Phase 1.6 として設計段階の
セキュリティレビューとテスト観点レビューを実施する。

---

## SEC への指示: 設計セキュリティレビュー

### 評価対象成果物

- `docs/architecture/system-overview.md`
- `docs/architecture/layer-structure.md`
- `docs/architecture/module-design.md`
- `docs/architecture/api-design.md`
- `docs/architecture/coding-standards.md`
- `docs/adr/ADR-001-mcp-architecture.md`
- `docs/adr/ADR-002-tech-stack.md`

### レビュー観点

1. **脅威モデル概要**: MCP サーバーとして考えられる脅威を列挙する
2. **認証・認可方針**: 国会 API（認証なし）と Anthropic API（APIキー）の管理方針
3. **秘密情報管理**: `ANTHROPIC_API_KEY` の扱いが安全か
4. **外部 API 制約**: 国会 API へのレート制限・多重リクエスト抑制
5. **ログ機微情報**: 設計段階でのログ方針に問題がないか
6. **入力バリデーション**: zod による入力検証が充分か

### 成果物の保存先

- `.agent-team/reviews/SEC-DESIGN-001.md`
- `.agent-team/reviews/SEC-DESIGN-001.json`

---

## TEST への指示: テスト観点・受入条件レビュー

### 評価対象成果物

- `docs/architecture/api-design.md`（ツール仕様・エラー仕様）
- `docs/architecture/data-flow.md`（フロー図）
- `docs/architecture/module-design.md`（モジュール責務）

### レビュー観点

1. **受入条件マッピング**: 要件定義 §18 の受入条件 1〜6 が設計で達成可能か確認
2. **テスト観点の洗い出し**: 主要境界条件（正常・異常・エッジケース）を列挙
3. **ユニットテスト対象**: 各モジュールのテスト容易性を評価
4. **インテグレーションテスト**: 外部 API モックが必要な箇所の特定
5. **キャッシュ動作**: TTL・HIT/MISS のテスト方法

### 受入条件（要件定義 §18）

1. キーワード指定で発言検索ができること
2. issueID 指定で会議録取得ができること
3. 検索結果を brief / standard で要約できること
4. 同一条件でキャッシュが効くこと
5. 国会 API または LLM API 異常時に適切なエラー応答を返せること
6. MCP クライアントから呼び出して利用できること

### 成果物の保存先

- `.agent-team/reviews/TEST-DESIGN-001.md`
- `.agent-team/reviews/TEST-DESIGN-001.json`
