# GitHub Actions

## Workflows

1. **update-data.yml** – Chạy hàng ngày (cron), gọi `npm run build` với secrets (TMDB, OPhim, Supabase Admin, R2, Google Sheets). Commit và push thay đổi vào repo. **Cuối workflow**, nếu các bước trước thành công, tự động chạy `scripts/export-to-sheets.js` (cần `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_JSON`).
2. **build-on-demand.yml** – Kích hoạt bằng `repository_dispatch` (event `build-on-demand`). Admin Panel gọi webhook → GitHub API trigger workflow này. Chạy build với flag `--incremental` nếu cần.
3. **deploy.yml** – Sau khi build xong (hoặc push nhánh chính), dùng `cloudflare/pages-action` để deploy thư mục `public/` lên Cloudflare Pages.

## Secrets cần thiết

- `SUPABASE_ADMIN_URL`, `SUPABASE_ADMIN_SERVICE_ROLE_KEY`
- `TMDB_API_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `GITHUB_TOKEN` (hoặc PAT) để push và trigger.
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` cho deploy Pages.

## Webhook từ Admin (Build website)

Admin gọi `POST /api/trigger-build` (Vercel function). Function dùng `GITHUB_TOKEN` và `GITHUB_REPO` để gọi GitHub API:  
`POST /repos/{owner}/{repo}/dispatches` với `event_type: build-on-demand`.

**Để cập nhật trên Admin (sections, banners, cài đặt, theme…) xuất ra website:**  
Workflow **build-on-demand** chạy `--incremental` và đọc config từ Supabase. Bắt buộc thêm **Secrets** trong repo: **`SUPABASE_ADMIN_URL`** và **`SUPABASE_ADMIN_SERVICE_ROLE_KEY`** (cùng project Supabase Admin mà trang Admin dùng). Nếu thiếu, build sẽ ghi config mặc định và thay đổi trên Admin không xuất hiện trên site.  
→ GitHub repo → **Settings** → **Secrets and variables** → **Actions** → thêm hai secret trên (giá trị lấy từ Supabase Admin → Settings → API).
