# Agent Team Coordination Protocol (CEO-Driven)

## 組織構造

```
Human → CEO Agent (唯一の窓口)
          ├── Agent Router (AR)              # ディスパッチ・実行計画
          │     ├── Architect (ARCH)          # システム構造設計
          │     ├── Tech Lead (TL)            # 技術スタック選定・規約
          │     ├── UI/UX Designer (UIUX)     # UI/UX設計
          │     ├── Database Specialist (DBA) # DB設計・スキーマ・最適化
          │     ├── Project Manager (PM)      # タスク管理
          │     ├── Frontend Expert (FE)      # UI実装
          │     ├── Backend Expert (BE)       # API実装（DBAスキーマ基準）
          │     ├── Infrastructure (INFRA)    # インフラ
          │     ├── CI/CD Engineer (CICD)     # パイプライン
          │     ├── Security Expert (SEC)     # セキュリティ
          │     ├── Reviewer (REV)            # コードレビュー
          │     ├── Tester (TEST)             # テスト
          │     └── Document Writer (DOC)     # ドキュメント
          ├── Knowledge Manager (KM)         # 知識・文脈管理
          ├── Context Graph (CG)             # 依存関係・影響分析（KM成果物を入力）
          ├── Architect Evaluator (ARCH-EVAL) # Gate 1: アーキテクチャ評価
          └── Design Evaluator (DESIGN-EVAL)  # Gate 2: デザイン評価

接続関係:
  CEO → AR: タスク指示・実行計画依頼
  CEO → KM: 知識管理・コンテキスト生成依頼
  CEO → CG: 依存関係グラフ・影響分析依頼（KM完了後に実行）
  CEO → ARCH-EVAL: Gate 1 アーキテクチャ評価依頼（ARCH+TL完了後）
  CEO → DESIGN-EVAL: Gate 2 デザイン評価依頼（UIUX+DBA+SEC+TEST完了後）
  AR → 全専門Agent: ディスパッチ（実行計画に基づく）
  全専門Agent → KM: 知識・成果物のフィードバック
  KM → CG: cg-request.md 経由で指示を間接伝達（ファイル連携）
  CG → KM: CG成果物（graph/）をKMが参照してAgent別コンテキストに反映
  CG → AR, FE, BE, INFRA, TEST, REV, SEC, DOC: コンテキスト提供
  ARCH-EVAL → CEO: APPROVE/REJECT（修正指示付き）を返却
  DESIGN-EVAL → CEO: APPROVE/REJECT（修正指示付き）を返却
```

## ワークスペース

```
project-root/
├── CLAUDE.md
├── README.md                        # DOC成果物
├── CHANGELOG.md                     # DOC成果物
├── .agent-team/
│   ├── prompts/                     # 各エージェントプロンプト
│   ├── dispatch/DISPATCH-NNN.md     # CEOからの指示書
│   ├── results/RESULT-NNN.md        # 実行結果
│   ├── tasks/TASK-NNN.json          # タスクボード
│   ├── reviews/REV-NNN.json         # レビュー記録
│   ├── reports/sprint-NNN.md        # レポート
│   ├── knowledge/                   # KM成果物 ★NEW
│   │   ├── project-context.md
│   │   ├── decision-registry.md
│   │   ├── coding-rules.md
│   │   ├── knowledge-map.md
│   │   ├── contradiction-report.md
│   │   ├── context-{agent}.md
│   │   ├── cg-request.md            # KM→CG指示ファイル ★NEW
│   │   └── graph/                   # CG成果物 ★NEW
│   │       ├── entity-graph.md
│   │       ├── module-deps.md
│   │       ├── impact-{NNN}.md
│   │       ├── flow-{feature}.md
│   │       └── tech-debt.md
│   └── routing/                     # AR成果物 ★NEW
│       ├── PLAN-NNN.md
│       └── REPLAN-NNN.md
├── docs/
│   ├── architecture/                # ARCH + TL 成果物
│   ├── design/                      # UIUX成果物
│   │   ├── user-flows.md
│   │   ├── wireframes/
│   │   ├── design-system.md
│   │   └── component-specs.md
│   ├── adr/                         # TL成果物
│   ├── database/                    # DBA成果物 ★NEW
│   │   ├── schema-design.md
│   │   ├── index-strategy.md
│   │   └── migration-strategy.md
│   ├── api/                         # BE成果物
│   ├── operations/                  # DOC成果物
│   │   ├── runbook.md
│   │   ├── local-setup.md
│   │   ├── deploy-guide.md
│   │   └── troubleshooting.md
│   └── design-summary.md            # DOC成果物
└── [frontend/ backend/ ...]
```

