/** Ghi file vào repo qua GitHub Contents API (PAT cần quyền contents:write). */

/**
 * Chuẩn hóa owner/repo cho API (tránh 404 khi dán nhầm URL đầy đủ).
 * Hỗ trợ: owner/repo, https://github.com/owner/repo, git@github.com:owner/repo.git
 */
export function normalizeGithubRepo(raw: string): string {
  const s0 = String(raw || '').trim();
  if (!s0) return '';
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(s0);
  if (ssh) return `${ssh[1]}/${ssh[2].replace(/\.git$/i, '')}`;
  if (!/:\/\//.test(s0) && !/^git@/i.test(s0)) {
    const simple = s0.replace(/\.git$/i, '').replace(/^\/+/, '');
    if (/^[^/]+\/[^/]+$/.test(simple)) return simple;
  }
  try {
    const u = new URL(s0.includes('://') ? s0 : `https://${s0}`);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = parts[1].replace(/\.git$/i, '');
        if (owner && repo) return `${owner}/${repo}`;
      }
    }
  } catch {
    /* ignore */
  }
  return s0;
}

function encPath(p: string) {
  return String(p || '')
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');
}

export function getGithubRepoConfig() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = normalizeGithubRepo(process.env.GITHUB_REPO || '');
  const branch = (process.env.GITHUB_BRANCH || 'main').trim();
  return { token, repo, branch };
}

/** Repo chứa ảnh (public/thumbs, public/posters, …). Ưu tiên IMAGES_* (GitHub Actions secrets không được bắt đầu bằng GITHUB_). */
export function getGithubImagesRepoConfig() {
  const token = (
    process.env.IMAGES_TOKEN ||
    process.env.GITHUB_IMAGES_TOKEN ||
    process.env.GITHUB_TOKEN ||
    ''
  ).trim();
  const repo = normalizeGithubRepo(
    process.env.IMAGES_REPO ||
      process.env.GITHUB_IMAGES_REPO ||
      process.env.GITHUB_REPO ||
      ''
  );
  const branch = (
    process.env.IMAGES_BRANCH ||
    process.env.GITHUB_IMAGES_BRANCH ||
    process.env.GITHUB_BRANCH ||
    'main'
  ).trim();
  return { token, repo, branch };
}

/** Repo ảnh trống hoặc chưa có public/ → tạo public/.gitkeep. */
export async function ensurePublicFolderInRemoteRepo(repo: string, branch: string, token: string): Promise<void> {
  const filePath = 'public/.gitkeep';
  const sha = await githubGetFileSha(repo, filePath, branch, token);
  if (sha) return;

  const url = `https://api.github.com/repos/${repo}/contents/${encPath(filePath)}`;
  const body: Record<string, string> = {
    message: 'chore: init public/',
    content: Buffer.from('\n').toString('base64'),
    branch,
  };
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 404) {
      throw new Error(
        `GitHub 404 khi tạo public/ — repo "${repo}" không tồn tại, nhánh "${branch}" sai, hoặc token không có quyền ghi (Contents: Read/Write). ` +
          `Trên Vercel: đặt IMAGES_REPO=owner/repo (repo chứa ảnh, vd gotvtop102/goimg102), IMAGES_BRANCH khớp nhánh mặc định, IMAGES_TOKEN hoặc GITHUB_TOKEN có quyền trên đúng repo đó. ` +
          `Nếu chỉ có GITHUB_REPO=repo site mà ảnh cần lên repo khác → bắt buộc thêm IMAGES_REPO + token ghi được repo ảnh. Chi tiết: ${t.slice(0, 200)}`
      );
    }
    throw new Error(`init public/: HTTP ${r.status} ${t.slice(0, 300)}`);
  }
}

export async function githubGetFileSha(repo: string, filePath: string, branch: string, token: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${repo}/contents/${encPath(filePath)}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (r.status === 404) return null;
  if (!r.ok) return null;
  const j: any = await r.json().catch(() => null);
  if (!j || Array.isArray(j)) return null;
  return j.sha ? String(j.sha) : null;
}

export async function githubPutFileBase64(opts: {
  repo: string;
  path: string;
  branch: string;
  token: string;
  contentBase64: string;
  message: string;
}): Promise<void> {
  const { repo, path, branch, token, contentBase64, message } = opts;
  const sha = await githubGetFileSha(repo, path, branch, token);
  const url = `https://api.github.com/repos/${repo}/contents/${encPath(path)}`;
  const body: Record<string, string> = {
    message,
    content: contentBase64,
    branch,
  };
  if (sha) body.sha = sha;
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(
      `GitHub PUT ${r.status} (repo=${repo}, branch=${branch}, path=${path}): ${t.slice(0, 400)}`
    );
  }
}

export async function githubFetchTreeRecursive(repo: string, branch: string, token: string): Promise<{ path: string }[]> {
  const refUrl = `https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const refR = await fetch(refUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!refR.ok) throw new Error(`GitHub ref: HTTP ${refR.status}`);
  const refJ: any = await refR.json();
  const commitSha = refJ?.object?.sha;
  if (!commitSha) throw new Error('GitHub ref: missing commit sha');

  const commitUrl = `https://api.github.com/repos/${repo}/git/commits/${commitSha}`;
  const commitR = await fetch(commitUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!commitR.ok) throw new Error(`GitHub commit: HTTP ${commitR.status}`);
  const commitJ: any = await commitR.json();
  const treeSha = commitJ?.tree?.sha;
  if (!treeSha) throw new Error('GitHub commit: missing tree sha');

  const treeUrl = `https://api.github.com/repos/${repo}/git/trees/${treeSha}?recursive=1`;
  const treeR = await fetch(treeUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!treeR.ok) throw new Error(`GitHub tree: HTTP ${treeR.status}`);
  const treeJ: any = await treeR.json();
  const tree = Array.isArray(treeJ?.tree) ? treeJ.tree : [];
  return tree.filter((x: any) => x && x.type === 'blob' && x.path).map((x: any) => ({ path: String(x.path) }));
}

