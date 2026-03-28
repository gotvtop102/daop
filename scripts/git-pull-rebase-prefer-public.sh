#!/usr/bin/env bash
# Pull --rebase; conflict trong public/* → giữ bản từ commit đang rebase (theirs).
# Conflict ngoài public/ → abort rebase, exit 1.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOLVE_MARKERS="$SCRIPT_DIR/git-resolve-conflict-markers-in-public.sh"

REMOTE="${1:-origin}"
BRANCH="${2:-main}"

pull_failed=0
git pull --rebase "$REMOTE" "$BRANCH" || pull_failed=1

if [ "$pull_failed" -eq 1 ]; then
  if [ ! -d .git/rebase-merge ] && [ ! -d .git/rebase-apply ]; then
    echo "::error::git pull --rebase $REMOTE $BRANCH thất bại (không vào trạng thái rebase)."
    exit 1
  fi
fi

ITER=0
while [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; do
  ITER=$((ITER + 1))
  if [ "$ITER" -gt 100 ]; then
    echo "::error::Rebase vòng lặp quá dài — abort."
    git rebase --abort || true
    exit 1
  fi
  UNMERGED=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
  if [ -z "$UNMERGED" ]; then
    GIT_EDITOR=true git rebase --continue || {
      if [ ! -d .git/rebase-merge ] && [ ! -d .git/rebase-apply ]; then
        exit 0
      fi
      continue
    }
    continue
  fi
  OUTSIDE=
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [[ "$f" == public/* ]]; then
      git checkout --theirs -- "$f"
      git add -- "$f"
    else
      OUTSIDE=1
      echo "::error::Conflict ngoài public/: $f"
    fi
  done <<< "$UNMERGED"
  if [ -n "$OUTSIDE" ]; then
    git rebase --abort || true
    exit 1
  fi
  bash "$RESOLVE_MARKERS" || exit 1
  GIT_EDITOR=true git rebase --continue || {
    if [ ! -d .git/rebase-merge ] && [ ! -d .git/rebase-apply ]; then
      exit 0
    fi
    continue
  }
done
