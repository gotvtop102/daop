# Vercel — tất cả thứ cần tạo & chú thích

**Mục lục tổng:** [../README.md](../README.md).

Một **project Vercel** cho DAOP gồm hai phần cùng repo:

- **Frontend:** Admin React/Vite (build ra `admin/dist`, SPA).
- **Backend (serverless):** thư mục **`api/`** ở root → các route `/api/*`.

Vì `api/` nằm ở **root** repo, khi import project trên Vercel phải để **Root Directory trống** (hoặc `.`). Chi tiết triển khai: [../TRIEN-KHAI.md](../TRIEN-KHAI.md) (Bước 5). Checklist biến môi trường dạng copy: [../env/vercel.env.example](../env/vercel.env.example). Gỡ lỗi build: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

## 1. Việc tạo trên Vercel (Dashboard)

| Bước | Việc làm | Chú thích |
|------|----------|-----------|
| 1 | Đăng ký / đăng nhập [vercel.com](https://vercel.com), kết nối tài khoản **GitHub** | Cần quyền đọc repo chứa DAOP. |
| 2 | **Add New → Project** → **Import** repo DAOP | Chọn đúng repository. |
| 3 | **Root Directory** | **Để trống** (không chọn `admin`). Nếu chỉ root = `admin` thì **mất** toàn bộ `/api/*`. |
| 4 | **Framework / Build** | Repo có **`vercel.json`** ở root: install `npm install && cd admin && npm install`, build `cd admin && npm run build`, output `admin/dist`. Không override trong Dashboard trừ khi biết rõ. |
| 5 | **Environment Variables** | Thêm theo mục 3 (ít nhất Supabase Admin `VITE_*` + GitHub trigger). |
| 6 | **Deploy** | Sau deploy: URL dạng `https://<project>.vercel.app` — vừa là Admin vừa là host của API. |
| 7 | (Tùy chọn) **Domains** | Gắn subdomain (vd. `admin.example.com`), HTTPS do Vercel quản lý. |

**Preview vs Production:** Có thể bật cùng bộ biến cho Preview (PR) hoặc chỉ Production — tùy team.

---

## 2. `vercel.json` trong repo (đã có sẵn)

| Trường | Ý nghĩa |
|--------|---------|
| `installCommand` | Cài dependency **root** (Cho `@vercel/node` và meta) và **`admin/`** (Vite). |
| `buildCommand` | `npm run build` trong `admin` → tạo `admin/dist`. |
| `outputDirectory` | SPA build output. |
| `rewrites` | Mọi path **không** bắt đầu bằng `api/` → `index.html` (history mode cho React Router). Các request `/api/*` **không** bị rewrite này chặn theo pattern. |

Không cần tạo thêm file trên Vercel; chỉ cần push `vercel.json` trong Git.

---

## 3. Biến môi trường (Environment Variables)

Thêm tại **Project → Settings → Environment Variables**.  
**Quy tắc:** Tiền tố **`VITE_`** được Vite **đưa vào bundle trình duyệt** — chỉ đặt URL/anon key public; **không** dùng `VITE_` cho `service_role`, secret R2, PAT GitHub.

### 3.1. Bắt buộc cho Admin (client — Vite)

| Biến | Ý nghĩa |
|------|---------|
| `VITE_SUPABASE_ADMIN_URL` | URL project **Supabase Admin** (Hosting). |
| `VITE_SUPABASE_ADMIN_ANON_KEY` | **Anon public key** của project Admin — đăng nhập Admin, đọc/ghi theo RLS. **Không** dùng `service_role` ở đây. |

### 3.2. Bắt buộc cho nút “Build website” & trigger Actions (server)

| Biến | Ý nghĩa |
|------|---------|
| `GITHUB_TOKEN` | **Personal Access Token** (GitHub classic) với quyền **repo** (và workflow nếu cần). Dùng gọi GitHub API kích hoạt `repository_dispatch` / workflow. |
| `GITHUB_REPO` | Chuỗi `owner/repo` trùng repository có workflow **build-on-demand**. |

**Lưu ý:** `GITHUB_TOKEN` trong **GitHub Actions** là token mặc định của runner — **khác** token bạn đặt trên Vercel. Admin bấm Build → request tới **Vercel** → serverless đọc **env Vercel**.

### 3.3. Tùy chọn — GitHub (server)

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `GITHUB_REF` | `main` | Nhánh truyền khi trigger workflow (nếu API hỗ trợ). |

### 3.4. Tùy chọn — Supabase **User** (server, `/api/supabase-user`)

| Biến | Khi nào cần |
|------|-------------|
| `SUPABASE_USER_URL` | Dùng trang **Supabase Tools** import/export bảng user (`profiles`, `favorites`, …). |
| `SUPABASE_USER_SERVICE_ROLE_KEY` | **Service role** project **User** — chỉ trên server, bypass RLS cho thao tác bulk. **Không** đặt tiền tố `VITE_`. |

Không cần trên Vercel nếu không dùng API này.

### 3.5. Bắt buộc cho `/api/movies` — Supabase Admin (server)

| Biến | Ý nghĩa |
|------|---------|
| `SUPABASE_ADMIN_URL` hoặc fallback `VITE_SUPABASE_ADMIN_URL` | URL project Supabase (Admin). |
| `SUPABASE_ADMIN_SERVICE_ROLE_KEY` | **Service role** — chỉ trên server; **không** dùng anon key. |

Dùng khi Dashboard / MovieList / MovieEdit / EpisodeEdit gọi `/api/movies`. Ảnh phim qua R2 vẫn cần nhóm biến R2 ở mục dưới.

### 3.6. Tùy chọn — R2 + upload ảnh (server)

| Biến | Ý nghĩa |
|------|---------|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Giống Cloudflare R2; dùng cho **`/api/upload-image`** và một số luồng trong **`/api/movies`**. |

Cần khi dùng **Upload R2** trên Banners, Slider, Site Settings, v.v.

### 3.7. Tùy chọn — Admin UI (Vite)

| Biến | Ý nghĩa |
|------|---------|
| `VITE_API_URL` | Chủ yếu **dev local**: Admin chạy `localhost` nhưng gọi API bản deploy. Production thường **để trống** — nhiều màn dùng `window.location.origin` hoặc URL tương đối `/api/...`. |
| `VITE_OPHIM_BASE_URL` | Trang GitHub Actions: base URL OPhim (mặc định trong code `https://ophim1.com/v1/api`). |
| `VITE_TMDB_API_KEY` | Trang sửa phim: gọi TMDB từ **trình duyệt**. Có thể nhiều key (phẩy). Tùy chọn `VITE_TMDB_API_KEYS`. **Khác** `TMDB_API_KEY` trên GitHub (build). |

---

## 4. Các route API serverless (`api/*.ts` → `/api/*`)

| File | Route | Vai trò |
|------|-------|---------|
| `trigger-build.ts` | `POST /api/trigger-build` | Kích hoạt workflow build (thiết kế đơn giản; thường gọi kèm `trigger-action`). |
| `trigger-action.ts` | `POST/GET /api/trigger-action` | Trigger linh hoạt nhiều workflow GitHub (build-on-demand, purge, …). |
| `github-runs.ts` | `GET /api/github-runs` | Đọc lịch sử run GitHub Actions cho UI. |
| `movies.ts` | `/api/movies` | CRUD/phụ trợ phim (Supabase), R2 — cần env Supabase Admin + R2 tương ứng. |
| `upload-image.ts` | `POST /api/upload-image` | Upload ảnh lên R2 (Admin). |
| `supabase-user.ts` | `POST /api/supabase-user` | Import/export dữ liệu user — cần `SUPABASE_USER_*`. |

Chỉ các biến mà từng file đọc mới **bắt buộc** khi bạn dùng đúng tính năng đó.

---

## 5. Bảng tổng hợp “tạo trên Vercel”

| STT | Việc | Ghi chú |
|-----|------|---------|
| 1 | Tài khoản + kết nối GitHub | — |
| 2 | Project import repo DAOP | Root **trống** |
| 3 | Deploy theo `vercel.json` | Không chỉnh sai Root/`admin` only |
| 4 | Thêm Environment Variables | Nhóm 3.1 + 3.2 tối thiểu |
| 5 | (Tùy chọn) Domain | admin subdomain |
| 6 | (Tùy chọn) Team / RBAC | Tổ chức lớn |

---

## 6. Liên kết nhanh

- File `.env` mẫu đầy đủ tên biến: [../env/vercel.env.example](../env/vercel.env.example)
- Secrets **GitHub** (build site), không nhầm với env Vercel: [../env/github.env.example](../env/github.env.example)
- Cloudflare (site tĩnh): [../cloudflare/README.md](../cloudflare/README.md)
- Supabase (User + Admin): [../supabase/README.md](../supabase/README.md)
- GitHub (repo, Secrets, `GITHUB_REPO`): [../github/README.md](../github/README.md)

---

## 7. Build lỗi trên Vercel

- **Install xong nhưng bước Build báo lỗi:** Mở **Deployments** → bấm deployment lỗi → xem **Building** log đầy đủ. Thường gặp:
  - Thiếu env: cần `VITE_SUPABASE_ADMIN_URL`, `VITE_SUPABASE_ADMIN_ANON_KEY` (nếu build Vite tham chiếu).
  - Lỗi TypeScript: chạy local `cd admin && npm run build` để xem lỗi tương tự.
  - Node version: Vercel mặc định Node 18; nếu cần 20, trong Dashboard → Settings → General → **Node.js Version** chọn 20.x.
- **"removed 2 packages"** hoặc **"added 198 packages"** khi install: bình thường. Tiếp theo log sẽ chạy `cd admin && npm install` rồi **Build**.
- **"1 high severity vulnerability"** (npm audit): Thường chỉ là **cảnh báo**, không tự làm fail build. Nếu build vẫn đỏ, lỗi thường nằm ở **bước Build** (dòng chữ đỏ), không phải ở dòng vulnerability.
  - Để giảm cảnh báo: trên máy chạy `npm audit` (ở root và trong `admin/`), rồi `npm audit fix` (hoặc `npm audit fix --force` cẩn thận), commit `package-lock.json` và push.
  - Cảnh báo **deprecated node-domexception**: đến từ dependency (vd. node-fetch), có thể bỏ qua hoặc cập nhật package khi có bản mới.
- Nếu bạn đã chỉnh **Build/Install/Output** trong Dashboard, có thể bỏ override để dùng **vercel.json** trong repo.
