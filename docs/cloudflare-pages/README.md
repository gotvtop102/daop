# Cloudflare Pages — Deploy website (Direct Upload)

**Hướng dẫn gom toàn bộ Cloudflare (Pages, R2, token, comment):** [../cloudflare/README.md](../cloudflare/README.md).

Tóm tắt:

1. Tạo project Pages kiểu **Direct Upload** (không Connect Git).
2. Workflow `.github/workflows/deploy.yml` deploy thư mục `public/` bằng `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (GitHub Secrets).
3. (Tùy chọn) GitHub Variable `CLOUDFLARE_PAGES_PROJECT_NAME` nếu tên project khác `daop`.
4. Build dữ liệu: `update-data` / `build-on-demand` rồi deploy tự kích hoạt theo workflow.

Routing slug phim (404 / hash): xem [../TRIEN-KHAI.md](../TRIEN-KHAI.md).
