# DAOP - Hệ thống Website Phim

Hệ thống gồm: **Website phim tĩnh** (Cloudflare Pages), **Admin Panel** (Vercel), **Ứng dụng đa nền tảng** (Capacitor).

**Người mới có mã nguồn — cài đặt 5 bước:** [docs/BAT-DAU-NHANH.md](docs/BAT-DAU-NHANH.md) (tài khoản & key → GitHub → Supabase → Vercel → Cloudflare). **Mục lục tài liệu (một cửa):** [docs/README.md](docs/README.md). Chi tiết và gỡ lỗi: [docs/TRIEN-KHAI.md](docs/TRIEN-KHAI.md).

---

## Node.js có bắt buộc chạy trên máy PC không?

**Không bắt buộc.** Tùy cách bạn triển khai:

| Cách làm | Cần Node.js trên PC? |
|----------|----------------------|
| **Build trên GitHub Actions** (workflow `update-data` / `build-on-demand`) | **Không.** Build chạy trên server GitHub, bạn chỉ cần push code và cấu hình Secrets. |
| **Chạy build trên máy** (`npm run build`) rồi push `public/data` lên Git | **Có.** Cần cài Node.js trên PC để chạy script build. |
| **Chạy Admin local** (`cd admin && npm run dev`) để sửa giao diện | **Có.** Cần Node.js để chạy Vercel dev. |

**Tóm lại:** Nếu bạn chỉ cấu hình Supabase/Vercel/Cloudflare, push code lên GitHub và dùng GitHub Actions để tạo dữ liệu + deploy thì **không cần cài Node.js trên PC**. Chỉ khi muốn chạy build hoặc chạy Admin (dev) ngay trên máy mới cần cài Node.js.

---

## Có bắt buộc chạy 5 bước trên PC rồi mới triển khai lên GitHub không?

**Không.** Bạn **không cần** chạy npm install, build, serve, v.v. trên PC trước khi đẩy code lên GitHub.

**Cách triển khai không cần chạy gì trên PC (trừ Git):**

1. Cài **Git** trên máy (nếu chưa có). Không cần cài Node.js.
2. Đẩy toàn bộ code lên GitHub (clone/pull rồi `git add .` → `git commit` → `git push`). Kể cả khi chưa có thư mục `public/data` đầy đủ (hoặc chỉ có file mẫu rỗng) vẫn push bình thường.
3. Trên **GitHub**: vào Settings → Secrets, thêm TMDB_API_KEY, SUPABASE_ADMIN_*, CLOUDFLARE_* (theo `docs/TRIEN-KHAI.md`).
4. **Cloudflare Pages**: tạo project **Direct Upload**. Deploy dùng GitHub Actions (`deploy.yml`) để đẩy thư mục `public`.
5. **Vercel**: import repo, cấu hình build Admin. Vercel tự chạy `npm install` và build trên server.
6. **Build dữ liệu lần đầu**: vào GitHub → Actions → chạy workflow **update-data** (hoặc đợi lịch). Workflow sẽ chạy `npm run build` trên server GitHub, tạo `public/data/` rồi commit + push.

Vậy **chỉ cần Git trên PC** để push code; các bước 1–6 trong README là để **chạy thử trên máy** (xem site local, sửa Admin local), không bắt buộc trước khi triển khai lên GitHub.

---

## Yêu cầu trước khi chạy (khi chạy trên máy)

