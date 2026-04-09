> 最終更新: 2026-04-06 / 次回ハーネス見直し: 2026-07-06（`/review-harness` を実行）

## Project

- 性質: Claude Code Agent Team のスキル定義・運用基盤（コード開発プロジェクトではない）
- 主要ファイル形式: Markdown（エージェント定義）、JSON（スキーマ、タスク）
- エージェント定義: `.claude/agents/`（19エージェント）

## Environment

- OS: Windows 11 / シェル: bash (Git Bash)
- Python: 3.x（検証スクリプト用）
- 主要ファイル形式: Markdown (CommonMark)、JSON Schema (draft-07)

## Stack

- Markdown: CommonMark + GFM
- JSON Schema: draft-07
- Python: 3.11+ / 依存管理: uv（pip ではない）
- Hook 依存: jsonschema, markdownlint-cli

## エージェントの使い方

開発タスクは **CEO エージェント** に委任してください。理由: 19エージェントの並行作業を整合させるには統合判断を保持する単一ポイントが必要で（T-2.3 統合判断を委任しない）、CEOがその役割を担うため。

### 例外: CEO を経由しない直呼び条件

次の**すべて**を満たす場合のみ `reviewer` を直呼びしてよい:

- 対象が 1 ファイル以内
- lint / タイポ / フォーマット修正のみ（仕様変更を伴わない）
- 他エージェントの成果物への影響がない

それ以外は必ず CEO 経由。迷ったら CEO。

## エージェント一覧

| エージェント | 略称 | 役割 |
|------------|------|------|
| **ceo** | CEO | 統括者・人間との唯一の窓口 |
| **agent-router** | AR | 専門エージェントへのルーティング・実行計画策定 |
| **knowledge-manager** | KM | 知識・コンテキスト管理 |
| **context-graph** | CG | 依存関係グラフ・変更影響分析 |
| **architect-evaluator** | ARCH-EVAL | Gate 1: アーキテクチャ評価 |
| **design-evaluator** | DESIGN-EVAL | Gate 2: デザイン評価 |
| architect | ARCH | システム構造設計 |
| tech-lead | TL | 技術スタック選定・規約策定 |
| ui-ux-designer | UIUX | UI/UX設計 |
| database-specialist | DBA | DB設計・スキーマ |
| project-manager | PM | タスク管理・WBS |
| frontend-expert | FE | UI実装 |
| backend-expert | BE | API実装 |
| infra-expert | INFRA | インフラ構築 |
| cicd-engineer | CICD | CI/CDパイプライン |
| security-expert | SEC | セキュリティ |
| reviewer | REV | コードレビュー |
| tester | TEST | テスト |
| document-writer | DOC | ドキュメント整備 |

## Worktree 必須ルール（実装フェーズ）

FE / BE / INFRA / CICD は実装成果物を書き込む前に **必ず git worktree を作成** し、その中で編集すること。理由: メインツリーでの直接編集は他エージェントの並行作業・レビュー・ロールバックと衝突するため。

- 配置規約: `../cc-agent-harness-wt-{task-id}`（リポジトリと兄弟ディレクトリ）
- ブランチ命名: `claude/impl-{task-id}`（task-id は PM が発行する `TASK-XXX` を小文字化）
- 作成コマンド例:

  ```bash
  git worktree add ../cc-agent-harness-wt-task-001 -b claude/impl-task-001
  cd ../cc-agent-harness-wt-task-001
  ```

- 監視対象パス（worktree 外で編集するとフックが exit 2 でブロック）:
  `frontend/`, `backend/`, `infrastructure/`, `tests/`, `.github/workflows/`
- 除外（通常ツリーで編集可）: `.agent-team/`, `docs/`, `.claude/`, ルート直下 `*.md`
- 強制実装: `.claude/scripts/hook-require-worktree.sh` / `.ps1`（PreToolUse フック）
- AR は実装フェーズの dispatch brief に `worktree_path` と `branch` を含めること。
- 作業完了後は `git worktree remove` で後片付けする。

## ワークスペース

`.agent-team/` と `docs/` を作業領域として使用。未初期化の場合は以下を実行:

- Windows: `.claude/scripts/init-workspace.ps1`
- Linux / macOS: `bash .claude/scripts/init-workspace.sh`

agent-router が策定した実行計画は `.agent-team/dispatch/plan-{timestamp}.json` に必ず保存し、各エージェントの結果は `.agent-team/results/{agent}/` に JSON で永続化する。圧縮で会話が失われても CEO が Read で計画を復元できる状態を保つ。

