# GitHub Actions

**Mục lục tổng:** [../README.md](../README.md).

**Tổng quan mọi thứ cần tạo trên GitHub (repo, quyền Actions, Secrets, PAT):** [../github/README.md](../github/README.md).

## Workflows

1. **update-data.yml** – Chạy hàng ngày (cron), gọi `npm run build` với secrets (TMDB, OPhim, Supabase Admin, R2). Commit và push thay đổi vào repo.
2. **build-on-demand.yml** – Kích hoạt bằng `repository_dispatch` (event `build-on-demand`). Admin Panel gọi webhook → GitHub API trigger workflow này. Chạy build với flag `--incremental` nếu cần.
3. **deploy.yml** – Sau khi build xong (hoặc push nhánh chính), dùng `cloudflare/pages-action` để deploy thư mục `public/` lên Cloudflare Pages.
4. **export-to-supabase.yml** – `workflow_dispatch` hoặc `repository_dispatch` (`export-to-supabase`). Chạy `npm run export-to-supabase`: đọc `public/data/batches` đã commit, upsert vào Supabase (`movies`, `movie_episodes`). Biến tùy chọn **`EXPORT_TO_SUPABASE_SCOPE`**: `all` (mặc định) hoặc `custom` (chỉ phim `_from_supabase` / id `ext_*`) — đặt trong **Actions → Variables**.

## Secrets cần thiết

Danh sách đầy đủ (và **Variables** tùy chọn) dạng checklist: **[docs/env/github.env.example](../env/github.env.example)**.

Tóm tắt:

- `SUPABASE_ADMIN_URL`, `SUPABASE_ADMIN_SERVICE_ROLE_KEY`
- `TMDB_API_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `GH_PAT` (khuyến nghị nếu cần push/commit từ workflow) hoặc dùng `GITHUB_TOKEN` mặc định của Actions
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` cho deploy Pages
- `OPHIM_BASE_URL` (tùy chọn)

## Webhook từ Admin (Build website)

Admin gọi `POST /api/trigger-build` (Vercel function). Function dùng `GITHUB_TOKEN` và `GITHUB_REPO` để gọi GitHub API:  
`POST /repos/{owner}/{repo}/dispatches` với `event_type: build-on-demand`.

**Để cập nhật trên Admin (sections, banners, cài đặt, theme…) xuất ra website:**  
Workflow **build-on-demand** chạy `--incremental` và đọc config từ Supabase. Bắt buộc thêm **Secrets** trong repo: **`SUPABASE_ADMIN_URL`** và **`SUPABASE_ADMIN_SERVICE_ROLE_KEY`** (cùng project Supabase Admin mà trang Admin dùng). Nếu thiếu, build sẽ ghi config mặc định và thay đổi trên Admin không xuất hiện trên site.  
→ GitHub repo → **Settings** → **Secrets and variables** → **Actions** → thêm hai secret trên (giá trị lấy từ Supabase Admin → Settings → API).
