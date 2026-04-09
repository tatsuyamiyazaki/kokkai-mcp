foreach ($f in ($env:CLAUDE_FILE_PATHS -split '\s+' | Where-Object { $_ })) {
    if ($f -match '(^|[/\\])CLAUDE\.md$') {
        pwsh -File .claude/scripts/verify-claude-md-refs.ps1
        if ($LASTEXITCODE -ne 0) { exit 2 }
    }
}
