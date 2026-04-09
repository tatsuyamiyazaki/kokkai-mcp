# check-review-date.ps1 — CLAUDE.md の次回ハーネス見直し日が過ぎていれば警告する

$claudeMd = "CLAUDE.md"

# 次回見直し日を CLAUDE.md から抽出
$match = Select-String -Path $claudeMd -Pattern '次回ハーネス見直し: (\d{4}-\d{2}-\d{2})' |
         Select-Object -First 1

if (-not $match) {
    Write-Warning "CLAUDE.md に次回ハーネス見直し日が見つかりません"
    exit 0  # 警告のみ、ブロックしない
}

$nextReview = [datetime]::ParseExact(
    $match.Matches[0].Groups[1].Value, "yyyy-MM-dd", $null
)
$today = [datetime]::Today

if ($today -gt $nextReview) {
    Write-Warning "ハーネス見直し期限を過ぎています（期限: $($nextReview.ToString('yyyy-MM-dd')) / 今日: $($today.ToString('yyyy-MM-dd'))）"
    Write-Warning "/review-harness を実行して CLAUDE.md の見直し日を更新してください"
}

# 期限超過でもブロックしない（警告のみ）
exit 0
