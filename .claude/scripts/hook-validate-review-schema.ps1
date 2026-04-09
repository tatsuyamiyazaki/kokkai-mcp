foreach ($f in ($env:CLAUDE_FILE_PATHS -split '\s+' | Where-Object { $_ })) {
    if ($f -match '[/\\]\.agent-team[/\\]reviews[/\\][^/\\]+\.json$') {
        python -c "import json,sys; s=json.load(open('.claude/shared/review-findings.schema.json')); d=json.load(open(sys.argv[1])); import jsonschema; jsonschema.validate(d,s)" $f
        if ($LASTEXITCODE -ne 0) { exit 2 }
    }
}
