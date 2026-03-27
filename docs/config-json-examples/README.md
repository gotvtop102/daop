# Ví dụ cấu hình JSON (public/data/config/)

Các file trong thư mục này là **mẫu định dạng** cho output của `scripts/build.js` (xuất ra `public/data/config/`). Build đọc dữ liệu từ Supabase Admin và ghi các file tương ứng; khi không kết nối Supabase sẽ dùng default tương tự các file `*.example.json` ở đây.

## Danh sách file config

| File | Mô tả |
|------|--------|
| `site-settings.json` | Cài đặt chung: tên site, logo, favicon, analytics, social, footer, theme, slider |
| `homepage-sections.json` | Các section trang chủ: title, source_type, source_value, limit_count, display_type, more_link, is_active. Nguồn mặc định: `config/default-sections.json` (dùng chung cho build và Admin) |
| `banners.json` | Banner quảng cáo: image_url, link_url, position, priority, start_date, end_date |
| `server-sources.json` | Nguồn server phát: name, slug, base_url, is_active |
| `player-settings.json` | Cài đặt player: available_players, default_player, warning_* |
| `preroll.json` | Pre-roll ads: video_url, duration, skip_after, weight |
| `static-pages.json` | Trang tĩnh: about, app_guide, apk_link, apk_tv_link, testflight_link |
| `donate.json` | Cài đặt donate: target_amount, paypal_link, bank_info |

## Cách dùng

- Tham khảo `*.example.json` để biết cấu trúc khi tự chỉnh tay hoặc viết script.
- Config thực tế do build tạo ra từ Supabase; không cần copy file mẫu vào `public/data/config/` trừ khi chạy build không có Supabase (khi đó build ghi default).
- **Sections mặc định:** `config/default-sections.json` là nguồn chung cho build script và trang Admin Homepage Sections. Chỉnh file này để đồng bộ sections mặc định ở mọi nơi.
