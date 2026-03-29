/**
 * Đẩy public/thumbs và public/posters từ repo dự án → repo ảnh (bắt buộc IMAGES_REPO trên CI).
 * Tự tạo public/ + .gitkeep nếu repo ảnh trống. Chạy trên CI (Ubuntu) hoặc local có git.
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

function sh(cmd, cwd = ROOT) {
  execSync(cmd, { stdio: 'inherit', encoding: 'utf8', cwd });
}

async function dirHasWebp(dir) {
  if (!(await fs.pathExists(dir))) return false;
  const files = await fs.readdir(dir);
  return files.some((f) => /\.webp$/i.test(f));
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
    console.log('push-images-to-assets-repo: không có file ảnh (.webp) trong public/thumbs|posters — bỏ qua.');
    return;
  }

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
    sh(`git push origin "HEAD:${branch}"`, cloneDir);
    console.log('Đã push ảnh lên repo:', repo, 'nhánh:', branch);
  } finally {
    await fs.remove(tmp).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
