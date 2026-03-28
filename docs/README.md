# Tài liệu DAOP — mục lục

Một repo có **nhiều lớp** (GitHub, Supabase, Vercel, Cloudflare, tùy chọn R2/comment/app). Trang này là **điểm vào duy nhất**: chọn lộ trình hoặc chủ đề, rồi mở file được liệt kê — tránh đọc lặp giữa BAT-DAU-NHANH, TRIEN-KHAI và các README con.

---

## 1. Chọn lộ trình (chỉ đọc một nhánh)

| Nhu cầu | Bắt đầu | Nội dung |
|--------|---------|----------|
| **Checklist nhanh** (5 bước: tài khoản → GitHub → Supabase → Vercel → Cloudflare) | [BAT-DAU-NHANH.md](./BAT-DAU-NHANH.md) | Bảng key, secret tối thiểu, không chi tiết từng màn hình |
| **Triển khai đầy đủ + tra cứu** (Bước 1–9, domain, tùy chọn) | [TRIEN-KHAI.md](./TRIEN-KHAI.md) | Cùng thứ tự với checklist nhưng có SQL, env, gỡ lỗi |
| **Chạy trên máy** (npm, build, Admin dev) | [README ở thư mục gốc](../README.md) | Lệnh local, không thay cho hướng dẫn tài khoản |

**Quan hệ giữa các file:** `BAT-DAU-NHANH` = phiên bản rút gọn; `TRIEN-KHAI` = phiên bản đầy đủ; các thư mục `docs/*/` = **gom theo dịch vụ** (chi tiết một phần của pipeline).

---

## 2. Mục lục theo chủ đề (một cửa)

| Chủ đề | File | Ghi chú |
|--------|------|---------|
| **GitHub** — repo, Actions, Secrets/Variables, PAT, workflow | [github/README.md](./github/README.md) | Kèm [github-actions/README.md](./github-actions/README.md) |
| **Supabase** — 2 project, SQL, JWT, RLS | [supabase/README.md](./supabase/README.md) | JWT User dùng cho comment trên Pages |
| **Vercel** — Admin + API, `vercel.json`, env | [vercel/README.md](./vercel/README.md) | Sự cố build: [vercel/TROUBLESHOOTING.md](./vercel/TROUBLESHOOTING.md) |
| **Cloudflare** — Account, token, Pages, R2, D1/KV, biến Pages | [cloudflare/README.md](./cloudflare/README.md) | Tóm deploy ngắn: [cloudflare-pages/README.md](./cloudflare-pages/README.md) |
| **Comment (D1 + KV + Functions)** | [comments/README.md](./comments/README.md) | Gồm `COMMENTS_ADMIN_SECRET`, export/import |
| **R2** (ảnh) | [r2/README.md](./r2/README.md) | Tùy chọn |
| **CSV mẫu cột phim** (tham khảo / legacy) | [google-sheets/README.md](./google-sheets/README.md) | Không còn build từ Sheets |
| **Capacitor** (Android / iOS / TV) | [capacitor/README.md](./capacitor/README.md) | Tùy chọn |
| **Mẫu JSON / Excel** | [config-json-examples/README.md](./config-json-examples/README.md), [templates/README.md](./templates/README.md) | |
| **Phim custom (template)** | [custom-movies-template.md](./custom-movies-template.md) | |

---

## 3. Biến môi trường (mẫu)

| Nơi cấu hình | File mẫu |
|--------------|----------|
| GitHub Actions / Secrets | [env/github.env.example](./env/github.env.example) |
| Vercel | [env/vercel.env.example](./env/vercel.env.example) |

Không copy giá trị thật vào Git; chỉ đối chiếu tên biến.

---

## 4. Xử lý sự cố (gom link)

| Vấn đề | Xem |
|--------|-----|
| Build / deploy Vercel | [vercel/TROUBLESHOOTING.md](./vercel/TROUBLESHOOTING.md) |
| Pipeline tổng thể, domain, build dữ liệu | [TRIEN-KHAI.md](./TRIEN-KHAI.md) (đặc biệt các bước cuối và phần gợi ý) |
| Export/import comment, `COMMENTS_ADMIN_SECRET` | [comments/README.md](./comments/README.md) mục **9** |
| Log GitHub Actions | Tab Actions trên repo + secret đúng theo [env/github.env.example](./env/github.env.example) |

---

## 5. Gợi ý cách đọc

- **Lần đầu:** [BAT-DAU-NHANH.md](./BAT-DAU-NHANH.md) → khi kẹt bước nào, mở đúng hàng trong **mục 2** (ví dụ Cloudflare → `cloudflare/README.md`).
- **Muốn một lượt đủ:** [TRIEN-KHAI.md](./TRIEN-KHAI.md) một lần, bookmark **mục 2** để tra nhanh.
- **Chỉ sửa Admin / API Vercel:** không cần đọc hết Cloudflare; ngược lại, chỉ deploy Pages thì ưu tiên `cloudflare/README.md` + workflow deploy.
