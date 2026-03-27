# Hệ thống Comment nội bộ (Cloudflare Pages + D1 + KV)

Tài liệu này thay thế Twikoo. Hệ thống comment mới dùng:
- Cloudflare Pages Functions
- D1 (bảng `comments`)
- KV cache + rate limit
- Supabase Auth token hiện có của website

## 1) Cấu trúc file

- `functions/api/comment/has.ts` - kiểm tra bài viết có comment hay chưa
- `functions/api/comment/index.ts` - GET danh sách + POST tạo comment
- `functions/api/comment/[id].ts` - DELETE comment (chủ sở hữu hoặc admin)
- `functions/api/comment/_shared.ts` - helper chung (JWT verify, sanitize, rate-limit)
- `migrations/001_comments.sql` - schema D1
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
```

## 4) Biến môi trường bắt buộc

Trong Cloudflare Pages > Settings > Environment Variables:

- `SUPABASE_JWT_SECRET` = JWT secret của project Supabase Auth đang dùng trên website.

Lưu ý: API POST/DELETE sẽ verify chữ ký token bằng secret này.

## 5) Cách frontend hoạt động

Component tại `public/js/comments.js`:
- Lấy session từ Supabase client sẵn có (`window.DAOP._supabaseUser` hoặc khởi tạo từ `supabase_user_url` + `supabase_user_anon_key`)
- Nếu chưa đăng nhập: hiển thị nút "Đăng nhập để bình luận"
- Nếu đã đăng nhập: hiển thị form + gửi `Authorization: Bearer <token>`
- Gọi `/api/comment/has` trước, chỉ load danh sách khi có comment
- Dùng `IntersectionObserver` để lazy load
- Có retry khi API lỗi, hỗ trợ "Tải thêm", lưu draft vào localStorage

## 6) Cache và chống spam

- KV cache:
  - `has:{postSlug}`
  - `comments:{postSlug}:page:{page}:limit:{limit}`
  - TTL 5 phút
- Rate limit:
  - KV `comment:rl:{ip}`
  - 5 lần / 5 phút cho POST
- Honeypot:
  - Field ẩn `website`, nếu có dữ liệu sẽ bỏ qua

## 7) Nhúng vào trang

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

