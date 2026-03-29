# Cloudflare R2 – Lưu trữ file

> **Dự án mặc định dùng ảnh trên GitHub + jsDelivr** (`IMAGE_CDN_BASE`, ví dụ `https://cdn.jsdelivr.net/gh/ophim102/cm114@main/public`). Trang này chỉ tham khảo nếu bạn tự host object storage R2.

**Mục lục tổng:** [../README.md](../README.md).

Tổng quan Cloudflare (Pages + token + R2 + comment): [../cloudflare/README.md](../cloudflare/README.md).

R2 dùng để lưu ảnh (thumb, poster đã chuyển WebP), video quảng cáo, và có thể file batch nếu cần.

## Các bước cấu hình

1. **Tạo R2 bucket**  
   Vào Cloudflare Dashboard → R2 → Create bucket. Đặt tên (ví dụ: `daop-media`).

2. **Lấy thông tin kết nối**  
   - **Account ID:** Trong R2 hoặc sidebar, copy Account ID.  
   - **API Token:** R2 → Manage R2 API Tokens → Create API token. Quyền Object Read & Write. Copy Access Key ID và Secret Access Key.

3. **Biến môi trường (cho script build)**  
   Thêm vào `.env`:
   - `R2_ACCOUNT_ID` – Account ID.
   - `R2_ACCESS_KEY_ID` – Access Key ID từ bước trên.
   - `R2_SECRET_ACCESS_KEY` – Secret Access Key.
   - `R2_BUCKET_NAME` – Tên bucket (ví dụ: `daop-media`).
   - `R2_PUBLIC_URL` – URL public để truy cập file (cần bật public access cho bucket hoặc dùng Custom Domain / R2 public bucket URL).

4. **Public access (tùy chọn)**  
   Nếu muốn ảnh truy cập trực tiếp qua URL:  
   - Bật “Allow Access” / Public access cho bucket, hoặc  
   - Thêm Custom Domain cho bucket trong R2 và dùng domain đó làm `R2_PUBLIC_URL`.

5. **Script build**  
   Khi có đủ biến R2, script build sẽ upload ảnh (sau khi chuyển WebP bằng sharp) lên R2 và ghi lại URL trong dữ liệu. Nếu không cấu hình R2, script vẫn chạy và giữ URL ảnh gốc.

## Định dạng file trên R2

- Thumb: `thumbs/{slug}.webp`
- Poster: `posters/{slug}.webp`

Script build tạo key theo slug phim và ghi URL dạng: `{R2_PUBLIC_URL}/{key}`.

## Upload ảnh từ Admin (Banner, Slider)

API `POST /api/upload-image` (Vercel serverless) nhận body JSON `{ image: base64, contentType }`, upload lên R2 với key `banners/{timestamp}-{id}.{ext}`, trả về `{ url }`. Trang Admin (Banners, Slider) có nút **Upload R2** để chọn ảnh (≤ 4MB); cần cấu hình đủ biến R2 trên **Vercel** (Environment Variables cho project deploy Admin + API) thì upload mới hoạt động.
