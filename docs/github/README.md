# GitHub — tất cả thứ cần tạo & chú thích

**Mục lục tổng:** [../README.md](../README.md).

GitHub đóng vai trò **lưu mã nguồn**, chạy **GitHub Actions** (build dữ liệu, deploy Cloudflare), và nhận **lệnh từ Vercel** (Admin bấm *Build website*). Không cần **Connect Git** trên Cloudflare Pages — deploy `public/` do Actions + API Cloudflare.

Checklist **Secrets / Variables** dạng copy: [../env/github.env.example](../env/github.env.example). Chi tiết triển khai: [../TRIEN-KHAI.md](../TRIEN-KHAI.md) (Bước 2–4). Hướng dẫn nhanh: [../BAT-DAU-NHANH.md](../BAT-DAU-NHANH.md) (Bước 2).

---

## 1. Tài khoản & repository

| Việc | Chú thích |
|------|-----------|
| Tạo tài khoản [github.com](https://github.com) | Có thể dùng tài khoản cá nhân hoặc tổ chức (**Organization**). |
| **New repository** | Đặt tên (vd. `daop-movie`), có thể public/private. **Không** cần README nếu push sẵn code local. |
| **Nhánh mặc định `main`** | Workflow DAOP gắn với nhánh **`main`** (deploy, trigger). Đổi tên nhánh cũ nếu cần: `git branch -M main`. |
| **Push toàn bộ repo** | `git remote add origin …` → `git push -u origin main`. |

**Repo trên GitHub = `GITHUB_REPO`** trong Vercel: chuỗi `owner/repo` (vd. `ten-ban/daop-movie`), trùng repo chứa workflow **Build on demand**.

---

## 2. Cài đặt repo liên quantới Actions

Vào **Settings** của repository:

### 2.1. Actions — bật và quyền

| Mục | Gợi ý |
|-----|--------|
| **Settings → Actions → General** | Chọn *Allow all actions* (hoặc theo policy công ty). |
| **Workflow permissions** | Nhiều job cần **Read and write** (commit/push `public/data`). Nếu chỉ *Read repository contents*, bước push từ workflow có thể lỗi — khi đó dùng **`GH_PAT`** (mục 3). |

### 2.2. Secrets và Variables

**Settings → Secrets and variables → Actions**

| Tab | Dùng cho |
|-----|----------|
| **Secrets** | Giá trị nhạy cảm (token, API key, JSON service account). Không hiện log sau khi lưu. |
| **Variables** | Giá trị không bí mật (tên project Pages, số trang OPhim, cờ two-phase). |

Danh sách tên biến đầy đủ + ghi chú: [../env/github.env.example](../env/github.env.example).

### 2.3. Collaborators / Team

Ai có quyền **push `main`** sẽ kích hoạt **Deploy to Cloudflare Pages** (theo `deploy.yml`). Hạn chế quyền nếu cần kiểm soát production.

---

## 3. `GITHUB_TOKEN` và `GH_PAT`

| Khái niệm | Giải thích |
|-----------|------------|
| **`GITHUB_TOKEN`** | Token **mặc định** do Actions inject vào mỗi workflow. Quyền phụ thuộc **Workflow permissions** (mục 2.1). Đủ với nhiều repo nếu bật *Read and write*. |
| **`GH_PAT`** | **Personal Access Token** (Classic) của user, thêm vào **Secrets** tên `GH_PAT`. Workflow thường dùng `secrets.GH_PAT \|\| secrets.GITHUB_TOKEN` cho checkout/commit/push. Dùng khi token mặc định **không đủ quyền** hoặc push bị từ chối. Tạo: **GitHub → Settings (profile) → Developer settings → Personal access tokens** — scope **`repo`**, thêm **`workflow`** nếu cần trigger/kỹ năng khác. |

**Lưu ý:** **`GITHUB_TOKEN` trên Vercel** là PAT khác, do **bạn tạo** và dán vào Vercel — dùng để **gọi API GitHub** từ Admin (`repository_dispatch`), **không** phải secret `GITHUB_TOKEN` trong tab Secrets của repo.

---

## 4. Các workflow (`.github/workflows/`)

| File / tên hiển thị | Kích hoạt | Vai trò |
|---------------------|-----------|---------|
| **deploy.yml** — *Deploy to Cloudflare Pages* | Push `main`; hoặc sau khi *Build on demand* / *Update data daily* thành công | Đẩy thư mục **`public/`** lên Cloudflare Pages (Wrangler). |
| **build-on-demand.yml** — *Build on demand* | `workflow_dispatch`; **`repository_dispatch`** (từ Vercel Admin) | Build (incremental/full/two_phase…), có thể sync ảnh lên repo CDN; commit `public/data` rồi push. |
| **update-data.yml** — *Update data daily* | Cron (UTC) + `workflow_dispatch` | Build theo lịch; có nhánh two-phase tùy cấu hình; deploy tùy job. |
| **core-then-tmdb.yml** — *Core then TMDB* | `workflow_dispatch` | Luồng 2 pha (core → TMDB) + deploy. |
| **purge-movie-data.yml** — *Purge movie data* | `workflow_dispatch` | Xóa/gom dữ liệu phim trong `public/data` (thao tác nguy hiểm — đọc kỹ workflow). |
| **export-to-supabase.yml** — *Export to Supabase* | `workflow_dispatch`; **`repository_dispatch`** (`export-to-supabase`) | Chạy `npm run export-to-supabase`: đẩy `public/data/batches` → bảng `movies` / `movie_episodes` (Secrets: Supabase Admin). |
| **upload-movie-images-repo.yml**, **delete-movie-images-repo.yml**, **upload-images-from-urls.yml** | `workflow_dispatch` (hoặc theo từng file) | Ảnh trong `public/` + jsDelivr. |

Tên workflow trong **`workflow_run`** của `deploy.yml` phải **khớp** `name:` trong file YAML (vd. *Build on demand*, *Update data daily*).

Chi tiết ngắn + webhook Admin: [../github-actions/README.md](../github-actions/README.md).

---

## 5. Mối liên hệ với Vercel và Cloudflare

| Luồng | Mô tả |
|-------|--------|
| **Admin → GitHub** | Vercel `POST` GitHub API (`repository_dispatch` / dispatches) với **`GITHUB_TOKEN` + `GITHUB_REPO`** (env **Vercel**, không lấy từ tab Secrets repo). |
| **GitHub → Cloudflare** | Job deploy dùng **`CLOUDFLARE_API_TOKEN`** + **`CLOUDFLARE_ACCOUNT_ID`** (Secrets repo). |
| **GitHub → Supabase** | Build đọc **Supabase Admin** qua **`SUPABASE_ADMIN_URL`** + **`SUPABASE_ADMIN_SERVICE_ROLE_KEY`**. |

---

## 6. Bảng tổng hợp “tạo trên GitHub”

| STT | Việc |
|-----|------|
| 1 | Tài khoản GitHub |
| 2 | Repository chứa code DAOP, nhánh **`main`** |
| 3 | Bật **Actions**, cấu hình **workflow permissions** (read/write nếu cần push từ bot) |
| 4 | Thêm **Secrets** (và **Variables**) — checklist [../env/github.env.example](../env/github.env.example) |
| 5 | (Tùy chọn) **`GH_PAT`** nếu push/commit từ workflow lỗi quyền |
| 6 | Trên **Vercel**: `GITHUB_REPO` + PAT riêng để trigger workflow |
| 7 | (Tùy chọn) Rules / branch protection cho `main` |

---

## 7. Liên kết nhanh

- Secrets/Variables mẫu: [../env/github.env.example](../env/github.env.example)
- Build & trigger: [../github-actions/README.md](../github-actions/README.md)
- Vercel (PAT + `GITHUB_REPO`): [../vercel/README.md](../vercel/README.md)
- Cloudflare (deploy đích): [../cloudflare/README.md](../cloudflare/README.md)
- Supabase Admin (secret build): [../supabase/README.md](../supabase/README.md)
