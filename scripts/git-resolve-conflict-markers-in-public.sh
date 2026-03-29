#!/usr/bin/env bash
# Quét public/, tìm conflict markers do git; sửa bằng cách giữ phần sau dòng =======
# (tương ứng bản "incoming" khi rebase commit build hoặc stash).
# Thất bại nếu sau khi sửa vẫn còn <<<<<<< hoặc >>>>>>>.
set -eu
set -o pipefail 2>/dev/null || true

if [ ! -d public ]; then
  exit 0
fi

fixed=0
fail=0

while IFS= read -r -d '' f; do
  [ ! -f "$f" ] && continue
  if ! grep -qI '^<<<<<<<' "$f" 2>/dev/null; then
    continue
  fi
  echo "::notice::Sửa conflict markers trong: $f"
  if ! perl -i -0777 -pe 's/^<<<<<<<[^\n]*\n[\s\S]*?^=======\s*\n//gm; s/^>>>>>>>[^\n]*\n//gm' -- "$f"; then
    echo "::error::Không xử lý được (perl): $f"
    fail=1
    continue
  fi
  if grep -qE '^<<<<<<<|^>>>>>>>' "$f" 2>/dev/null; then
    echo "::error::Vẫn còn marker conflict: $f"
    fail=1
    continue
  fi
  git add -- "$f" 2>/dev/null || true
  fixed=$((fixed + 1))
done < <(find public -type f -print0 2>/dev/null)

if [ "$fail" -ne 0 ]; then
  exit 1
fi
if [ "$fixed" -gt 0 ]; then
  echo "::notice::Đã gỡ marker conflict trong $fixed file (public/)"
fi
exit 0
