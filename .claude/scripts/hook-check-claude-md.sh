#!/usr/bin/env bash
for f in $CLAUDE_FILE_PATHS; do
  case "$f" in
    CLAUDE.md)
      pwsh -File .claude/scripts/verify-claude-md-refs.ps1 2>/dev/null || bash .claude/scripts/verify-claude-md-refs.sh || exit 2;;
  esac
done