- **Node.js** phiên bản 18 trở lên ([tải tại nodejs.org](https://nodejs.org)) – chỉ cần nếu bạn chạy build hoặc `npm run dev` trên PC.
- **npm** (đi kèm Node.js). Kiểm tra: mở terminal/cmd gõ `node -v` và `npm -v`.

---

## Bước 1: Cài đặt dependency (thư mục gốc) – chỉ khi chạy trên máy

Mở terminal tại thư mục dự án (thư mục chứa file `package.json`):

```bash
npm install
```

Chờ cài xong. Nếu báo lỗi, kiểm tra đã cài Node.js đúng chưa.

---

## Bước 2: Cài đặt dependency cho Admin Panel – chỉ khi chạy trên máy

Vẫn trong terminal:

```bash
cd admin
npm install
cd ..
```

(Trên Windows PowerShell có thể dùng: `cd admin; npm install; cd ..`)

---

## Bước 3: Cấu hình biến môi trường

1. Ở **thư mục gốc** dự án, copy file `.env.example` và đổi tên thành `.env`:
   - Windows: copy `.env.example` rồi đổi tên bản copy thành `.env`.
   - Hoặc trong terminal: `copy .env.example .env` (Windows CMD) / `cp .env.example .env` (Mac/Linux).

2. Mở file `.env` bằng notepad/editor và điền (ít nhất các dòng cần thiết để chạy):
   - **TMDB:** lấy API key tại [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) → điền `TMDB_API_KEY=...`
   - **Supabase Admin:** nếu đã tạo project Supabase (xem `docs/supabase/`), điền `SUPABASE_ADMIN_URL` và `SUPABASE_ADMIN_SERVICE_ROLE_KEY`.
   - Các biến khác (OPhim, R2, GitHub…) có thể để trống khi chạy thử; build vẫn chạy nhưng có thể không lấy đủ dữ liệu hoặc không upload ảnh.

3. **Admin Panel:** trong thư mục `admin/`, tạo file `.env` (hoặc copy từ `admin/.env.example`) và điền:
   - `VITE_SUPABASE_ADMIN_URL=https://xxx.supabase.co`
   - `VITE_SUPABASE_ADMIN_ANON_KEY=eyJ...` (anon key của Supabase Admin)

---

## Bước 4: Build dữ liệu (tạo file tĩnh cho website) – có thể chạy trên máy hoặc để GitHub/Cloudflare chạy

Ở **thư mục gốc** dự án:

```bash
npm run build
```

- Script sẽ: gọi API OPhim (nếu có), đọc phim tùy chỉnh từ Supabase hoặc `custom_movies.xlsx` (nếu cấu hình), làm giàu TMDB, xuất file vào `public/data/` (movies-light.js, filters.js, actors.js, batches, config JSON…).
- Lần đầu có thể mất vài phút. Nếu thiếu TMDB/Supabase, một số file có thể rỗng hoặc dùng dữ liệu mẫu đã có sẵn trong `public/data/`.

---

## Bước 5: Chạy website chính (xem local)

Sau khi build xong, chạy static server để xem website:

**Cách 1 – dùng `serve` (cần cài một lần):**

```bash
npx serve public -p 3000
```

Rồi mở trình duyệt: **http://localhost:3000**

**Cách 2 – dùng Python (nếu đã cài Python):**

```bash
cd public
python -m http.server 3000
```

Rồi mở **http://localhost:3000**

**Cách 3 – dùng extension VSCode:**  
Cài extension "Live Server", chuột phải vào `public/index.html` → "Open with Live Server".

---

## Bước 6: Chạy Admin Panel (quản trị)

Mở terminal mới (hoặc thoát server website trước), vào thư mục admin:

```bash
cd admin
npm run dev
```

Mở trình duyệt: **http://localhost:5174** (hoặc cổng Vite in ra trong terminal).

- Đăng nhập Admin cần Supabase Auth với user có role `admin` (xem `docs/supabase/README.md`).
- Nút "Build website" trong Admin gọi API trigger build (cần GITHUB_TOKEN, GITHUB_REPO trên Vercel).

---

## Tóm tắt lệnh theo thứ tự (khi chạy thử trên máy)

| Bước | Lệnh | Nơi chạy |
|------|------|----------|
| 1 | `npm install` | Thư mục gốc |
| 2 | `cd admin` → `npm install` → `cd ..` | Thư mục gốc rồi vào admin |
| 3 | Copy `.env.example` → `.env` và điền biến | Thư mục gốc + thư mục admin |
| 4 | `npm run build` | Thư mục gốc |
| 5 | `npx serve public -p 3000` | Thư mục gốc → xem tại http://localhost:3000 |
| 6 | `cd admin` → `npm run dev` | Thư mục admin → xem tại http://localhost:5174 |

---

## Cấu trúc dự án

- **`scripts/build.js`** – Script build: OPhim, TMDB, Google Sheets → file tĩnh trong `public/data/`.
- **`public/`** – Website chính (deploy Cloudflare Pages).
- **`admin/`** – Admin panel React (deploy Vercel).
- **`app/`** – (Tùy chọn) Project Capacitor nếu bạn tạo; xem `docs/capacitor/README.md`.
- **`docs/`** – Hướng dẫn chi tiết: Supabase, R2, Vercel, Cloudflare Pages, GitHub Actions, Comments, Capacitor.

### Section trang chủ (mặc định)

Trang chủ load `public/data/config/homepage-sections.json` (build xuất từ Supabase Admin bảng `homepage_sections`). **Mặc định chỉ có 1 section mẫu cho thể loại, 1 cho quốc gia, 1 cho năm**; thêm/bớt và điều chỉnh chi tiết (tiêu đề, nguồn, link "Xem thêm", thứ tự) thực hiện từ **Admin Panel** (Quản lý giao diện → Homepage Sections), sau đó build lại để xuất JSON mới.

| Section (mặc định)     | Nguồn              | Link "Xem thêm"   |
|------------------------|--------------------|-------------------|
| Phim bộ                | type: series       | /phim-bo.html     |
| Phim lẻ                | type: single       | /phim-le.html     |
| Phim 4K                | quality_4k         | /chu-de/phim-4k.html |
| Thể loại (mẫu)         | genre: hanh-dong   | /the-loai/        |
| Quốc gia (mẫu)         | country: au-my     | /quoc-gia/        |
| Năm phát hành (mẫu)    | year: 2024         | /nam-phat-hanh/   |

Trong Admin: chọn **source_type** (type / genre / country / year / status / quality_4k), **source_value** (slug hoặc giá trị tương ứng), **limit_count**, **more_link**, **sort_order**; kéo thả để sắp xếp. Build sẽ ghi đè `homepage-sections.json` theo cấu hình đã lưu.

Chi tiết từng dịch vụ (tạo Supabase, R2, deploy…) xem trong từng thư mục con của **`docs/`**.

---

## Triển khai lên môi trường (deploy)

**Làm lần lượt:** **`docs/BAT-DAU-NHANH.md`** — Bước 1 (tài khoản & key) → 2 (GitHub) → 3 (Supabase) → 4 (Vercel) → 5 (Cloudflare). Chi tiết và xử lý sự cố: **`docs/TRIEN-KHAI.md`**.

Sau khi cấu hình xong: chạy workflow build trên Actions (hoặc `npm run build` rồi push), vào Admin **Cài đặt chung** (Supabase User), bấm **Build website** nếu cần, đợi deploy `public/` lên Cloudflare Pages.
