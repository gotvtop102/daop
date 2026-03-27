# Kiểm tra dự án DAOP – Đối chiếu với DA.txt

Tài liệu đối chiếu từng yêu cầu trong **DA.txt** với hiện trạng mã nguồn.

---

## 1. Tổng quan (mục 1 DA.txt)

| Yêu cầu | Trạng thái | Ghi chú |
|---------|------------|--------|
| Website phim tĩnh, nhanh, SEO, đa thiết bị, Cloudflare Pages | ✅ | public/ static, CSS responsive, meta, _redirects |
| App Android/iOS/Android TV bằng Capacitor | ✅ | app/, docs/capacitor |
| Admin panel riêng, Vercel | ✅ | admin/, api/trigger-build.ts |
| Hai Supabase (User + Admin) | ✅ | docs/supabase, schema SQL |
| Dữ liệu từ OPhim, Google Sheets, TMDB | ✅ | scripts/build.js |
| Hiển thị title + origin_name (Motchill) | ✅ | Card, chi tiết, tìm kiếm |
| Cấu hình động Supabase Admin → JSON tĩnh khi build | ✅ | Build đọc Supabase, ghi public/data/config/ |
| Website chỉ gọi Supabase User (cá nhân) | ✅ | user-sync.js, config supabase_user_url/anon_key |
| Google Analytics, SimpleAnalytics từ Admin | ✅ | main.js inject từ site-settings.json |
| Đồng bộ user localStorage + Supabase (delta sync) | ✅ | user-sync.js, pendingActions, fetchChanges |
| Bình luận nội bộ (Cloudflare Pages + D1 + KV) | ✅ | Trang phim + comments.js, docs/comments |
| GitHub Actions: hàng ngày + on-demand, incremental | ✅ | 3 workflows; --incremental flag (logic đơn giản) |
| Docs đầy đủ | ✅ | docs/: supabase, vercel, cloudflare-pages, r2, google-sheets, comments, github-actions, capacitor, templates |
| File mẫu: Excel, JSON, .env.example | ✅ | docs/templates, config-json-examples, .env.example |

---

## 2. Build script (mục 4.1)

| Yêu cầu | Trạng thái |
|---------|------------|
| OPhim API: /danh-sach/phim-moi phân trang, /phim/{slug} chi tiết, delay 200ms | ✅ |
| Google Sheets (service account) hoặc Excel fallback | ✅ |
| TMDB credits, keywords cho phim có tmdb_id | ✅ |
| Xử lý ảnh: fetch → sharp WebP 80% → upload R2 | ✅ (processImage có; gọi tùy chọn) |
| is_4k từ quality; is_exclusive từ sheet | ✅ |
| Hợp nhất OPhim + custom, movies-light.js đủ trường | ✅ |
| filters.js: genreMap, countryMap, yearMap, typeMap, statusMap, quality4kIds, exclusiveIds | ✅ |
| actors.js: map + names | ✅ |
| Batch 100 phim, batch_{start}_{end}.js, đủ episodes/cast/director/keywords | ✅ |
| Supabase Admin: server_sources, ad_banners, homepage_sections, site_settings, static_pages, donate_settings | ✅ |
| Lọc banner theo start_date, end_date | ✅ (đã bổ sung) |
| Xuất JSON config vào public/data/config/ | ✅ |
| sitemap.xml, robots.txt | ✅ |
| last_modified.json, last_build.json | ✅ (đã bổ sung last_modified) |

---

## 3. Website chính (mục 4.2)

| Yêu cầu | Trạng thái |
|---------|------------|
| Cấu trúc thư mục public/ đúng DA.txt | ✅ (the-loai, quoc-gia, nam-phat-hanh, chu-de, dien-vien, phim) |
| Trang chủ: homepage-sections.json, banners.json, section type/genre/status | ✅ |
| Card phim: title + origin_name | ✅ |
| CategoryPage: baseFilter, filter năm/thể loại/quốc gia/4K/độc quyền, pagination | ✅ |
| Các trang phim-bo, phim-le, shows, hoat-hinh, 4K, đang chiếu, sắp chiếu, chiếu rạp | ✅ |
| Trang chi tiết: poster, title, origin_name, năm, thể loại, quốc gia, mô tả, diễn viên (link), đạo diễn | ✅ (diễn viên link → /dien-vien/slug.html) |
| Lịch chiếu khi status theater + showtimes | ✅ |
| Danh sách tập, nguồn server, click mở player | ✅ |
| Nút Yêu thích, Nút Tiếp tục xem | ✅ (đã bổ sung) |
| Phim tương tự, hệ thống comment nội bộ | ✅ |
| Tìm kiếm FlexSearch (title + origin_name) | ✅ |
| Trang giới thiệu, hướng dẫn app, donate từ config | ✅ |
| Footer: Donate, "Trường Sa, Hoàng Sa...", TMDB attribution | ✅ (đã bổ sung TMDB) |
| user-sync: localStorage, addFavorite, removeFavorite, updateWatchProgress, sync, pendingActions | ✅ |
| Supabase User URL/Key từ site-settings (sau build) | ✅ (đã bổ sung) |
| Player: cảnh báo từ site-settings/phim, lưu tiến trình | ✅ |
| PWA manifest + sw.js | ✅ |
| Redirect /dien-vien → /dien-vien/ | ✅ (_redirects 302) |

