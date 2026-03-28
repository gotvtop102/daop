# Hướng dẫn triển khai DAOP

Tài liệu này mô tả từng bước đưa dự án lên môi trường thật: website trên Cloudflare Pages, Admin trên Vercel, dữ liệu từ Supabase và (tùy chọn) R2, hệ thống comment nội bộ.

**Mục lục tài liệu (một cửa):** [README.md](./README.md).

**Đã có code, muốn làm ngắn gọn:** dùng [BAT-DAU-NHANH.md](./BAT-DAU-NHANH.md) (5 bước: tài khoản & key → GitHub → Supabase → Vercel → Cloudflare). Trang này là bản đầy đủ cùng thứ tự cũ, tiện tra cứu chi tiết và gỡ lỗi.

**Nội dung (theo thứ tự):** bảng chuẩn bị → **Bước 1** Supabase → **Bước 2** GitHub → **Bước 3** Secrets → **Bước 4** Cloudflare Pages → **Bước 5** Vercel → **Bước 6** build dữ liệu → **Bước 7** Admin → **Bước 8** domain → **Bước 9** tùy chọn → tóm tắt cuối trang.

> **Bảo mật:** Không dán URL, API key hay token thật vào tài liệu hay commit Git. Chỉ lưu trong Supabase / Vercel / GitHub Secrets và file `.env` trên máy (thường đã nằm trong `.gitignore`).

## Chuẩn bị tài khoản / dịch vụ

| Dịch vụ | Dùng để | Bắt buộc |
|---------|---------|----------|
| **GitHub** | Lưu code, GitHub Actions | Có |
| **Supabase** | 2 project: User (auth, favorites, history) + Admin (cấu hình) | Có |
| **Cloudflare** | Pages (website) + có thể R2 (ảnh) | Có (Pages); R2 tùy chọn |
| **Vercel** | Host Admin + API trigger build | Có |
| **TMDB** | API key lấy thông tin phim | Có (để build có dữ liệu) |
| **Cloudflare D1 + KV** | Cho hệ thống bình luận nội bộ | Có (nếu dùng comment) |

---

## Bước 1: Tạo hai project Supabase

**Danh sách gom mọi thứ cần tạo/cấu hình trên Supabase:** [supabase/README.md](./supabase/README.md).

### 1.1. Project Supabase User (cho người xem)

