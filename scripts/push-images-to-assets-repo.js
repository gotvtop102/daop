/**
 * Đẩy public/thumbs và public/posters từ repo dự án → repo ảnh (bắt buộc IMAGES_REPO trên CI).
 * Sau push: refresh-image-jsdelivr-after-push — chỉ slug trong .pubjs-slugs-data-bumped.json nhận @commit cho ảnh.
 * Cần IMAGE_CDN_BASE trong env khi refresh. Chạy trên CI (Ubuntu) hoặc local có git.
 */
import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { ensurePublicFolderInRemoteRepo } from './lib/github-images-remote.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function sh(cmd, cwd = ROOT, { inherit = true } = {}) {
  try {
    if (inherit) {
      execSync(cmd, { stdio: 'inherit', encoding: 'utf8', cwd });
      return { ok: true, out: '' };
    }
    const out = execSync(cmd, { stdio: 'pipe', encoding: 'utf8', cwd });
    return { ok: true, out: String(out || '') };
  } catch (e) {
    const stderr = e?.stderr ? String(e.stderr) : '';
    const stdout = e?.stdout ? String(e.stdout) : '';
    const msg = [stdout, stderr].filter(Boolean).join('\n');
    const err = new Error(msg || String(e?.message || e));
    err.cause = e;
    throw err;
  }
}

function isAuthOrPermissionError(text) {
  const t = String(text || '').toLowerCase();
  return (
    t.includes('permission to') ||
    t.includes('access denied') ||
    t.includes('authentication failed') ||
    t.includes('could not read username') ||
    t.includes('fatal: unable to access') ||
    t.includes('http basic: access denied') ||
    t.includes('403')
  );
}

function isNonFastForwardError(text) {
  const t = String(text || '').toLowerCase();
  return (
    t.includes('rejected') && (t.includes('fetch first') || t.includes('non-fast-forward')) ||
    t.includes('failed to push some refs') ||
    t.includes('remote contains work that you do not have locally')
  );
}

function pushWithRebaseRetry({ cloneDir, branch, maxAttempts = 5 }) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      sh(`git push origin "HEAD:${branch}"`, cloneDir, { inherit: true });
      return;
    } catch (e) {
      const msg = String(e?.message || e);
      if (isAuthOrPermissionError(msg)) {
        throw new Error(
          [
            'Không push được lên repo ảnh do thiếu quyền (403/permission denied).',
            '- Hãy tạo PAT có quyền `Contents: Read and write` cho repo ảnh (IMAGES_REPO).',
            '- Lưu PAT vào GitHub Secret `IMAGES_TOKEN` ở repo dự án (KHÔNG dùng prefix GITHUB_*).',
            '',
            'Chi tiết lỗi:',
            msg.slice(0, 800),
          ].join('\n')
        );
      }
      if (!isNonFastForwardError(msg) || i === maxAttempts) {
        throw e;
      }
      console.log(`git push bị reject (fetch first) — retry ${i}/${maxAttempts}...`);
      sh(`git fetch origin "${branch}" --depth 50`, cloneDir, { inherit: true });
      try {
        // Ưu tiên giữ nội dung local (đang sync từ repo dự án).
        sh(`git rebase "origin/${branch}"`, cloneDir, { inherit: true });
      } catch (rebaseErr) {
        // Nếu conflict (hiếm), abort để tránh repo rơi vào trạng thái dở.
        try {
          sh('git rebase --abort', cloneDir, { inherit: true });
        } catch {}
        throw rebaseErr;
      }
      sh('git status', cloneDir, { inherit: true });
      // tiếp tục vòng lặp push lại
    }
  }
}

/** Có ít nhất một file .webp (đệ quy — ảnh thường ở thumbs|posters/{shard2}/*.webp). */
async function dirHasWebp(dir) {
  if (!(await fs.pathExists(dir))) return false;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (await dirHasWebp(p)) return true;
    } else if (e.isFile() && /\.webp$/i.test(e.name)) {
      return true;
    }
  }
  return false;
}

