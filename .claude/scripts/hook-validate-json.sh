#!/usr/bin/env bash
for f in $CLAUDE_FILE_PATHS; do
  case "$f" in
    *.json) python -m json.tool "$f" > /dev/null || exit 2;;
  esac
done
