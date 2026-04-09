#!/usr/bin/env bash
for f in $CLAUDE_FILE_PATHS; do
  case "$f" in
    CLAUDE.md)
      pwsh -File .claude/scripts/check-review-date.ps1 2>&1 || bash .claude/scripts/check-review-date.sh;;
  esac
done
