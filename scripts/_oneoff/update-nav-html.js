/**
 * One-off: replace old nav with new nav (site-nav-main + site-nav-actions) in all HTML files.
 * Run: node scripts/_oneoff/update-nav-html.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', '..', 'public');

const subdirOld = '<nav class="site-nav"><a href="../phim-bo.html">Phim bộ</a><a href="../phim-le.html">Phim lẻ</a><a href="../tim-kiem.html">Tìm kiếm</a><a href="../the-loai/">Thể loại</a><a href="../quoc-gia/">Quốc gia</a><a href="../chu-de/">Chủ đề</a></nav>';
const subdirNew = '<nav class="site-nav"><div class="site-nav-main"><a href="../phim-bo.html">Phim bộ</a><a href="../phim-le.html">Phim lẻ</a><a href="../the-loai/">Thể loại</a><a href="../quoc-gia/">Quốc gia</a><a href="../chu-de/">Chủ đề</a><a href="../dien-vien/">Diễn viên</a><a href="../hoat-hinh.html">Hoạt hình</a><a href="../shows.html">TV Shows</a><a href="../gioi-thieu.html">Giới thiệu</a><a href="../donate.html">Donate</a></div><div class="site-nav-actions"><a href="../tim-kiem.html">Tìm kiếm</a><a href="../login.html">Đăng nhập</a></div></nav>';

function walk(dir) {
  const results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const name of list) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full).forEach((f) => results.push(path.join(name, f)));
      } else if (name.endsWith('.html')) {
        results.push(path.relative(publicDir, full));
      }
    }
  } catch {}
  return results;
}

const files = walk(publicDir);
let count = 0;
for (const rel of files) {
  const full = path.join(publicDir, rel);
  let content = fs.readFileSync(full, 'utf8');
  if (content.includes(subdirOld)) {
    content = content.replace(subdirOld, subdirNew);
    fs.writeFileSync(full, content, 'utf8');
    count++;
    console.log('Updated:', rel);
  }
}
console.log('Done. Updated', count, 'files.');