## CEO / AR 判断権限マトリクス

| 判断カテゴリ | CEO（WHAT/WHY） | AR（HOW/WHEN） |
|-------------|----------------|---------------|
| フェーズ遷移 | ✅ 決定する | — |
| ゲート承認 | ✅ Evaluatorに評価依頼しAPPROVE/REJECTに基づき判定 | — |
| 例外エスカレーション | ✅ 人間に判断を仰ぐか | — |
| 品質の最終判断 | ✅ PASS/FAIL | — |
| スコープ変更 | ✅ 受け入れるか | — |
| Agent選択 | — | ✅ どのAgentを使うか |
| 実行順序 | — | ✅ 順次/並列の判断 |
| コンテキスト戦略 | — | ✅ 各Agentへの情報 |
| 再ルーティング | — | ✅ 失敗時の代替 |
| タスク粒度 | — | ✅ ディスパッチの大きさ |

## フェーズ定義 ★REVISED

| # | Phase | 主要Agent | 完了条件 |
|---|-------|----------|---------|
| 1 | Architecture | ARCH → TL | 構造設計+技術選定完了 + **★ARCH-EVAL APPROVE★** |
| **1.3** | **Knowledge Init** | **KM → CG** | **KM: 初期コンテキスト生成 + CG向け指示出力 → CG: エンティティグラフ生成** |
| **1.5** | **UI/UX Design + DB Design + DOC用語統一** | **UIUX + DBA + DOC（並行）** | **デザイン完了、スキーマ設計完了、用語集・設計書骨子策定** |
| **1.6** | **Design Quality Pre-check ★NEW** | **SEC + TEST（並行）** | **SEC: 脅威モデル概要・認証認可方針レビュー、TEST: 受入条件素案・境界条件洗い出し** |
| **1.7** | **Knowledge Sync** | **KM → CG** | **KM: 全設計成果物の知識集約・矛盾検出 + CG向け指示出力 → CG: グラフ更新 + ★DESIGN-EVAL APPROVE★** |
| **1.9** | **Planning + Routing + DOC設計概要** | **PM（必須）→ AR → DOC** | **WBS完了・タスク生成 → 実行計画策定 → 設計概要初版** |
| 2 | Implementation | KM(context) → DBA(migration), FE, BE, INFRA, CICD | 主要機能完了 |
| 3 | Quality (Review Loop) | CG(analysis) → REV, SEC(実装レビュー), TEST(テスト実装) | **REV APPROVE + SEC PASS + TEST全PASS（不合格時はFE/BE修正→再レビューをループ）** |
| 4 | Integration | FE, BE, TEST, SEC | 結合テスト通過 |
| 5 | Release | TEST, SEC, CICD, DOC | 本番デプロイ + ドキュメント完備 |

**フロー:**
```
Phase 1: CEO → AR → ARCH → TL → ★Gate 1: ARCH-EVAL評価（APPROVEまでループ）★
  → Phase 1.3: CEO → KM: 初期知識構築 → CEO → CG: エンティティグラフ初版
  → Phase 1.5: CEO → AR → UIUX + DBA + DOC(用語集)並行 / INFRA/CICD並行
  → Phase 1.6: CEO → AR → SEC(設計レビュー) + TEST(テスト観点レビュー)並行
  → Phase 1.7: CEO → KM: 知識同期・矛盾検出（SEC/TEST結果含む）→ CEO → CG: グラフ更新
  → ★Gate 2: DESIGN-EVAL評価（APPROVEまでループ）★
  → Phase 1.9: CEO → AR → PM → AR: 実行計画策定 → CEO → KM: Agent別コンテキスト生成 → DOC: 設計概要初版
  → Phase 2: CEO → AR → DBA migration → BE → FE（KMコンテキスト添付）
  → Phase 3: CEO → AR → REV + SEC(実装レビュー) + TEST(テスト実装)（全合格までループ: 不合格 → KM→CG → AR → FE/BE修正 → 再レビュー）
  → DOC は Phase 1.5〜Phase 5で随時（AR経由でディスパッチ）
  → KM は Phase 2〜Phase 5で随時（CEO → KM）
  → CG は Phase 2〜Phase 5で随時（CEO → KM → cg-request.md → CEO → CG）
```

