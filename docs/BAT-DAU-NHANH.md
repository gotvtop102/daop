# Cài đặt DAOP cho người mới (đã có mã nguồn)

**Mục lục toàn bộ tài liệu:** [docs/README.md](./README.md).

Làm **lần lượt Bước 1 → 5**. Chi tiết sâu: [TRIEN-KHAI.md](./TRIEN-KHAI.md). Chạy web/Admin trên máy: [README gốc](../README.md).

---

## Bước 1 — Tài khoản cần có và key / API cần lấy

Đăng ký (miễn phí có hạn) và **chỉ lưu key trong Secrets / .env**, không đưa vào tài liệu hay commit.

| Dịch vụ | Việc cần làm | Key hoặc thông tin cần copy | Dùng ở đâu |
|---------|----------------|-----------------------------|------------|
| **GitHub** | Tạo tài khoản, tạo repository mới | URL repo dạng `ten-ban/ten-repo` | Vercel, secret `GITHUB_REPO` |
| **TMDB** | [Settings → API](https://www.themoviedb.org/settings/api) | `TMDB_API_KEY` | GitHub Actions (build dữ liệu) |
| **Supabase** | Hai project riêng (xem Bước 3) | **User:** URL + **anon**; **Admin:** URL + **anon** + **service_role** | Admin Panel (User), Vercel (Admin anon), GitHub Secrets (Admin URL + service_role) |
| **Cloudflare** | Tài khoản Cloudflare | **Account ID**; **API Token** (quyền deploy Pages) | GitHub Secrets |
| **Vercel** | Tài khoản, kết nối GitHub | Tạo **Personal Access Token** (classic) trên GitHub với quyền **repo** | Biến môi trường Vercel `GITHUB_TOKEN` (nút “Build website” trong Admin) |

**Tùy chọn (khi bật tính năng):**

| Tính năng | Cần thêm |
|-----------|----------|
| Ảnh trên **R2** | Access key, secret, bucket, public URL → GitHub Secrets (xem [r2/README.md](./r2/README.md)) |
| **Phim custom (Supabase)** | Bảng `movies` / `movie_episodes` — xem [supabase/schema-movies-episodes.sql](./supabase/schema-movies-episodes.sql) |
| **Bình luận** nội bộ | D1, KV, `SUPABASE_JWT_SECRET` (xem [comments/README.md](./comments/README.md)) |

---

## Bước 2 — Tạo repo GitHub và cấu hình

**Hướng dẫn gom** (Actions, quyền, PAT, danh sách workflow): [github/README.md](./github/README.md).

1. Tạo repo trống trên GitHub, đẩy toàn bộ code dự án lên nhánh **`main`** (clone rồi push hoặc `git remote add` → `push`).
2. Vào **Settings → Secrets and variables → Actions → New repository secret**, thêm tối thiểu:

| Secret | Giá trị |
|--------|--------|
| `TMDB_API_KEY` | Key TMDB |
| `SUPABASE_ADMIN_URL` | URL project Supabase **Admin** (dạng `https://xxx.supabase.co`) |
| `SUPABASE_ADMIN_SERVICE_ROLE_KEY` | Key **service_role** của project Admin (không dùng anon ở đây) |
| `CLOUDFLARE_API_TOKEN` | Token sau khi làm Bước 5 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID Cloudflare |

Danh sách **đủ secret + variable** (R2, Supabase, `GH_PAT`, `OPHIM_BASE_URL`, …): [docs/env/github.env.example](./env/github.env.example).

3. **Variables → Actions** (tùy chọn): `CLOUDFLARE_PAGES_PROJECT_NAME` = tên project Pages bạn đặt ở Cloudflare (nếu khác mặc định trong file workflow).

Sau này, Actions sẽ: **build** dữ liệu (khi bạn chạy workflow) → **deploy** thư mục `public/` lên Pages. Không cần chạy gì trên PC nếu dùng hết Actions (vẫn có thể build local như README gốc).

---

## Bước 3 — Setup Supabase

**Hướng dẫn gom** (bảng key, từng project, file SQL phụ): [supabase/README.md](./supabase/README.md).

Cần **đúng hai project** (User và Admin) — không gộp một project.

### Project User (khách xem phim)

1. [supabase.com](https://supabase.com) → **New project**.
2. **SQL Editor** → dán và chạy toàn bộ **`docs/supabase/schema-user.sql`**.
3. **Authentication → Providers:** bật **Email** (Google nếu cần).
4. **Settings → API:** lưu **Project URL** và **anon public** → sau này dán trong **Admin → Cài đặt chung** (Supabase User).

### Project Admin (quản trị + cấu hình site)

1. Tạo project mới.
2. **SQL Editor** → chạy **`docs/supabase/schema-admin.sql`**.
3. **Authentication → Users:** tạo user (email + mật khẩu) dùng đăng nhập Admin.
4. **SQL Editor** — gán quyền admin (đổi email cho đúng user của bạn):

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
where email = 'email-cua-ban@example.com';
```

5. **Settings → API:** lưu **URL**, **anon** (cho Vercel), **service_role** (cho GitHub Secrets — không đưa lên trình duyệt).

Chi tiết / sửa RLS: [supabase/README.md](./supabase/README.md).

---

## Bước 4 — Setup Vercel (Admin + API)

1. [vercel.com](https://vercel.com) → **Add New → Project** → chọn repo GitHub.
2. **Root Directory:** để **trống** (root repo), vì thư mục **`api/`** nằm ở root; preset/build lấy theo **`vercel.json`**.
3. **Environment Variables** (Production, có thể thêm Preview):

| Tên | Giá trị |
|-----|--------|
| `VITE_SUPABASE_ADMIN_URL` | URL Supabase **Admin** |
| `VITE_SUPABASE_ADMIN_ANON_KEY` | **Anon** Admin (không dùng service_role) |
| `GITHUB_TOKEN` | PAT GitHub (classic), quyền **repo** |
| `GITHUB_REPO` | `owner/repo` đúng với repo này |

Bản **.env mẫu đủ biến** (R2, Supabase Admin cho API, Supabase User, `VITE_*` tùy chọn): [docs/env/vercel.env.example](./env/vercel.env.example).

**Hướng dẫn gom** (project, `vercel.json`, từng nhóm env, bảng `/api/*`): [vercel/README.md](./vercel/README.md).

4. **Deploy**. Mở URL Vercel → trang đăng nhập Admin → đăng nhập bằng user đã gán `role: admin`.

Gỡ lỗi: [vercel/TROUBLESHOOTING.md](./vercel/TROUBLESHOOTING.md).

---

## Bước 5 — Setup Cloudflare (website tĩnh)

Website deploy bằng **Pages — Direct Upload** (Actions đẩy `public/`), **không** nối Git trực tiếp vào Pages.

1. **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Pages** → chọn **Direct Upload** → đặt tên project (ghi nhớ tên nếu cần khớp biến `CLOUDFLARE_PAGES_PROJECT_NAME`).
2. **My Profile → API Tokens** → tạo token có quyền **Cloudflare Pages → Edit** (theo [TRIEN-KHAI.md](./TRIEN-KHAI.md) mục 4.1 nếu cần hình minh họa).
3. Copy **Account ID** (trang Overview).
4. Dán token + Account ID vào **GitHub Secrets** (đã liệt kê Bước 2).
5. Đảm bảo trên nhánh **`main`** có **`public/`** đã có nội dung sau build (chạy workflow **update-data** / **build-on-demand**, hoặc `npm run build` rồi push). Push **`main`** sẽ kích hoạt workflow deploy lên Pages (nếu đã cấu hình như trong repo).

**Toàn bộ thứ cần tạo trên Cloudflare** (Pages, token, R2, comment D1/KV, domain): [cloudflare/README.md](./cloudflare/README.md).

---

## Sau khi 5 bước xong

- Chạy workflow **update-data** hoặc **build-on-demand** (GitHub → **Actions**) để tạo `public/data/` nếu chưa có.
- Vào **Admin** (Vercel) → **Cài đặt chung** → dán Supabase **User** URL + anon → **Lưu** → dùng **Build website** để build lại và deploy (nếu đã cấu hình `GITHUB_TOKEN`).
- Site: URL dạng `https://<tên-project>.pages.dev`.

**Tùy:** domain riêng, R2, Supabase, comment, app — xem [README.md](./README.md) (danh mục `docs/`).

**Lỗi thường gặp:** [TRIEN-KHAI.md](./TRIEN-KHAI.md) phần **Bước 7** (Admin không đọc dữ liệu, build không ra Site, deploy lỗi).
