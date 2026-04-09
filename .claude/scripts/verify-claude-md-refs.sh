#!/usr/bin/env bash
# verify-claude-md-refs.sh — CLAUDE.md 内のパス参照が実在するか検証する（冪等）
set -euo pipefail

ERRORS=0

check_exists() {
  local ref="$1"
  if [ ! -e "$ref" ]; then
    echo "CLAUDE.md参照切れ: $ref" >&2
    ERRORS=$((ERRORS + 1))
  fi
}

# CLAUDE.md が参照するパス・ファイルを検証
check_exists ".agent-team"
check_exists ".claude/scripts/init-workspace.sh"
check_exists ".claude/shared/review-findings.schema.json"
check_exists ".claude/shared/result.schema.json"
check_exists ".claude/shared/coordination-protocol.md"
check_exists ".claude/agents"
check_exists ".claude/settings.json"

# エージェント件数の整合性チェック
EXPECTED=19
ACTUAL=$(ls .claude/agents/*.md 2>/dev/null | wc -l)
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "エージェント件数不一致: CLAUDE.md記載=$EXPECTED / ファイル実数=$ACTUAL" >&2
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
  echo "検証失敗: $ERRORS 件の参照切れ" >&2
  exit 2
fi

echo "CLAUDE.md参照検証 OK（エージェント${ACTUAL}件）"