**絶対ルール:**
- **CEOは専門Agentに直接ディスパッチしない。AR経由でディスパッチする。**（KM・CG・ARCH-EVAL・DESIGN-EVALは例外）
- **Gate 1（ARCH-EVAL APPROVE）なしに、UIUX / DBA を開始しない。**
- **Gate 2（DESIGN-EVAL APPROVE）なしに、PMを開始しない。**
- **EvaluatorがREJECTした場合、修正指示を対象Agentに伝え、修正後に再評価。APPROVEまでループする。**
- **Phase 3: REV/SEC/TESTのいずれかが不合格の場合、FE/BEに修正を指示し、不合格だったレビューAgentのみ再実行。全合格までループする（上限3回。3回で解消しない場合は人間にエスカレーション）。**
- **PMのWBS完了なしに、FE/BEの実装を開始しない。**
- **DBAのスキーマ設計完了なしに、BEの実装を開始しない。**
- **実装Agent（FE/BE）ディスパッチ前にKMでAgent別コンテキストを最新化する。**
- INFRA/CICDはPhase 1承認後にAR経由で開始可能（デザイン/PM完了を待たない）。
- DBAはPhase 1承認後にAR経由で開始可能（デザイン承認を待たない）。
- KM/CGはPhase 1承認後からCEO→KM経由で随時実行可能。
- **人間への報告（Gate通過・進捗）は非同期。人間の応答を待たずに次フェーズに進む。** 人間の応答を待つのは: (1)要件の曖昧さ確認、(2)ループ上限到達時のエスカレーション、(3)最終リリース判断のみ。

## Hook 失敗時の全エージェント共通責務

PostToolUse Hook が非ゼロ終了した場合、**全エージェント**は以下のループを実行する:

1. エラーメッセージを読み、原因を特定する
2. 対象ファイルを修正して再 Write する
3. Hook が連続 2 回 PASS するまでループを抜けない
4. 3 回試みても解決しない場合は CEO にエスカレーションする

エラーを無視して次の処理に進むことは禁止。

## CEO の完了判定ルール

CEO が Human に「完了」と報告する前に、以下を全て確認する:

1. 各エージェントの `.agent-team/results/{agent}/RESULT-{task_id}.json` 内の `acceptance_criteria` が全て `"verified": true` であること
2. Gate 1 の `.agent-team/reviews/ARCH-EVAL-*.json` に `"verdict": "APPROVE"` が存在すること（Phase 1以降）
3. Gate 2 の `.agent-team/reviews/DESIGN-EVAL-*.json` に `"verdict": "APPROVE"` が存在すること（Phase 1.9以降）
4. Phase 3: `.agent-team/reviews/REV-*.json`, `SEC-*.json`, `TEST-*.json` が全て `"verdict": "APPROVE"` または `"PASS"` であること

これらが揃っていない場合、完了とみなさず未完了エージェントに差し戻す。

## ディスパッチ・タスク・レビュー形式

（前版と同一。省略せず各スキルのSKILL.mdに記載）

## 衝突回避

| Agent | 編集可能ファイル |
|-------|----------------|
| **ARCH** | **docs/architecture/ (構造設計部分)** |
| TL | docs/architecture/ (技術選定部分), docs/adr/ |
| **UIUX** | **docs/design/** |
| **DBA** | **docs/database/, backend/migrations/, backend/seeds/** |
| PM | .agent-team/tasks/, .agent-team/reports/ |
| FE | frontend/ |
| BE | backend/ (migrations/除く), docs/api/ |
| INFRA | infrastructure/, docker/ |
| CICD | .github/workflows/ |
| SEC | .agent-team/reviews/ (SEC分) |
| REV | .agent-team/reviews/ (REV分) |
| TEST | tests/ |
| **KM** | **.agent-team/knowledge/ (graph/除く)** |
| **CG** | **.agent-team/knowledge/graph/** |
| **AR** | **.agent-team/routing/** |
| **ARCH-EVAL** | **.agent-team/reviews/ARCH-EVAL-*.md** |
| **DESIGN-EVAL** | **.agent-team/reviews/DESIGN-EVAL-*.md** |
| **DOC** | **README.md, CHANGELOG.md, docs/operations/, docs/design-summary.md, docs/glossary.md** |