async function main() {
  const repo = String(process.env.IMAGES_REPO || process.env.GITHUB_IMAGES_REPO || '').trim();
  const token = String(
    process.env.IMAGES_TOKEN ||
      process.env.GITHUB_IMAGES_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_PAT ||
      ''
  ).trim();
  const branch = String(
    process.env.IMAGES_BRANCH ||
      process.env.GITHUB_IMAGES_BRANCH ||
      process.env.GITHUB_BRANCH ||
      'main'
  ).trim();
  if (!repo || !token) {
    throw new Error(
      'Thiếu IMAGES_REPO (hoặc GITHUB_IMAGES_REPO local) hoặc token (IMAGES_TOKEN | GITHUB_TOKEN | GH_PAT)'
    );
  }

  const srcThumbs = path.join(ROOT, 'public', 'thumbs');
  const srcPosters = path.join(ROOT, 'public', 'posters');
  const hasThumbs = await dirHasWebp(srcThumbs);
  const hasPosters = await dirHasWebp(srcPosters);
  if (!hasThumbs && !hasPosters) {
    console.log(
      'push-images-to-assets-repo: không có file .webp (kể cả trong thư mục con shard) trong public/thumbs|posters — bỏ qua.'
    );
    return;
  }
  console.log(
    `push-images-to-assets-repo: phát hiện ảnh — thumbs=${hasThumbs} posters=${hasPosters} → clone & push ${repo}`
  );

  await ensurePublicFolderInRemoteRepo(repo, branch, token);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daop-img-sync-'));
  const cloneDir = path.join(tmp, 'assets');
  const authed = `https://x-access-token:${token}@github.com/${repo}.git`;

  try {
    let cloned = false;
    try {
      sh(`git clone --depth 1 --branch "${branch}" "${authed}" "${cloneDir}"`, tmp);
      cloned = true;
    } catch {
      console.log('Clone theo nhánh thất bại, thử clone mặc định…');
      try {
        sh(`git clone --depth 1 "${authed}" "${cloneDir}"`, tmp);
        cloned = true;
      } catch {
        cloned = false;
      }
    }

    if (!cloned) {
      await fs.ensureDir(cloneDir);
      sh('git init', cloneDir);
      sh(`git remote add origin "${authed}"`, cloneDir);
      try {
        sh(`git fetch origin "${branch}" --depth 1`, cloneDir);
        sh(`git checkout -B "${branch}" FETCH_HEAD`, cloneDir);
      } catch {
        sh(`git checkout --orphan "${branch}"`, cloneDir);
      }
    } else {
      try {
        sh(`git checkout "${branch}"`, cloneDir);
      } catch {
        sh(`git checkout -B "${branch}"`, cloneDir);
      }
    }

    await fs.ensureDir(path.join(cloneDir, 'public', 'thumbs'));
    await fs.ensureDir(path.join(cloneDir, 'public', 'posters'));

    if (await fs.pathExists(srcThumbs)) {
      await fs.copy(srcThumbs, path.join(cloneDir, 'public', 'thumbs'), { overwrite: true });
    }
    if (await fs.pathExists(srcPosters)) {
      await fs.copy(srcPosters, path.join(cloneDir, 'public', 'posters'), { overwrite: true });
    }

    const gitkeep = path.join(cloneDir, 'public', '.gitkeep');
    if (!(await fs.pathExists(gitkeep))) {
      await fs.writeFile(gitkeep, '\n', 'utf8');
    }

    sh('git config user.email "actions@github.com"', cloneDir);
    sh('git config user.name "github-actions"', cloneDir);
    sh('git add public', cloneDir);
    try {
      sh(`git commit -m "chore: sync thumbs/posters from ${path.basename(ROOT)}"`, cloneDir);
    } catch {
      console.log('Không có thay đổi để commit trên repo ảnh.');
      return;
    }
    pushWithRebaseRetry({ cloneDir, branch, maxAttempts: 5 });
    console.log('Đã push ảnh lên repo:', repo, 'nhánh:', branch);

    const { out: shaOut } = sh('git rev-parse HEAD', cloneDir, { inherit: false });
    const shaRaw = String(shaOut || '').trim().toLowerCase();
    if (/^[0-9a-f]{7,40}$/.test(shaRaw)) {
      process.env.IMAGE_REPO_COMMIT = shaRaw;
      sh(`node "${path.join(ROOT, 'scripts', 'refresh-image-jsdelivr-after-push.js')}"`, ROOT, {
        inherit: true,
      });
    } else {
      console.warn('push-images-to-assets-repo: không đọc được SHA sau push — bỏ qua refresh URL ảnh.');
    }
  } finally {
    await fs.remove(tmp).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
