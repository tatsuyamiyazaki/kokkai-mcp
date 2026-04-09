#!/usr/bin/env bash
# init-workspace.sh — プロジェクトワークスペースを冪等に初期化する
set -euo pipefail

mkdir -p .agent-team/{dispatch,results,tasks,reviews,reports,knowledge/graph,routing}
mkdir -p docs/{architecture,design,design/wireframes,database,adr,api,operations}

# .gitkeep で構造をgit管理下に置く
find .agent-team docs -type d | while read -r dir; do
  touch "$dir/.gitkeep"
done

echo "Workspace initialized."
