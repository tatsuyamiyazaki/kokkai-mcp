foreach ($f in ($env:CLAUDE_FILE_PATHS -split '\s+' | Where-Object { $_ })) {
    if ($f -match '\.json$') {
        python -m json.tool $f > $null
        if ($LASTEXITCODE -ne 0) { exit 2 }
    }
}
