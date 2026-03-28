# Tài liệu DAOP — đọc theo lộ trình

## Bạn cần làm gì?

| Mục tiêu | Bắt đầu từ đâu |
|----------|----------------|
| **Người mới — cài đặt 5 bước** (tài khoản → GitHub → Supabase → Vercel → Cloudflare) | [BAT-DAU-NHANH.md](./BAT-DAU-NHANH.md) |
| **Chạy thử trên máy** (build site, xem local, chạy Admin dev) | [README ở thư mục gốc](../README.md) — các bước 1–6 |
| **Đưa lên môi trường thật** (Cloudflare + Vercel + Supabase + GitHub Actions) | [TRIEN-KHAI.md](./TRIEN-KHAI.md) — làm **theo số Bước 1 → 9** |
| **Sửa lỗi deploy / build** | [vercel/TROUBLESHOOTING.md](./vercel/TROUBLESHOOTING.md), log GitHub Actions, và phần xử lý sự cố trong TRIEN-KHAI (Bước 7) |

---

## Thứ tự gợi ý (khớp BAT-DAU-NHANH)

1. **Bước 1:** Chuẩn bị tài khoản + key (bảng trong [BAT-DAU-NHANH.md](./BAT-DAU-NHANH.md)).
2. **Bước 2:** GitHub → [github/README.md](./github/README.md)
3. **Bước 3:** Supabase → [supabase/README.md](./supabase/README.md)
4. **Bước 4:** Vercel (project, env, API) → [vercel/README.md](./vercel/README.md)
5. **Bước 5:** Cloudflare (Pages, token, R2, comment…) → [cloudflare/README.md](./cloudflare/README.md)
6. Sau đó: build dữ liệu (Actions hoặc `npm run build`), cấu hình Admin, deploy `public/`.
7. **Tùy chọn:** R2, Google Sheets, Comments, app — danh mục bên dưới

---

## Danh mục theo chủ đề

| Thư mục | Nội dung |
|---------|----------|
| **supabase/** | **Gom:** 2 project, Auth, SQL, key (anon/service_role/JWT), RLS, file migrate/seed |
| **cloudflare/** | **Gom:** Pages, API Token, Account ID, R2, D1/KV comment, domain |
| **cloudflare-pages/** | Tóm tắt deploy Pages → [cloudflare/README.md](./cloudflare/README.md) |
| **vercel/** | **Gom:** tạo project, Root Directory, `vercel.json`, env, bảng `/api/*`, domain |
| **github/** | **Gom:** tài khoản, repo, Actions, Secrets/Variables, PAT, danh sách workflow |
| **github-actions/** | Chi tiết workflow + webhook Admin → [github/README.md](./github/README.md) |
| **r2/** | Ảnh trên Cloudflare R2 (tùy chọn) |
| **google-sheets/** | Phim custom từ Google Sheets |
| **comments/** | Bình luận (D1 + KV) |
| **capacitor/** | Đóng gói app Android / iOS / Android TV |
| **templates/** | Mẫu Excel, JSON |
| **config-json-examples/** | Ví dụ cấu hình JSON |
| **env/** | Mẫu biến: [vercel.env.example](./env/vercel.env.example), [github.env.example](./env/github.env.example) |

Tài liệu khác: **BAT-DAU-NHANH.md** (checklist nhanh), **TRIEN-KHAI.md** (luồng chính), **KIEM-TRA-DU-AN.md** (đối chiếu yêu cầu), **PHAN-CON-THIEU.md**, **custom-movies-template.md**.

---

## Gợi ý cách đọc

- Người mới có code: chỉ cần [BAT-DAU-NHANH.md](./BAT-DAU-NHANH.md) (5 bước); mở [TRIEN-KHAI.md](./TRIEN-KHAI.md) khi cần hướng dẫn dài hoặc xử lý sự cố.
- Đọc **một lần** [TRIEN-KHAI.md](./TRIEN-KHAI.md) để nắm toàn cảnh nếu bạn thích đọc trước làm sau.
- File **README gốc** tập trung vào lệnh trên máy; **TRIEN-KHAI** tập trung vào tài khoản dịch vụ và cấu hình server — hai tài liệu bổ sung nhau, không trùng hoàn toàn.