1. Vào [supabase.com](https://supabase.com) → New Project.
2. Đặt tên (ví dụ: `daop-user`), chọn region, đặt mật khẩu database.
3. Sau khi tạo xong:
   - Vào **SQL Editor** → New query.
   - Copy toàn bộ nội dung file `docs/supabase/schema-user.sql` và chạy.
4. Bật **Authentication**:
   - Authentication → Providers: bật **Email**, (tùy chọn) **Google**.
5. Lấy URL và key:
   - **Settings → API**: copy **Project URL** và **anon public** key.  
   → Dùng sau trong **Admin → Cài đặt chung** (Supabase User URL + Anon Key). Không chia sẻ public các key này ngoài cấu hình đã bảo mật.

### 1.2. Project Supabase Admin (cho quản trị)

1. Tạo project mới (ví dụ: `daop-admin`).
2. **SQL Editor** → chạy toàn bộ `docs/supabase/schema-admin.sql`.
3. Tạo user admin:
   - Authentication → Users → Add user (email + mật khẩu).
   - Để gán role admin, trong **SQL Editor** chạy (thay email đúng):

   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
   where email = 'email-admin-cua-ban@example.com';
   ```

4. Lấy key:
   - **Settings → API**: copy **Project URL**, **anon public** (cho Admin Panel), **service_role** (chỉ dùng cho script build và GitHub Secrets — **không** đưa lên frontend).

---

## Bước 2: Đẩy code lên GitHub

**Danh sách gom mọi thứ cần tạo/cấu hình trên GitHub:** [github/README.md](./github/README.md).

1. Tạo repository mới trên GitHub (ví dụ: `daop-movie`).
2. Trên máy, trong thư mục dự án:

```bash
git init
git add .
git commit -m "Initial: DAOP project"
git branch -M main
git remote add origin https://github.com/USERNAME/daop-movie.git
git push -u origin main
```

(Thay `USERNAME` và tên repo bằng của bạn.)

---

## Bước 3: Cấu hình biến môi trường (GitHub Secrets)

Dùng cho GitHub Actions (build, deploy) và (sau này) cho Cloudflare/Vercel.

1. Vào repo GitHub → **Settings → Secrets and variables → Actions**.
2. Thêm **Repository secrets**:

| Tên secret | Ý nghĩa | Ví dụ |
|------------|---------|--------|
| `TMDB_API_KEY` | API key TMDB | Lấy tại themoviedb.org/settings/api |
| `SUPABASE_ADMIN_URL` | URL project Supabase Admin | https://xxx.supabase.co |
| `SUPABASE_ADMIN_SERVICE_ROLE_KEY` | Service role key Supabase Admin | eyJ... |
| `CLOUDFLARE_API_TOKEN` | Token deploy Cloudflare Pages | Tạo theo mục **Bước 4.1** bên dưới |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID Cloudflare (32 ký tự hex) | Dashboard Cloudflare → Overview |
| `GITHUB_TOKEN` | Mặc định có sẵn trong Actions, dùng push/deploy | (không cần tạo thủ công cho workflow cơ bản) |

Nếu dùng R2 hoặc OPhim custom URL thì thêm (giá trị lấy từ Cloudflare — xem `docs/r2/README.md`):

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `OPHIM_BASE_URL` (nếu khác mặc định)

**Variables** (Settings → Variables): có thể thêm `CLOUDFLARE_PAGES_PROJECT_NAME` = tên project Pages (ví dụ: `daop`).

---

## Bước 4: Deploy website lên Cloudflare Pages

**Danh sách gom mọi thứ cần tạo trên Cloudflare (Pages, R2, token, comment):** [cloudflare/README.md](./cloudflare/README.md).

### Build bằng GitHub Actions, deploy bằng Cloudflare API (Direct Upload)

**Routing trang chi tiết phim:** Không dùng rule `_redirects` cho `/phim/:slug` vì Cloudflare Pages có thể trả 308 thay vì rewrite 200, dẫn tới URL bị chuyển về `/phim/` và mất slug. Cách dùng hiện tại:
- Khi mở `/phim/soa-nhi-su-truong.html` → không có file nên Cloudflare trả **404** và serve **`404.html`**.
- **`404.html`** đọc path, lấy slug (bỏ đuôi `.html`), rồi chuyển hướng sang **`/phim/index.html#soa-nhi-su-truong`**.
- Trang `phim/index.html` load, `movie-detail.js` đọc slug từ **hash** (ưu tiên) hoặc pathname và hiển thị chi tiết phim. URL trên thanh địa chỉ sẽ là `/phim/index.html#slug` (có hash); nội dung vẫn đúng.

Workflow này: khi bạn push lên nhánh `main`, GitHub Actions sẽ **chỉ đẩy** thư mục `public/` lên Cloudflare Pages (không chạy build trên Actions). Build phải đã có sẵn (chạy local hoặc workflow `update-data` / `build-on-demand`).

#### Bước 4.1: Tạo API Token Cloudflare

1. Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Bấm **My Profile** (icon người góc phải) → **API Tokens**.
3. **Create Token**.
4. Chọn một trong hai:
   - **Dùng mẫu:** kéo xuống tìm **Edit Cloudflare Workers** → **Use template** (sau đó có thể thu hẹp quyền nếu cần), hoặc
   - **Custom token:** **Create Custom Token** → đặt tên (vd: `daop-pages-deploy`), phần **Permissions**:
     - **Account** → **Cloudflare Pages** → **Edit**
     - (Nếu dùng R2) **Account** → **Workers R2 Storage** → **Edit**
5. **Continue to summary** → **Create Token**.
6. **Copy** token ngay (chỉ hiển thị một lần). Lưu vào nơi an toàn → dùng làm giá trị secret `CLOUDFLARE_API_TOKEN`.

#### Bước 4.2: Lấy Account ID

1. Trong Cloudflare Dashboard, ở thanh bên trái hoặc trang **Overview** của bất kỳ domain/zone nào.
2. **Account ID** là chuỗi 32 ký tự hex (vd: `74d232c91b824ba3218e83bc576cb392`).
3. Copy → dùng làm giá trị secret `CLOUDFLARE_ACCOUNT_ID`.

#### Bước 4.3: Tạo project Cloudflare Pages (Direct Upload)

1. **Workers & Pages** (menu trái) → **Create** → **Pages**.
2. Chọn **Direct Upload** (không chọn "Connect to Git").
3. **Project name:** đặt tên (vd: `daop`) — tên này dùng trong workflow.
4. **Create project**. Project trống sẽ được tạo, chưa có deployment nào.

#### Bước 4.4: Thêm Secrets và Variables trên GitHub

1. Vào repo GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. **Repository secrets** → **New repository secret**:
  - Tên: `CLOUDFLARE_API_TOKEN` → Value: token đã copy ở bước 4.1.
  - Tên: `CLOUDFLARE_ACCOUNT_ID` → Value: Account ID ở bước 4.2.
3. (Tùy chọn) **Variables** → **New repository variable**:
  - Tên: `CLOUDFLARE_PAGES_PROJECT_NAME` → Value: tên project đã đặt ở bước 4.3 (vd: `daop`).
   - Nếu không tạo variable này, workflow mặc định dùng tên `daop` (xem `.github/workflows/deploy.yml`).

#### Bước 4.5: Đảm bảo thư mục `public/` có sẵn trước khi deploy

Workflow `deploy.yml` chỉ upload nội dung thư mục `public/` lên Pages, **không** chạy `npm run build`. Do đó:

- **Lần đầu:** Chạy build trên máy: `npm run build` (cần `.env` đã cấu hình). Commit và push cả thư mục `public/` (ít nhất `public/data` và các file tĩnh) lên nhánh `main`.
- **Sau đó:** Mỗi lần push `main`, workflow deploy sẽ chạy và đẩy `public/` hiện tại lên Pages.
- **Cập nhật dữ liệu:** Chạy workflow **update-data** (theo lịch hoặc thủ công) hoặc **build-on-demand** (trigger từ Admin). Các workflow này chạy `npm run build`, commit `public/data`, push lên `main`. Workflow **Deploy to Cloudflare Pages** được kích hoạt bởi: (1) push lên `main`, hoặc (2) khi **Build on demand** hoàn thành (`workflow_run`), để đẩy `public/` mới lên Pages.

#### Bước 4.6: Đổi tên project (nếu không dùng `daop`)

Nếu bạn đặt tên project Pages khác (vd: `my-phim-site`):

- Cách 1: Tạo variable `CLOUDFLARE_PAGES_PROJECT_NAME` = `my-phim-site` (như bước 4.4).
- Cách 2: Sửa file `.github/workflows/deploy.yml`, dòng `projectName`: đổi `'daop'` thành tên project của bạn.

Sau khi cấu hình xong, URL site sẽ dạng `https://<project-name>.pages.dev` (vd: `https://daop.pages.dev`).

---

## Bước 5: Deploy Admin Panel + API lên Vercel

**Danh sách gom mọi thứ cần tạo/cấu hình trên Vercel (project, env, API):** [vercel/README.md](./vercel/README.md).

Admin Panel (React/Vite) và API trigger build (serverless) cùng nằm trong một project Vercel: build từ thư mục `admin/`, đồng thời thư mục `api/` ở root repo được deploy thành các function tại `/api/*`.

---

### Bước 5.1: Import repo lên Vercel

1. Đăng nhập [vercel.com](https://vercel.com) (dùng tài khoản GitHub).
2. Trang chủ → **Add New** → **Project**.
3. Trong **Import Git Repository**, chọn repo **GitHub của bạn** (ví dụ `ten-ban/daop-movie`). Nếu chưa thấy, bấm **Configure** để kết nối GitHub và cấp quyền truy cập repo.
4. Bấm **Import** (chưa cần đổi tên project; có thể đổi sau trong Settings).

---

### Bước 5.2: Cấu hình Build (Framework Preset, Root, Install, Build, Output)

Trên màn hình **Configure Project**:

1. **Framework Preset:** chọn **Other** (hoặc **Vite** nếu có, vì admin dùng Vite; nếu chọn Vite có thể Vercel tự điền Build/Output — khi đó chỉ cần sửa **Root Directory** và **Install** như dưới đây).

2. **Root Directory:**  
   - Để **trống** (hoặc `.`) để Vercel dùng **root của repo**.  
   - Cần root repo vì thư mục `api/` nằm ở root; nếu đặt Root = `admin` thì sẽ không có `/api/*`.

3. **Build and Output Settings** — repo đã có file **vercel.json** ở root với Install/Build/Output đúng. Giữ **Root Directory** trống; nếu Dashboard có override Build/Install/Output thì có thể xóa để dùng `vercel.json`:
   - **Install Command:** `npm install && cd admin && npm install`
   - **Build Command:** `cd admin && npm run build`
   - **Output Directory:** `admin/dist`

4. **Development Command:** có thể để mặc định hoặc `cd admin && npm run dev`.

5. Bấm **Environment Variables** (bước tiếp) hoặc **Deploy** nếu muốn thêm biến môi trường sau.

---

### Bước 5.3: Environment Variables — Admin frontend

Cần hai biến để Admin kết nối Supabase Admin (đăng nhập, đọc/ghi cấu hình):

| Name | Value | Ghi chú |
|------|--------|--------|
| `VITE_SUPABASE_ADMIN_URL` | URL project Supabase Admin | Dạng `https://xxxx.supabase.co` (lấy ở Supabase → Settings → API). |
| `VITE_SUPABASE_ADMIN_ANON_KEY` | **Anon (public)** key Supabase Admin | **Không** dùng service_role; chỉ dùng anon key (Supabase → Settings → API → anon public). |

- Thêm từng biến: **Key** = tên, **Value** = giá trị, chọn **Environment** = Production (và Preview nếu cần).
- Tiền tố `VITE_` bắt buộc để Vite nhúng vào bundle frontend.

---

### Bước 5.4: Environment Variables — API trigger build

API `api/trigger-build.ts` khi được gọi sẽ dùng GitHub API để trigger workflow **build-on-demand**. Cần hai biến trong Vercel:

| Name | Value | Bắt buộc | Ghi chú |
|------|--------|----------|--------|
| `GITHUB_TOKEN` | Personal Access Token (classic) | Có | Quyền **repo** (full). Tạo: GitHub → Settings (user) → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token, chọn scope **repo**. Nếu báo "Bad credentials" thì token hết hạn hoặc sai — tạo token mới và cập nhật trên Vercel. |
| `GITHUB_REPO` | `owner/repo` | Có | Ví dụ: `username/daop-movie`. Phải trùng repo chứa workflow **build-on-demand**. |
| `VITE_API_URL` | URL gốc của Admin (vd. `https://xxx.vercel.app`) | Không | Chỉ cần khi chạy Admin **local** (`npm run dev`) để nút Build gọi đúng API. Khi deploy, bỏ qua (dùng relative `/api/`). |

- Thêm `GITHUB_TOKEN` và `GITHUB_REPO` trong Vercel, Environment = Production (và Preview nếu cần).

---

### Bước 5.5: Deploy và kiểm tra

1. Sau khi thêm Environment Variables, bấm **Deploy** (hoặc nếu đã Deploy trước đó thì vào **Deployments** → bấm **Redeploy** với option **Use existing Build Cache** tắt để build lại với env mới).
2. Đợi build xong. Khi thành công:
   - **Admin:** `https://<tên-project>.vercel.app` (trang chủ là giao diện đăng nhập Admin).
   - **API trigger build:** `https://<tên-project>.vercel.app/api/trigger-build` (POST; không GET).
3. Kiểm tra nhanh:
   - Mở URL Admin → đăng nhập bằng tài khoản Supabase Admin đã gán role admin.
   - Trong Admin, nút **Build website** gọi `POST /api/trigger-build` → nếu cấu hình đúng sẽ trả `{ "ok": true, "message": "Build triggered" }` và workflow **build-on-demand** chạy trên GitHub.

---

### Bước 5.6: (Tùy chọn) Chỉ deploy Admin, không dùng API

Nếu bạn **không** cần API trigger build (chỉ cần giao diện Admin):

1. **Settings** → **General** → **Root Directory:** đổi thành `admin`.
2. **Build Command:** `npm run build` (đã ở trong `admin`).
3. **Output Directory:** `dist`.
4. Có thể xóa hoặc không cấu hình `GITHUB_TOKEN`, `GITHUB_REPO`. Khi đó không có route `/api/trigger-build`.

---

**Tóm tắt URL sau khi deploy**

- Admin: `https://<project>.vercel.app`
- API trigger build: `https://<project>.vercel.app/api/trigger-build` (POST)

---

## Bước 6: Chạy build dữ liệu lần đầu

Build tạo ra `public/data/` (movies-light.js, filters.js, actors.js, batches, config JSON).

### Cách 1: Chạy trên máy

```bash
# Trong thư mục gốc dự án
copy .env.example .env
# Mở .env, điền TMDB_API_KEY, SUPABASE_ADMIN_URL, SUPABASE_ADMIN_SERVICE_ROLE_KEY

npm install
npm run build
```

Sau đó commit và push (ít nhất thư mục `public/data`, hoặc toàn bộ):

```bash
git add public/data
git commit -m "Add initial build data"
git push
```

Khi dùng Direct Upload + GitHub Actions, sau khi push cần workflow deploy chạy (hoặc trigger thủ công) để đẩy `public/` lên Pages.

### Cách 2: Dùng GitHub Actions

- Workflow **update-data** (chạy theo lịch hoặc **Run workflow** thủ công) sẽ chạy `npm run build` với secrets, rồi commit + push thay đổi.
- Cần đảm bảo đã thêm đủ secrets (TMDB, Supabase Admin, …) như bước 3.

Sau khi có `public/data` trên nhánh `main`, deploy lại Pages (tự động nếu đã cấu hình) để site dùng dữ liệu mới.

---

## Bước 7: Cấu hình Admin và website

1. **Đăng nhập Admin:** Mở URL Vercel của Admin → đăng nhập bằng user Supabase Admin đã gán `role = admin`.
2. **Cài đặt chung (Site Settings):**
   - Tên site, Google Analytics ID, SimpleAnalytics (nếu dùng).
   - **Supabase User URL** và **Supabase User Anon Key** (project Supabase User) → để website đăng nhập và đồng bộ yêu thích/lịch sử.
   - Cảnh báo dưới player: bật/tắt và nội dung.
3. **Lưu** → chạy build lại (local `npm run build` hoặc nút **Build website** trong Admin gọi `/api/trigger-build`). Build sẽ xuất lại `site-settings.json` và các config khác. Sau đó để workflow deploy đẩy `public/` mới lên Pages.

**Nếu Admin không đọc/ghi được dữ liệu (sections, banners, cài đặt trống hoặc lỗi):** Admin cần đăng nhập và RLS phải đúng. (1) Mở `/login`, đăng nhập bằng user Supabase Admin đã gán `role = admin`. (2) Nếu đã đăng nhập mà vẫn trống: chạy `docs/supabase/fix-admin-rls.sql` trong SQL Editor của Supabase Admin (sửa RLS dùng `app_metadata.role`).

**Nếu bấm Build website chạy xong nhưng thay đổi trên Admin không hiện trên site**, kiểm tra lần lượt:

1. **GitHub Actions log**  
   Vào **GitHub** → repo → **Actions** → chạy workflow **Build on demand** mới nhất → mở job **build**:
   - Nếu thấy dòng **"SUPABASE_ADMIN_URL hoặc SUPABASE_ADMIN_SERVICE_ROLE_KEY chưa đặt"** → thêm hai secret này trong **Settings** → **Secrets and variables** → **Actions** (giá trị lấy từ **Supabase Admin** → Settings → API: URL + **service_role** key).
   - Nếu thấy **"Supabase lỗi"** hoặc **"Export config từ Supabase thất bại"** → URL hoặc **service_role** key sai (copy lại từ Supabase, không dùng anon key).
   - Nếu thấy **"Export config từ Supabase OK"** → build đã đọc đúng Supabase; kiểm tra bước sau.

2. **Commit và push**  
   Trong cùng log, bước **Commit and push**:
   - Nếu in **"No changes in public/data"** → có thể config trên Supabase trùng với lần build trước; thử sửa một mục trong Admin (vd. tên site) rồi Build website lại.
   - Nếu báo lỗi **push** (permission denied) → cần token có quyền push (vd. **GH_PAT** trong Secrets).

3. **Deploy**  
   Sau khi push lên **main**, workflow **Deploy to Cloudflare Pages** phải chạy (trigger: push branches main). Vào **Actions** xem deploy có chạy và thành công không. Nếu thiếu **CLOUDFLARE_API_TOKEN** / **CLOUDFLARE_ACCOUNT_ID** thì deploy sẽ lỗi và site không nhận bản mới.

4. **Cache**  
   Trang chủ dùng `build_version.json` để cache-bust config. Nếu vẫn thấy dữ liệu cũ: mở chế độ ẩn danh hoặc Ctrl+F5. Đảm bảo project Pages đang dùng **Direct Upload** (không Connect to Git) để tránh build riêng ghi đè `public/data`.

---

## Bước 8: Domain (tùy chọn)

- **Website:** Trong Cloudflare Pages → project → **Custom domains** → thêm domain (ví dụ: `phim.example.com`). Trỏ DNS theo hướng dẫn.
- **Admin:** Trong Vercel → project Admin → **Settings → Domains** → thêm (ví dụ: `admin.example.com`).
- **SITE_URL:** Khi build, nếu dùng domain thật thì trong env (GitHub Secrets hoặc Cloudflare) đặt `SITE_URL=https://phim.example.com` để sitemap/robots dùng đúng domain.

---

## Bước 9: Tùy chọn bổ sung

- **R2:** Tạo bucket, lấy key (xem `docs/r2/README.md`), thêm secrets R2. Build sẽ upload ảnh WebP lên R2 và cập nhật URL trong dữ liệu.
- **Phim tùy chỉnh (Supabase):** Schema bảng `movies` / `movie_episodes` và seed: `docs/supabase/schema-movies-episodes.sql`. File CSV mẫu cột (tham khảo): `docs/csv-templates/README.md`.
- **Comment nội bộ:** cấu hình D1 + KV + `SUPABASE_JWT_SECRET` theo `docs/comments/README.md`.
- **Capacitor (app Android/iOS/TV):** Luồng đầy đủ trong `docs/capacitor/README.md` (build `public/` → `cap copy` → mở Android Studio / Xcode; cấu hình `webDir` hoặc thư mục `www`).

---

## Tóm tắt thứ tự triển khai

1. Tạo 2 Supabase, chạy SQL, tạo user admin, lấy URL/key.
2. Push code lên GitHub, thêm Secrets (và Variables) cho Actions.
3. Deploy website: Cloudflare Pages bằng **Direct Upload + GitHub Actions**.
4. Deploy Admin + API: Vercel, root repo, build `admin`, cấu hình env (Supabase Admin, GITHUB_TOKEN, GITHUB_REPO).
5. Chạy build dữ liệu lần đầu (local hoặc Actions), push `public/data`, deploy lại Pages nếu cần.
6. Vào Admin, cấu hình Site Settings (Supabase User, tracking, cảnh báo), build lại rồi deploy lại site.
7. (Tùy chọn) Gắn domain, R2, Comments, Capacitor.

Nếu gặp lỗi cụ thể (build, deploy, đăng nhập, sync user…), có thể đối chiếu thêm với `docs/` tương ứng (supabase, cloudflare-pages, vercel, github-actions, r2, comments).
