#!/usr/bin/env bash
# Commit staged changes và push lên remote, có pull --rebase + retry khi race push.
# Dùng chung với GitHub Actions (tránh lỗi "rejected: fetch first").
# Cách gọi: bash scripts/git-commit-staged-push-retry.sh "commit message" [remote] [branch]
set -eu
# pipefail không có trên /bin/sh; bật nếu shell hỗ trợ
set -o pipefail 2>/dev/null || true

MSG="${1:?commit message required}"
REMOTE="${2:-origin}"
BRANCH="${3:-main}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if git diff --staged --quiet; then
  exit 0
fi

git commit -m "$MSG"
STASH_BEFORE=$(git stash list | wc -l)
git stash push -m "workflow-temp-push-retry" || true
for i in 1 2 3 4 5; do
  bash "$ROOT/scripts/git-pull-rebase-prefer-public.sh" "$REMOTE" "$BRANCH"
  STASH_AFTER=$(git stash list | wc -l)
  if [ "$STASH_AFTER" -gt "$STASH_BEFORE" ]; then
    bash "$ROOT/scripts/git-stash-pop-prefer-public.sh"
  fi
  if [ "${GIT_COMMIT_PUSH_RETRY_CHECK_PUBLIC:-}" = "1" ]; then
    npm run check-public
  fi
  if git push; then
    exit 0
  fi
  if [ "$i" -eq 5 ]; then
    echo "::error::git push failed after 5 attempts"
    exit 1
  fi
  sleep 2
done