---

## 4. Admin Panel (mục 4.3)

| Yêu cầu | Trạng thái |
|---------|------------|
| React + TypeScript, Vite, Ant Design | ✅ |
| React Hook Form + Yup | ⚠️ | Có dependency, đang dùng Ant Design Form (chấp nhận được) |
| Kết nối Supabase Admin, RLS admin | ✅ |
| Dashboard: thống kê, audit log, nút Build website | ✅ |
| Quảng cáo: Banner (list, bật/tắt) | ✅ | CRUD đầy đủ + upload R2: chưa (chỉ list + toggle) |
| Pre-roll | ⚠️ | Chưa trang quản lý ad_preroll |
| Homepage Sections (list, sort_order) | ✅ | Kéo thả sắp xếp + form thêm/sửa: chưa |
| Slider, Theme Settings | ⚠️ | Chưa |
| Server sources (list, bật/tắt) | ✅ | CRUD add/edit/delete: chưa |
| Cài đặt chung: site name, tracking, Supabase User URL/Key, Player & cảnh báo | ✅ (đã thêm player_warning_*, supabase_user_*) |
| Donate: target, current, PayPal, bank, crypto | ✅ | Form có target, currency, current, paypal; bank/crypto có trong schema |
| Static pages (giới thiệu, hướng dẫn app), APK/TestFlight | ✅ | WYSIWYG chưa (chỉ textarea) |
| Audit Logs | ✅ |
| Webhook trigger build (api/trigger-build) | ✅ |

---

## 5. Supabase, docs, file mẫu

| Yêu cầu | Trạng thái |
|---------|------------|
| Schema User: profiles, favorites, watch_history, user_changes, RLS | ✅ docs/supabase/schema-user.sql |
| Schema Admin: ad_banners, ad_preroll, homepage_sections, server_sources, site_settings, static_pages, donate_settings, player_settings, audit_logs, RLS | ✅ docs/supabase/schema-admin.sql |
| docs/supabase, vercel, cloudflare-pages, github-actions, capacitor, google-sheets, templates | ✅ |
| docs/r2, docs/comments | ✅ (đã bổ sung) |
| custom_movies_template.xlsx | ⚠️ | Hướng dẫn tạo trong docs/templates; không tạo file nhị phân |
| config-json-examples | ✅ |
| .env.example | ✅ |

---

## 6. Các chỉnh sửa lần kiểm tra gần nhất

- **Build:** Lọc banner theo `start_date`/`end_date`; ghi thêm `last_modified.json`; mặc định site-settings có `supabase_user_url`, `supabase_user_anon_key`, `player_warning_enabled`, `player_warning_text`.
- **Trang chi tiết:** Nút Yêu thích (toggle), Nút Tiếp tục xem (từ watchHistory); diễn viên hiển thị dạng link sang `/dien-vien/[slug].html`; load `actors.js` trên trang phim.
- **Footer:** TMDB attribution + link Donate trên trang phim và trang chủ.
- **Frontend:** Đọc `supabase_user_url`, `supabase_user_anon_key` từ site-settings; user-sync dùng hai biến này.
- **_redirects:** Thêm `/dien-vien` → `/dien-vien/` 302.
- **Admin Cài đặt chung:** Supabase User URL/Key, bật cảnh báo player, nội dung cảnh báo.
- **Docs:** Thêm `docs/r2/README.md`, `docs/comments/README.md`.

---

## 7. Chạy nhanh

1. `npm install` (gốc) → `cd admin` → `npm install` → `cd ..`
2. Copy `.env.example` → `.env`; admin có `.env` với `VITE_SUPABASE_ADMIN_*`
3. `npm run build`
4. `npx serve public -p 3000` (website) và `cd admin` → `npm run dev` (admin)

Chi tiết: **README.md** ở thư mục gốc.
