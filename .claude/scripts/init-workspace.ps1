# init-workspace.ps1 — プロジェクトワークスペースを冪等に初期化する

$dirs = @(
    ".agent-team\dispatch",
    ".agent-team\results",
    ".agent-team\tasks",
    ".agent-team\reviews",
    ".agent-team\reports",
    ".agent-team\knowledge\graph",
    ".agent-team\routing",
    "docs\architecture",
    "docs\design",
    "docs\design\wireframes",
    "docs\database",
    "docs\adr",
    "docs\api",
    "docs\operations"
)

foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    # .gitkeep で構造を git 管理下に置く
    $gitkeep = Join-Path $dir ".gitkeep"
    if (-not (Test-Path $gitkeep)) {
        New-Item -ItemType File -Path $gitkeep | Out-Null
    }
}

Write-Host "Workspace initialized."
