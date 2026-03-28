# Hệ thống Comment nội bộ (Cloudflare Pages + D1 + KV)

**Tổng quan Cloudflare (gồm D1/KV và biến Pages):** [../cloudflare/README.md](../cloudflare/README.md).

Tài liệu này thay thế Twikoo. Hệ thống comment mới dùng:
- Cloudflare Pages Functions
- D1 (bảng `comments`)
- KV cache + rate limit
- Supabase Auth token hiện có của website

## 1) Cấu trúc file

- `functions/api/comment/has.ts` - kiểm tra bài viết có comment hay chưa
- `functions/api/comment/index.ts` - GET danh sách + POST tạo comment
- `functions/api/comment/[id].ts` - DELETE comment (chủ sở hữu hoặc admin)
- `functions/api/comment/admin-export.ts` - export toàn bộ D1 (JSON) — bảo vệ bằng `COMMENTS_ADMIN_SECRET`
- `functions/api/comment/admin-import.ts` - import JSON vào D1 (merge/replace)
- `functions/api/comment/_shared.ts` - helper chung (JWT verify, sanitize, rate-limit)
- `migrations/001_comments.sql` - schema D1 (`comments`)
- `migrations/002_comment_reactions.sql` - bảng `comment_reactions`
- `public/js/comments.js` - component comment frontend
- `public/css/comments.css` - style comment

## 2) Tạo D1 và KV

Ví dụ bằng Wrangler:

```bash
wrangler d1 create daop-comments
wrangler kv namespace create COMMENT_CACHE
wrangler kv namespace create COMMENT_RATE_LIMIT
```

Sau đó copy các ID vào `wrangler.toml`:
- `database_id` cho D1
- `id` cho 2 KV namespace

## 3) Chạy migration D1

```bash
wrangler d1 execute daop-comments --file=./migrations/001_comments.sql
wrangler d1 execute daop-comments --file=./migrations/002_comment_reactions.sql
```

## 4) Biến môi trường bắt buộc

Trong Cloudflare Pages > Settings > Environment Variables:

- `SUPABASE_JWT_SECRET` = JWT secret của project Supabase Auth đang dùng trên website.
- `COMMENTS_ADMIN_SECRET` (tùy chọn) = chỉ khi dùng export/import bulk; thêm dạng **Secret** (không plaintext trong `wrangler.toml`); xem mục **6**.

Lưu ý: API POST/DELETE sẽ verify chữ ký token bằng `SUPABASE_JWT_SECRET`.

## 5) Cách frontend hoạt động

Component tại `public/js/comments.js`:
- Lấy session từ Supabase client sẵn có (`window.DAOP._supabaseUser` hoặc khởi tạo từ `supabase_user_url` + `supabase_user_anon_key`)
- Nếu chưa đăng nhập: hiển thị nút "Đăng nhập để bình luận"
- Nếu đã đăng nhập: hiển thị form + gửi `Authorization: Bearer <token>`
- Gọi `/api/comment/has` trước, chỉ load danh sách khi có comment
- Dùng `IntersectionObserver` để lazy load
- Có retry khi API lỗi, hỗ trợ "Tải thêm", lưu draft vào localStorage

## 6) Export / import D1 (backup & migration)

1. **`COMMENTS_ADMIN_SECRET`** — chuỗi ngẫu nhiên **≥ 8 ký tự** (khuyến nghị 16–32+). **Không** đặt trong `wrangler.toml` `[vars]` (plaintext trong Git).

   Khi Cloudflare báo *“Environment variables are managed through wrangler.toml; only Secrets can be managed via the Dashboard”*:
   - **Cách A — Dashboard:** **Workers & Pages** → project Pages → **Settings** → **Variables and Secrets** → **Add** → nhập tên `COMMENTS_ADMIN_SECRET` → bật **Encrypt** / chọn **Secret** (biến mã hóa), dán giá trị.
   - **Cách B — CLI** (khuyên dùng nếu UI không cho thêm plaintext):

   ```bash
   npx wrangler pages secret put COMMENTS_ADMIN_SECRET --project-name=TÊN_PROJECT_PAGES
   ```

   (`TÊN_PROJECT_PAGES` = tên project trong Cloudflare, ví dụ `daop` — trùng `CLOUDFLARE_PAGES_PROJECT_NAME` nếu có.)

2. **Deploy** lại site (hoặc đợi vài phút) để Functions nhận secret.
3. **Cách 1 — Admin UI:** **Supabase Tools** → tab **Comment (D1)** — nhập URL website (vd. `https://ten.pages.dev`), dán secret, **Export** (tải JSON) hoặc dán JSON và **Import** (`merge` hoặc `replace`).
4. **Cách 2 — HTTP thủ công:**
   - `GET /api/comment/admin-export` — header `X-Comments-Admin-Secret` hoặc `Authorization: Bearer …`.
   - `POST /api/comment/admin-import` — `Content-Type: application/json`, cùng header, body:
     `{ "mode": "merge" | "replace", "comments": [...], "comment_reactions": [...] }`.
5. **Ý nghĩa mode:** **replace** = `DELETE` toàn bộ `comment_reactions` + `comments` rồi ghi lại; **merge** = `INSERT … ON CONFLICT(id) DO UPDATE` (bản ghi không có trong JSON vẫn giữ trên D1). Sau import, xóa KV `has:{post_slug}` cho các slug liên quan.

Cần chạy migration **002** nếu bảng `comment_reactions` chưa có (export/import gồm cả reaction).

## 7) Cache và chống spam

- KV cache:
  - `has:{postSlug}`
  - `comments:{postSlug}:page:{page}:limit:{limit}`
  - TTL 5 phút
- Rate limit:
  - KV `comment:rl:{ip}`
  - 5 lần / 5 phút cho POST
- Honeypot:
  - Field ẩn `website`, nếu có dữ liệu sẽ bỏ qua

## 8) Nhúng vào trang

Trang đã được gắn sẵn:
- `/phim/*` -> `#comments-container`
- `/xem-phim/*` -> `#watch-comments-container`

Nếu cần nhúng nơi khác:

```html
<div id="comments-container" data-post-slug="my-post"></div>
<script src="/js/comments.js"></script>
<script>
  window.DAOP.mountComments('#comments-container', { postSlug: 'my-post' });
</script>
```

