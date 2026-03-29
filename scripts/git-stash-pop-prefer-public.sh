#!/usr/bin/env bash
# Sau git stash pop lỗi do conflict: với file public/* lấy nội dung từ stash, còn lại báo lỗi.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOLVE_MARKERS="$SCRIPT_DIR/git-resolve-conflict-markers-in-public.sh"

if git stash pop; then
  exit 0
fi

UNMERGED=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
if [ -z "$UNMERGED" ]; then
  echo "::error::git stash pop thất bại (không phải conflict có thể tự xử lý)."
  exit 1
fi

OUTSIDE=
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if [[ "$f" == public/* ]]; then
    git checkout stash -- "$f"
    git add -- "$f"
  else
    OUTSIDE=1
    echo "::error::Stash pop conflict ngoài public/: $f"
  fi
done <<< "$UNMERGED"

if [ -n "$OUTSIDE" ]; then
  exit 1
fi

bash "$RESOLVE_MARKERS" || exit 1

git stash drop
