# DISPATCH-002: Gate 1 アーキテクチャ評価

## 依頼元

CEO

## 対象Agent

ARCH-EVAL

---

## プロジェクト要件サマリー

プロジェクト: 国会議事録検索・要約 MCP サーバー
要件定義書: `/c/Users/t_miyazaki/Dev/mcp/kokkai-mcp/docs/Requiement.md`

### 主要要件（評価観点に影響する要点）

- MCP サーバー（stdio transport）として動作すること
- 4 ツール: search_speeches / get_meeting / summarize_speeches / summarize_meeting
- Node.js + TypeScript、DB なし・メモリキャッシュのみ
- 国会会議録 API（NDL）+ Anthropic Claude API を外部依存として使用
- LLM コスト抑制のため段階要約（チャンク → 部分要約 → 最終統合）を採用
- 将来的に Web 画面・DB 追加可能な疎結合構造であること

---

## 評価対象成果物

### ARCH 成果物

- `docs/architecture/system-overview.md`
- `docs/architecture/layer-structure.md`
- `docs/architecture/module-design.md`
- `docs/architecture/data-flow.md`
- `docs/adr/ADR-001-mcp-architecture.md`

### TL 成果物

- `docs/architecture/tech-stack.md`
- `docs/architecture/api-design.md`
- `docs/architecture/coding-standards.md`
- `docs/adr/ADR-002-tech-stack.md`

---

## 評価結果の保存先

- `.agent-team/reviews/ARCH-EVAL-001.md`（評価レポート）
- `.agent-team/reviews/ARCH-EVAL-001.json`（機械読み取り用）
