# タスク依存関係グラフ

## 依存関係図

```
TASK-001 (プロジェクト初期化)
  ├── TASK-002 (config/index.ts)
  ├── TASK-003 (types/index.ts)
  ├── TASK-004 (utils/errors.ts)
  └── TASK-005 (utils/logger.ts)

TASK-002 + TASK-003 + TASK-004
  └── TASK-006 (cache.ts)
        └── TASK-007 (kokkaiApi.ts)
              └── TASK-010 (tools/)
                    └── TASK-011 (server.ts)

TASK-003
  └── TASK-008 (preprocess.ts)
        └── TASK-009 (summarizer.ts)
              └── TASK-010 (tools/)

TASK-006 + TASK-008
  └── TASK-012 (unit tests)

TASK-007 + TASK-009
  └── TASK-013 (integration tests with mocks)

TASK-011 + TASK-012 + TASK-013
  └── TASK-014 (acceptance tests)

TASK-011
  └── TASK-015 (README + .env.example)
```

## 並列実行可能グループ

| フェーズ | タスク（並列実行可） |
|---------|-------------------|
| Phase A | TASK-001 |
| Phase B | TASK-002, TASK-003, TASK-004, TASK-005 |
| Phase C | TASK-006, TASK-008 |
| Phase D | TASK-007, TASK-009 |
| Phase E | TASK-010 |
| Phase F | TASK-011 |
| Phase G | TASK-012, TASK-013 |
| Phase H | TASK-014, TASK-015 |

## 注意事項

- TASK-007 (kokkaiApi.ts) は必ず TASK-006 (cache.ts) の後に実装する
- TASK-009 (summarizer.ts) は TASK-008 (preprocess.ts) の後に実装する（型の参照のため）
- テスト (TASK-012〜014) はすべて worktree 内で実行する
- TASK-015 (DOC) は worktree 不要（docs/ は通常ツリーで編集可）
