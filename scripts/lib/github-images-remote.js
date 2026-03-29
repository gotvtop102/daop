/**
 * Gọi GitHub API từ script Node (repo ảnh tách khỏi repo dự án).
 */
function encPath(p) {
  return String(p || '')
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');
}

export function getImagesRepoEnv() {
  const token = String(
    process.env.IMAGES_TOKEN ||
      process.env.GITHUB_IMAGES_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_PAT ||
      ''
  ).trim();
  const repo = String(
    process.env.IMAGES_REPO || process.env.GITHUB_IMAGES_REPO || process.env.GITHUB_REPO || ''
  ).trim();
  const branch = String(
    process.env.IMAGES_BRANCH ||
      process.env.GITHUB_IMAGES_BRANCH ||
      process.env.GITHUB_BRANCH ||
      'main'
  ).trim();
  return { token, repo, branch };
}

export async function githubApiGetJson(url, token) {
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const text = await r.text();
  let j = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = null;
  }
  return { ok: r.ok, status: r.status, json: j, text };
}

export async function githubGetFileSha(repo, filePath, branch, token) {
  const url = `https://api.github.com/repos/${repo}/contents/${encPath(filePath)}?ref=${encodeURIComponent(branch)}`;
  const { ok, json } = await githubApiGetJson(url, token);
  if (!ok || !json || Array.isArray(json) || !json.sha) return null;
  return String(json.sha);
}

/** Repo ảnh trống hoặc chưa có public/ → tạo public/.gitkeep (commit đầu hoặc bổ sung). */
export async function ensurePublicFolderInRemoteRepo(repo, branch, token) {
  const filePath = 'public/.gitkeep';
  const sha = await githubGetFileSha(repo, filePath, branch, token);
  if (sha) return;

  const url = `https://api.github.com/repos/${repo}/contents/${encPath(filePath)}`;
  const body = {
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
      console.warn('ensurePublicFolderInRemoteRepo: không PUT được (repo/nhánh trống?) — bước git sync sẽ tạo public/.');
      return;
    }
    throw new Error(`init public/: HTTP ${r.status} ${t.slice(0, 300)}`);
  }
}

export async function githubListAllBlobPaths(repo, branch, token) {
  const refUrl = `https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const refR = await githubApiGetJson(refUrl, token);
  if (!refR.ok) throw new Error(`GitHub ref: HTTP ${refR.status}`);
  const commitSha = refR.json?.object?.sha;
  if (!commitSha) throw new Error('GitHub ref: missing commit sha');

  const commitUrl = `https://api.github.com/repos/${repo}/git/commits/${commitSha}`;
  const commitR = await githubApiGetJson(commitUrl, token);
  if (!commitR.ok) throw new Error(`GitHub commit: HTTP ${commitR.status}`);
  const treeSha = commitR.json?.tree?.sha;
  if (!treeSha) throw new Error('GitHub commit: missing tree sha');

  const treeUrl = `https://api.github.com/repos/${repo}/git/trees/${treeSha}?recursive=1`;
  const treeR = await githubApiGetJson(treeUrl, token);
  if (!treeR.ok) throw new Error(`GitHub tree: HTTP ${treeR.status}`);
  const tree = Array.isArray(treeR.json?.tree) ? treeR.json.tree : [];
  return tree
    .filter((x) => x && x.type === 'blob' && x.path)
    .map((x) => String(x.path).replace(/\\/g, '/'));
}

export async function githubDeleteFile(repo, filePath, branch, token, message) {
  const sha = await githubGetFileSha(repo, filePath, branch, token);
  if (!sha) return { deleted: false, reason: 'missing' };
  const url = `https://api.github.com/repos/${repo}/contents/${encPath(filePath)}`;
  const r = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: message || `delete ${filePath}`, sha, branch }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`DELETE ${filePath}: HTTP ${r.status} ${t.slice(0, 300)}`);
  }
  return { deleted: true };
}
