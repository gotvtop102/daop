/**
 * Đồng bộ thư mục pubjs-output (shard/slug.json) → repo pjs102 tại {PUBJS_PATH_PREFIX}/...
 * Token: IMAGES_TOKEN | GITHUB_IMAGES_TOKEN | GITHUB_TOKEN | GH_PAT (chung với push ảnh)
 * Sau push: chạy refresh-pubjs-jsdelivr-after-push.js với SHA HEAD remote.
 */
import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { getPubjsOutputDir, getPubjsPathPrefix } from './lib/pubjs-url.js';

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
    (t.includes('rejected') && (t.includes('fetch first') || t.includes('non-fast-forward'))) ||
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
            'Không push được lên repo pubjs (pjs102) do thiếu quyền.',
            '- PAT cần Contents: Read and write cho PUBJS_REPO.',
            '- Đặt IMAGES_TOKEN hoặc GH_PAT / GITHUB_TOKEN có quyền ghi PUBJS_REPO.',
            '',
            msg.slice(0, 800),
          ].join('\n')
        );
      }
      if (!isNonFastForwardError(msg) || i === maxAttempts) throw e;
      console.log(`git push pubjs bị reject — retry ${i}/${maxAttempts}...`);
      sh(`git fetch origin "${branch}" --depth 50`, cloneDir, { inherit: true });
      try {
        sh(`git rebase "origin/${branch}"`, cloneDir, { inherit: true });
      } catch (rebaseErr) {
        try {
          sh('git rebase --abort', cloneDir, { inherit: true });
        } catch {}
        throw rebaseErr;
      }
    }
  }
}

async function main() {
  const repo = String(process.env.PUBJS_REPO || '').trim();
  const token = String(
    process.env.IMAGES_TOKEN ||
      process.env.GITHUB_IMAGES_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_PAT ||
      ''
  ).trim();
  const branch = String(process.env.PUBJS_BRANCH || 'main').trim();
  const prefix = getPubjsPathPrefix();

  if (!repo || !token) {
    throw new Error('Thiếu PUBJS_REPO hoặc token (IMAGES_TOKEN | GITHUB_TOKEN | GH_PAT)');
  }

  const pubjsRoot = getPubjsOutputDir();
  if (!(await fs.pathExists(pubjsRoot))) {
    console.log('push-pubjs-to-data-repo: không có thư mục pubjs-output — bỏ qua.');
    return;
  }

  const shardDirs = (await fs.readdir(pubjsRoot, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  let hasJson = false;
  for (const sd of shardDirs) {
    const p = path.join(pubjsRoot, sd);
    const files = await fs.readdir(p).catch(() => []);
    if (files.some((f) => f.endsWith('.json'))) {
      hasJson = true;
      break;
    }
  }
  if (!hasJson) {
    console.log('push-pubjs-to-data-repo: pubjs-output không có file .json — bỏ qua.');
    return;
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daop-pubjs-sync-'));
  const cloneDir = path.join(tmp, 'data');
  const authed = `https://x-access-token:${token}@github.com/${repo}.git`;

  try {
    let cloned = false;
    try {
      sh(`git clone --depth 1 --branch "${branch}" "${authed}" "${cloneDir}"`, tmp);
      cloned = true;
    } catch {
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

    const destRoot = path.join(cloneDir, prefix);
    await fs.ensureDir(destRoot);
    for (const sd of shardDirs) {
      const from = path.join(pubjsRoot, sd);
      const to = path.join(destRoot, sd);
      const stat = await fs.stat(from).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;
      await fs.copy(from, to, { overwrite: true });
    }

    const gitkeep = path.join(destRoot, '.gitkeep');
    if (!(await fs.pathExists(gitkeep))) {
      await fs.writeFile(gitkeep, '\n', 'utf8');
    }

    sh('git config user.email "actions@github.com"', cloneDir);
    sh('git config user.name "github-actions"', cloneDir);
    sh(`git add "${prefix}"`, cloneDir);
    try {
      sh(`git commit -m "chore: sync pubjs from ${path.basename(ROOT)}"`, cloneDir);
    } catch {
      console.log('push-pubjs-to-data-repo: không có thay đổi trên repo đích.');
      return;
    }
    pushWithRebaseRetry({ cloneDir, branch, maxAttempts: 5 });

    const { out: shaOut } = sh('git rev-parse HEAD', cloneDir, { inherit: false });
    const sha = String(shaOut || '').trim();
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
      throw new Error('Không đọc được SHA sau push pubjs.');
    }

    process.env.PUBJS_REPO_COMMIT = sha.toLowerCase();
    sh(`node "${path.join(ROOT, 'scripts', 'refresh-pubjs-jsdelivr-after-push.js')}"`, ROOT, { inherit: true });
    console.log('push-pubjs-to-data-repo: đã push', repo, branch, '→ SHA', sha);
  } finally {
    await fs.remove(tmp).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
