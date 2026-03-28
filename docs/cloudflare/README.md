# Cloudflare — tất cả thứ cần tạo & chú thích

Một tài khoản [Cloudflare](https://dash.cloudflare.com) có thể gồm nhiều dịch vụ DAOP dùng tới. Làm theo thứ tự: **bắt buộc cho site** → **R2** (nếu host ảnh) → **Comment** (nếu bật D1/KV). Chi tiết deploy: [../TRIEN-KHAI.md](../TRIEN-KHAI.md) (Bước 4), checklist GitHub: [../env/github.env.example](../env/github.env.example).

---

## 1. Thông tin tài khoản (dùng mọi nơi)

| Cần lấy | Mô tả | Lưu ở đâu |
|--------|--------|-----------|
| **Account ID** | Chuỗi 32 ký tự hex (ví dụ trong sidebar Dashboard hoặc **Overview** domain). Xác định *tài khoản* Cloudflare của bạn. | GitHub Secret `CLOUDFLARE_ACCOUNT_ID` |
| **API Token (Account)** | Token do bạn tạo (**My Profile → API Tokens → Create Token**), cấp quyền theo bảng dưới. Không nhầm với **Global API Key** cũ. | GitHub Secret `CLOUDFLARE_API_TOKEN` |

**Gợi ý quyền token deploy + R2 (một token cho gọn):**

- **Account → Cloudflare Pages → Edit** — để GitHub Actions/Wangler đẩy thư mục `public/` lên Pages.
- **Account → Workers R2 Storage → Edit** — nếu dùng R2 (build upload ảnh, workflow xóa/upload R2).

Có thể tách hai token (chỉ Pages / chỉ R2) nếu muốn thu hẹp quyền.

---

## 2. Cloudflare Pages — website tĩnh (`public/`)

| Việc cần làm | Chú thích |
|--------------|-----------|
| **Tạo project** | **Workers & Pages → Create → Pages → Direct Upload**. **Không** chọn “Connect to Git” (repo deploy qua GitHub Actions + Wrangler). |
| **Đặt tên project** | Tên này là `project-name` trong lệnh `wrangler pages deploy … --project-name=…`. Nếu khác mặc định `daop` trong workflow, thêm GitHub **Variable** `CLOUDFLARE_PAGES_PROJECT_NAME`. |
| **Deployment đầu** | Workflow `deploy.yml` chạy khi push `main` (và một số trường hợp `workflow_run`). Cần đã có nội dung trong repo nhánh `main` sau build (`public/`). |
| **URL mặc định** | `https://<tên-project>.pages.dev` |
| **Routing phim** | Chi tiết slug/hash: [TRIEN-KHAI.md § routing](../TRIEN-KHAI.md) (404 → `404.html` → hash trên `phim/index.html`). |

**Biến môi trường trên chính project Pages** (Dashboard → project → **Settings → Environment variables**):

| Biến | Bắt buộc khi | Ý nghĩa |
|------|----------------|---------|
| `SUPABASE_JWT_SECRET` | Bật **comment nội bộ** | **JWT Secret** của project Supabase **User** (Settings → API → *JWT Secret*). Pages Functions verify Bearer token người xem. Không để lộ lên frontend ngoài cơ chế server. |
| `COMMENTS_ADMIN_SECRET` | Export/import comment từ **Admin** (tab Comment D1) | Chỉ thêm dạng **Secret (mã hóa)** trên Pages hoặc `wrangler pages secret put` — **không** dùng `[vars]` trong `wrangler.toml` cho giá trị này. Chi tiết: [comments/README.md](../comments/README.md) mục 6. |

Các secret khác (TMDB, Supabase Admin…) **không** cần trên Pages — chúng chạy trên GitHub Actions hoặc Vercel.

**Domain riêng (tùy chọn):** Pages → **Custom domains** → thêm tên miền; DNS/SSL theo hướng dẫn Cloudflare. Có thể dùng `SITE_URL` khi build nếu cần sitemap/robots đúng domain (xem TRIEN-KHAI).

---

## 3. R2 — object storage (ảnh WebP, prefix `thumbs/` `posters/` …)

| Việc cần làm | Chú thích |
|--------------|-----------|
| **Tạo bucket** | **R2 → Create bucket**. Tên bucket (ví dụ `daop-media`) → biến `R2_BUCKET_NAME`. |
| **Credential S3-compatible** | **R2 → [bucket] → Settings** hoặc **Manage R2 API Tokens**: tạo token/access key (Read+Write object). → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. |
| **Account ID** | Giống mục 1; R2 cùng account với Pages. → `R2_ACCOUNT_ID` (thường trùng `CLOUDFLARE_ACCOUNT_ID` về giá trị). |
| **Public URL** | Domain public cho object: **R2 bucket → Public access** hoặc **Custom domain** cho bucket. URL gốc (không có slash cuối thừa khi dùng trong code) → `R2_PUBLIC_URL`. |

**Nơi cấu hình R2:**

- **GitHub Actions Secrets** — `npm run build` và workflow upload/xóa ảnh R2.
- **Vercel Environment Variables** — API `upload-image`, `movies` khi upload ảnh từ Admin.

Không bắt buộc: không cấu hình R2 thì build vẫn chạy, ảnh giữ URL gốc (xem [../r2/README.md](../r2/README.md)).

---

## 4. Comment nội bộ — D1 + KV + Pages Functions

Chỉ cần khi dùng hệ thống comment trong `functions/api/comment/` (thay Twikoo).

| Thành phần | Việc cần làm | Chú thích |
|------------|--------------|-----------|
| **D1** | `wrangler d1 create <tên-db>` (hoặc tạo trong Dashboard) | Lưu bảng comment. Copy `database_id` vào `wrangler.toml` (`[[d1_databases]]`). |
| **KV (cache)** | `wrangler kv namespace create COMMENT_CACHE` | Binding `COMMENT_CACHE` trong `wrangler.toml`. |
| **KV (rate limit)** | `wrangler kv namespace create COMMENT_RATE_LIMIT` | Binding `COMMENT_RATE_LIMIT`. |
| **Migration** | `wrangler d1 execute … --file=migrations/001_comments.sql` | Tạo schema bảng `comments`. |
| **JWT** | `SUPABASE_JWT_SECRET` trên **Pages → Environment variables** | Lấy từ Supabase User project; phải khớp secret ký token đăng nhập. |

**`wrangler.toml` ở root repo:** khai báo `pages_build_output_dir = "public"`, binding D1/KV; khi deploy bằng `wrangler pages deploy`, Cloudflare gắn Functions trong `functions/` với project Pages. **Không nên** commit giá trị bí mật thật vào `[vars]` trong Git — ưu tiên Dashboard.

Chi tiết file, API, frontend: [../comments/README.md](../comments/README.md).

---

## 5. Bảng tổng hợp “tạo trên Cloudflare”

| STT | Tạo trong Dashboard / CLI | Mục đích |
|-----|---------------------------|----------|
| 1 | Tài khoản Cloudflare | Truy cập mọi dịch vụ. |
| 2 | **API Token** (Pages + R2 nếu cần) | Deploy Pages từ GitHub; có thể dùng chung quyền R2. |
| 3 | Ghi nhớ **Account ID** | `CLOUDFLARE_ACCOUNT_ID`, thường dùng chung cho R2. |
| 4 | **Pages project** (Direct Upload) | Host website; tên project khớp `CLOUDFLARE_PAGES_PROJECT_NAME` hoặc `daop`. |
| 5 | (Tùy chọn) **R2 bucket** + access keys + public URL | Ảnh build + upload Admin. |
| 6 | (Tùy chọn) **D1** + **2 KV** + migration + `SUPABASE_JWT_SECRET` | Comment nội bộ. |
| 7 | (Tùy chọn) **Custom domain** Pages / R2 | Thương hiệu, URL đẹp. |

---

## 6. Liên kết nhanh tài liệu con

- Deploy Pages (ngắn): [../cloudflare-pages/README.md](../cloudflare-pages/README.md)
- R2 chi tiết: [../r2/README.md](../r2/README.md)
- Comment: [../comments/README.md](../comments/README.md)
- GitHub (repo, deploy token): [../github/README.md](../github/README.md) — Secrets mẫu [../env/github.env.example](../env/github.env.example)
- Vercel (Admin + API): [../vercel/README.md](../vercel/README.md)
- Supabase (JWT `SUPABASE_JWT_SECRET`): [../supabase/README.md](../supabase/README.md)
