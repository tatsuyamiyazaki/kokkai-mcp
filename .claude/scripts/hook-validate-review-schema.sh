#!/usr/bin/env bash
for f in $CLAUDE_FILE_PATHS; do
  case "$f" in
    .agent-team/reviews/*.json)
      python -c "import json,sys; s=json.load(open('.claude/shared/review-findings.schema.json')); d=json.load(open(sys.argv[1])); import jsonschema; jsonschema.validate(d,s)" "$f" || exit 2;;
  esac
done
