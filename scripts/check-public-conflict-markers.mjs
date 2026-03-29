/**
 * Thoát 1 nếu còn git conflict markers trong public/ (<<<<<<< hoặc >>>>>>>).
 * Chạy trước commit: npm run check-public
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'public');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const markerRe = /^<<<<<<< |^>>>>>>> /m;
const bad = [];
for (const f of walk(ROOT)) {
  let s;
  try {
    s = fs.readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  if (markerRe.test(s)) bad.push(path.relative(path.join(__dirname, '..'), f));
}

if (bad.length) {
  console.error('Còn conflict marker git trong public/:\n' + bad.join('\n'));
  console.error('Gợi ý: bash scripts/git-resolve-conflict-markers-in-public.sh (Linux/mac/Git Bash) hoặc sửa tay.');
  process.exit(1);
}
console.log('public/: không phát hiện conflict marker (<<<<<<< / >>>>>>>).');
