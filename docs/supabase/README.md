# Supabase — tất cả thứ cần tạo & chú thích

**Mục lục tổng:** [../README.md](../README.md).

DAOP dùng **hai project Supabase tách biệt** (không gộp một project):

| Project | Đối tượng dùng | Key nào xuất hiện ở đâu |
|---------|----------------|-------------------------|
| **User** | Khách xem phim (web), comment (verify JWT), import/export bulk qua API | **Anon** → Admin *Cài đặt chung* → build ra site; **JWT Secret** → Cloudflare Pages (comment); **service_role** → optional chỉ Vercel `/api/supabase-user` |
| **Admin** | Admin Panel, script `npm run build` / GitHub Actions | **Anon** → Vercel `VITE_SUPABASE_ADMIN_*`; **service_role** → GitHub Secrets (không đưa lên frontend) |

Luồng triển khai tổng thể: [../TRIEN-KHAI.md](../TRIEN-KHAI.md) (Bước 1), checklist nhanh: [../BAT-DAU-NHANH.md](../BAT-DAU-NHANH.md) (Bước 3).

---

## 1. Chuẩn bị trên supabase.com

| Việc | Chú thích |
|------|-----------|
| Tạo tài khoản [supabase.com](https://supabase.com) | Miễn phí có giới hạn; chọn **region** gần người dùng. |
| Tạo **hai** project riêng | Ví dụ tên: `daop-user`, `daop-admin` — mỗi project có **URL và bộ key riêng**. |
| Lưu **mật khẩu database** | Chỉ dùng khi cần kết nối Postgres trực tiếp; hầu hết thao tác qua Dashboard + API. |

---

## 2. Project Supabase **User** (khách / auth / dữ liệu cá nhân)

### 2.1. Việc cần làm trong Dashboard

| Bước | Nội dung |
|------|----------|
| 1 | **SQL Editor** → chạy toàn bộ **`schema-user.sql`**: tạo `profiles`, `favorites`, `watch_history`, `user_changes` + RLS. |
| 2 | **Authentication → Providers:** bật **Email**; tùy chọn **Google** (OAuth). |
| 3 | **Authentication → URL configuration:** nếu dùng magic link/OAuth, thêm **Site URL** / **Redirect URLs** đúng domain website. |
| 4 | **Settings → API:** copy **Project URL**, **anon public**, **JWT Secret** (JWT dùng cho comment trên Cloudflare — [../cloudflare/README.md](../cloudflare/README.md)). |

### 2.2. File SQL (User)

| File | Khi nào chạy |
|------|----------------|
| `schema-user.sql` | **Bắt buộc** lần đầu, trong đúng project **User**. |

### 2.3. Dữ liệu key đi đâu

| Giá trị | Nơi cấu hình |
|---------|----------------|
| URL + **anon** | **Admin Panel** → *Cài đặt chung* (Supabase User) → sau **Build website** xuất vào `public/data/config` cho site tĩnh. |
| **JWT Secret** | **Cloudflare Pages** → Environment Variables → `SUPABASE_JWT_SECRET` (hệ thống comment). |
| **service_role** (User) | Chỉ nếu dùng **`/api/supabase-user`** trên Vercel — [../env/vercel.env.example](../env/vercel.env.example). **Không** đưa vào GitHub Actions (workflows không đọc). |

---

## 3. Project Supabase **Admin** (quản trị / cấu hình site)

### 3.1. Việc cần làm trong Dashboard

| Bước | Nội dung |
|------|----------|
| 1 | **SQL Editor** → chạy **`schema-admin.sql`**: tạo `ad_banners`, `ad_preroll`, `homepage_sections`, `server_sources`, `site_settings`, `static_pages`, `donate_settings`, audit, … |
| 2 | **Authentication → Users → Add user** (email + mật khẩu) — tài khoản đăng nhập Admin. |
| 3 | **SQL Editor** — gán `role: admin` trong `raw_app_meta_data` cho đúng email user vừa tạo (xem đoạn SQL mẫu bên dưới). |
| 4 | **Settings → API:** **URL** + **anon** → Vercel; **service_role** → GitHub Secrets `SUPABASE_ADMIN_*`. |

**Gán role admin (mẫu):**

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'email-admin-cua-ban@example.com';
```

### 3.2. Các file SQL bổ sung (project **Admin**)

| File | Mục đích |
|------|----------|
| **`fix-admin-rls.sql`** | **Khi** Admin đã đăng nhập nhưng không đọc/ghi được dữ liệu — chỉnh RLS theo `app_metadata.role`. |
| **`seed-static-pages.sql`** | **Tùy chọn** — chèn nội dung mẫu cho `static_pages` (liên hệ, điều khoản, …). |
| **`audit-logs-triggers.sql`** | **Tùy chọn** — trigger ghi `audit_logs` khi thay đổi bảng cấu hình. |
| **`migrate-static-pages-apk-tv-link.sql`** | **Tùy chọn** — thêm cột `apk_tv_link` nếu schema cũ thiếu. |
| **`migrate-donate-settings-add-methods.sql`** | **Khi** bảng `donate_settings` đã có từ trước nhưng **thiếu cột `methods`** (jsonb) — tránh lỗi export build / đồng bộ Admin; script `build.js` vẫn fallback select không `methods` + ghi `methods` mặc định vào `donate.json` nếu chưa migration. |

Chạy **`schema-admin.sql` trước**; các file migrate/seed/fix sau tùy nhu cầu.

### 3.3. Dữ liệu key đi đâu

| Giá trị | Nơi cấu hình |
|---------|----------------|
| URL + **anon** | **Vercel** → `VITE_SUPABASE_ADMIN_URL`, `VITE_SUPABASE_ADMIN_ANON_KEY`. |
| URL + **service_role** | **GitHub** → Secrets `SUPABASE_ADMIN_URL`, `SUPABASE_ADMIN_SERVICE_ROLE_KEY` (build + workflow). |
| **Không** đưa **service_role** lên | Frontend, `VITE_*`, hay commit Git. |

---

## 4. Bảng tổng hợp “tạo trên Supabase”

| STT | Việc | Project |
|-----|------|---------|
| 1 | Tài khoản + **project User** + **project Admin** | — |
| 2 | Chạy **`schema-user.sql`** | User |
| 3 | Bật Auth (Email / Google), cấu hình URL nếu cần | User |
| 4 | Chạy **`schema-admin.sql`** | Admin |
| 5 | Tạo user + SQL gán **`role: admin`** | Admin |
| 6 | (Tùy chọn) `fix-admin-rls`, seed, audit, migrate cột | Admin |
| 7 | Copy key → Vercel, GitHub, Admin Site Settings, Cloudflare (JWT) | Xem mục 2.3 & 3.3 |

---

## 5. Liên kết nhanh

- Mẫu env Vercel (gồm Supabase User cho API): [../env/vercel.env.example](../env/vercel.env.example)
- GitHub (Secrets Actions): [../github/README.md](../github/README.md) — mẫu tên biến [../env/github.env.example](../env/github.env.example)
- Vercel (Admin UI): [../vercel/README.md](../vercel/README.md)
- Cloudflare (JWT comment): [../cloudflare/README.md](../cloudflare/README.md)

---

## 6. Gợi ý xử lý sự cố

- **Đăng nhập Admin được nhưng bảng trống / lỗi RLS:** chạy **`fix-admin-rls.sql`** trong SQL Editor project **Admin**, rồi thử lại. Chi tiết thêm: [../TRIEN-KHAI.md](../TRIEN-KHAI.md) (Bước 7).
- **Build trên GitHub không xuất config từ Admin:** kiểm tra đủ `SUPABASE_ADMIN_URL` + `SUPABASE_ADMIN_SERVICE_ROLE_KEY` (đúng **service_role**, không nhầm anon).
