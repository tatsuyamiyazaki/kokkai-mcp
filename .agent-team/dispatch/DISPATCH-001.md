# DISPATCH-001: ARCH + TL 設計（フェーズ1）

## 依頼元
CEO

## 対象Agent
ARCH → TL（順次実行）

---

## プロジェクト概要

**プロジェクト名:** 国会議事録検索・要約 MCP サーバー  
**要件定義書:** `/c/Users/t_miyazaki/Dev/mcp/kokkai-mcp/docs/Requiement.md`

### 背景
国会会議録検索システム（https://kokkai.ndl.go.jp/api.html）が公開する REST API を利用し、
発言検索・会議録取得・要約機能を MCP ツールとして提供するサーバーを構築する。
初期版は画面・DB なしの最小構成。MCP クライアント（Claude Desktop 等）から呼び出して利用する。

### 技術制約
- 実装言語: Node.js + TypeScript（要件定義 §16.1）
- DB: なし（メモリキャッシュのみ）
- 外部 API: 国会会議録 API（無料・HTTPS GET）、LLM API（Anthropic Claude API 優先）
- MCP SDK: @modelcontextprotocol/sdk

---

## ARCH への指示

### 成果物の保存先
- `docs/architecture/system-overview.md` — システム全体像・コンポーネント図（Mermaid）
- `docs/architecture/layer-structure.md` — レイヤー構成・依存関係
- `docs/architecture/module-design.md` — モジュール一覧と責務
- `docs/architecture/data-flow.md` — データフロー（リクエスト〜レスポンス）
- `docs/adr/ADR-001-mcp-architecture.md` — アーキテクチャ決定記録

### 設計指針
1. MCP サーバーとして動作する（stdio または HTTP transport）
2. 以下の 4 ツールを MCP ツールとして公開する:
   - `search_speeches` — 発言検索
   - `get_meeting` — 会議録取得
   - `summarize_speeches` — 発言群要約
   - `summarize_meeting` — 会議録全体要約
3. レイヤー分離を明確にする（tools / services / external API）
4. 将来的な Web 画面・DB 追加に対応できる疎結合構造にする
5. キャッシュレイヤーを service と外部 API 呼び出しの間に挟む

### 要求モジュール（§16.2, §16.3 より）
```
src/
  server.ts          — MCPサーバーエントリポイント
  tools/             — MCPツール定義（入力スキーマ・ハンドラ）
  services/
    kokkaiApi.ts     — 国会API呼び出し
    preprocess.ts    — 発言前処理（除外・結合・重要度判定）
    summarizer.ts    — LLM要約（チャンク分割・段階要約）
    cache.ts         — メモリキャッシュ（TTL管理）
  types/             — 型定義
  config/            — 設定・環境変数
```

---

## TL への指示（ARCH 完了後に実行）

ARCH の成果物（`docs/architecture/` 全体）を読んでから以下を作成すること。

### 成果物の保存先
- `docs/architecture/tech-stack.md` — 技術スタック・バージョン・選定理由
- `docs/architecture/api-design.md` — MCP ツール API 仕様（入出力スキーマ・エラー仕様）
- `docs/architecture/coding-standards.md` — コーディング規約・命名規則・エラーハンドリング方針
- `docs/adr/ADR-002-tech-stack.md` — 技術スタック決定記録

### 指定技術スタック
- **Runtime:** Node.js 20+（LTS）
- **言語:** TypeScript 5.x（strict mode）
- **MCP SDK:** `@modelcontextprotocol/sdk` 最新版
- **HTTP Client:** `axios` または Node.js 標準 `fetch`（国会 API 呼び出し用）
- **LLM Client:** `@anthropic-ai/sdk`（Anthropic Claude API）
- **キャッシュ:** `node-cache` または自前実装（TTL 付きメモリキャッシュ）
- **ビルド:** `tsc`
- **テスト:** `jest` + `ts-jest`（または `vitest`）
- **Linter/Formatter:** `eslint` + `prettier`

### API 設計要求事項
以下の 4 ツールの MCP 入出力スキーマを JSON Schema 形式で定義すること:

1. `search_speeches`
   - 入力: query, speaker, nameOfMeeting, from, until, limit（既定値: 10）
   - 出力: total, items（speechID, issueID, date, nameOfMeeting, speaker, speech）

2. `get_meeting`
   - 入力: issueID（必須）
   - 出力: issueID, date, nameOfMeeting, speeches（speaker, speech, speechOrder）

3. `summarize_speeches`
   - 入力: items（発言配列）, mode（brief/standard/detailed）, focus（任意文字列）
   - 出力: overview, main_points, speaker_points, conclusion, caution（任意）

4. `summarize_meeting`
   - 入力: issueID, mode（brief/standard/detailed）, focus（任意文字列）
   - 出力: issueID, overview, main_points, speaker_points, conclusion

### エラー仕様
以下のエラーケースを列挙し、MCP エラーレスポンス形式を定義すること:
- 国会 API 呼び出し失敗（タイムアウト・5xx）
- LLM API 呼び出し失敗
- 検索結果 0 件
- 不正入力値
- issueID 未指定
- 要約対象件数過多

### コーディング規約
- `async/await` を使用する（コールバック禁止）
- エラーは `throw new Error()` ではなく型付きエラークラスを使用する
- 環境変数は `config/` で一元管理し、各モジュールが直接 `process.env` を参照しない
- ログは機微情報（APIキー・発言本文）を出力しない

---

## 結果の保存
作業完了後、以下に結果サマリーを出力すること:
- `.agent-team/results/RESULT-001.md`（ARCH+TL 完了サマリー）
