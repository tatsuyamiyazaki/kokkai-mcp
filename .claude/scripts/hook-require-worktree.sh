#!/usr/bin/env bash
# PreToolUse hook: FE/BE/INFRA/CICD が実装成果物を書き込む際、
# 現在の作業ディレクトリが git worktree（メインツリー以外）であることを要求する。
#
# - 対象ツール: Write / Edit / NotebookEdit（matcher 側で絞る想定）
# - 対象パス: frontend/ backend/ infrastructure/ .github/workflows/ tests/
# - それ以外のパス（.agent-team/, docs/, .claude/, *.md 等）は素通し
#
# 判定方法:
#   git rev-parse --git-dir          -> worktree の場合 .git/worktrees/<name>
#   git rev-parse --git-common-dir   -> 常にメインツリーの .git
#   両者が異なれば worktree、同じならメインツリー。
#
# 違反時は exit 2 で Claude Code 側にブロック理由を返す。

set -u

# Claude Code は PreToolUse hook の入力を環境変数と stdin JSON の両方で渡す。
# ここでは CLAUDE_FILE_PATHS（空白区切り）と CLAUDE_TOOL_NAME を使用する。
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
FILE_PATHS="${CLAUDE_FILE_PATHS:-}"

# 対象ツール以外は即通過
case "$TOOL_NAME" in
  Write|Edit|NotebookEdit) ;;
  *) exit 0 ;;
esac

# ファイルパスが空なら（メタ操作）通過
[ -z "$FILE_PATHS" ] && exit 0

# 監視対象プレフィクス
is_guarded_path() {
  local p="$1"
  # 絶対パスをリポジトリルート相対に正規化
  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null)" || return 1
  case "$p" in
    /*) p="${p#$root/}" ;;
  esac
  case "$p" in
    frontend/*|backend/*|infrastructure/*|tests/*|.github/workflows/*) return 0 ;;
    *) return 1 ;;
  esac
}

needs_check=0
for f in $FILE_PATHS; do
  if is_guarded_path "$f"; then
    needs_check=1
    break
  fi
done

[ "$needs_check" -eq 0 ] && exit 0

# worktree 判定
gitdir="$(git rev-parse --git-dir 2>/dev/null || true)"
commondir="$(git rev-parse --git-common-dir 2>/dev/null || true)"

if [ -z "$gitdir" ] || [ -z "$commondir" ]; then
  echo "hook-require-worktree: git リポジトリ外のため実装ファイルの書き込みをブロックしました: $FILE_PATHS" 1>&2
  exit 2
fi

# 両方絶対パスに正規化して比較
abs() { (cd "$1" 2>/dev/null && pwd) || echo "$1"; }
gitdir_abs="$(abs "$gitdir")"
commondir_abs="$(abs "$commondir")"

if [ "$gitdir_abs" = "$commondir_abs" ]; then
  cat 1>&2 <<EOF
hook-require-worktree: 実装成果物の編集はメインツリーでは禁止されています。
  対象ファイル: $FILE_PATHS
  ルール: FE/BE/INFRA/CICD は実装着手前に git worktree を作成し、その中で編集してください。
  例:
    git worktree add ../cc-agent-harness-wt-task-001 -b claude/impl-task-001
    cd ../cc-agent-harness-wt-task-001
  詳細: CLAUDE.md の "Worktree 必須ルール" を参照。
EOF
  exit 2
fi

exit 0
