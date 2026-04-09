# PreToolUse hook (PowerShell): FE/BE/INFRA/CICD 実装書き込み時に git worktree を必須化する。
# 詳細は hook-require-worktree.sh を参照。

$ErrorActionPreference = 'Stop'

$toolName  = $env:CLAUDE_TOOL_NAME
$filePaths = $env:CLAUDE_FILE_PATHS

if (-not $toolName) { exit 0 }
if ($toolName -notin @('Write','Edit','NotebookEdit')) { exit 0 }
if ([string]::IsNullOrWhiteSpace($filePaths)) { exit 0 }

try {
  $root = (git rev-parse --show-toplevel) 2>$null
} catch { $root = $null }

function Test-Guarded([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return $false }
  if ([System.IO.Path]::IsPathRooted($p) -and $root) {
    $rel = $p.Substring($root.Length).TrimStart('\','/')
  } else {
    $rel = $p -replace '\\','/'
  }
  $rel = $rel -replace '\\','/'
  return ($rel -like 'frontend/*' -or
          $rel -like 'backend/*' -or
          $rel -like 'infrastructure/*' -or
          $rel -like 'tests/*' -or
          $rel -like '.github/workflows/*')
}

$needsCheck = $false
foreach ($f in $filePaths.Split(' ')) {
  if (Test-Guarded $f) { $needsCheck = $true; break }
}
if (-not $needsCheck) { exit 0 }

try {
  $gitDir    = (git rev-parse --git-dir) 2>$null
  $commonDir = (git rev-parse --git-common-dir) 2>$null
} catch {
  [Console]::Error.WriteLine("hook-require-worktree: git リポジトリ外のためブロック: $filePaths")
  exit 2
}

if (-not $gitDir -or -not $commonDir) {
  [Console]::Error.WriteLine("hook-require-worktree: git 情報取得失敗のためブロック: $filePaths")
  exit 2
}

$gitDirAbs    = (Resolve-Path $gitDir).Path
$commonDirAbs = (Resolve-Path $commonDir).Path

if ($gitDirAbs -eq $commonDirAbs) {
  [Console]::Error.WriteLine(@"
hook-require-worktree: 実装成果物の編集はメインツリーでは禁止されています。
  対象ファイル: $filePaths
  ルール: FE/BE/INFRA/CICD は実装着手前に git worktree を作成し、その中で編集してください。
  例:
    git worktree add ../cc-agent-harness-wt-task-001 -b claude/impl-task-001
    cd ../cc-agent-harness-wt-task-001
  詳細: CLAUDE.md の "Worktree 必須ルール" を参照。
"@)
  exit 2
}

exit 0
