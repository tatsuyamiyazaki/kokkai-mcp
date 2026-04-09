#!/usr/bin/env bash
# check-review-date.sh — CLAUDE.md の次回ハーネス見直し日が過ぎていれば警告する

set -euo pipefail

CLAUDE_MD="CLAUDE.md"

# 次回見直し日を CLAUDE.md から抽出
NEXT_REVIEW=$(grep -oP '次回ハーネス見直し: \K[\d-]+' "$CLAUDE_MD" 2>/dev/null || true)

if [ -z "$NEXT_REVIEW" ]; then
  echo "⚠️  CLAUDE.md に次回ハーネス見直し日が見つかりません" >&2
  exit 0  # 警告のみ、ブロックしない
fi

TODAY=$(date +%Y-%m-%d)

if [[ "$TODAY" > "$NEXT_REVIEW" ]]; then
  echo "⚠️  ハーネス見直し期限を過ぎています（期限: $NEXT_REVIEW / 今日: $TODAY）" >&2
  echo "   /review-harness を実行して CLAUDE.md の見直し日を更新してください" >&2
fi

# 期限超過でもブロックしない（警告のみ）
exit 0
