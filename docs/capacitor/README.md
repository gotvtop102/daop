# Capacitor — App Android / iOS / Android TV

**Mục lục tổng:** [../README.md](../README.md).

Website tĩnh nằm trong `public/`. Capacitor bọc WebView quanh bản build đó. **Nên triển khai website + Admin ổn định trước**, rồi mới đóng gói app.

---

## Chuẩn bị

- **Node.js** 18+ (cùng môi trường với `npm run build` ở root).
- **Android:** [Android Studio](https://developer.android.com/studio) (SDK, emulator hoặc máy thật).
- **iOS (chỉ trên macOS):** Xcode.
- Đã chạy **`npm run build`** ở thư mục gốc để `public/` đủ file (HTML, `public/data/`, v.v.).

---

## Luồng làm việc (5 bước)

1. **Build web** — ở root repo: `npm install` (lần đầu), rồi `npm run build`.
2. **Thêm Capacitor** — trong project app (thường là thư mục `app/` hoặc root tùy cách init): cài gói và `npx cap init` nếu chưa có project native.
3. **Trỏ `webDir`** — trong `capacitor.config.ts`, `webDir` trỏ tới thư mục chứa bản giống `public/` (ví dụ `public`, hoặc `www` sau khi copy).
4. **Đồng bộ file web → native** — `npx cap copy` (và `npx cap sync` khi đổi plugin).
5. **Mở IDE** — `npx cap open android` hoặc `npx cap open ios`, build và cài app như project native thông thường.

---

## Lệnh tham khảo (sau khi đã `cap init`)

```bash
# Ở root: tạo dữ liệu tĩnh
npm run build

# Trong thư mục chứa capacitor.config (ví dụ app/ hoặc root)
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npx cap copy
npx cap open android
```

`webDir` phải trùng thư mục bạn đồng bộ từ `public/`. Cách phổ biến: đặt `webDir: "public"` nếu file `capacitor.config` nằm ở parent của `public/`, hoặc copy `public/*` vào `www/` và đặt `webDir: "www"`.

---

## Android App Links (mở link web bằng app)

Repo có file mẫu [public/.well-known/assetlinks.json](../../public/.well-known/assetlinks.json) (gói `com.daop.phim`, SHA-256 cert). Khi build release:

1. Lấy **SHA-256** của chứng chỉ ký app (debug/release) và cập nhật trong `assetlinks.json` trên **domain** đang host file đó (cùng origin với website).
2. Trong Android Studio, đảm bảo **intent-filter** / **Digital Asset Links** khớp domain và `package_name`.

---

## Android TV

- Thêm **LEANBACK** / category `android.intent.category.LEANBACK_LAUNCHER` trong manifest nếu cần icon trên launcher TV.
- UI web: hỗ trợ **D-pad** (focus, tabindex), tránh chỉ dựa vào hover/chuột.
- Xử lý phím (play/pause, back) trong player nếu cần — tùy `movie-detail`/player hiện tại.

---

## iOS

- Build ký và phân phối qua **TestFlight** / App Store Connect — làm theo hướng dẫn trên [developer.apple.com](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing).

---

## Xem thêm

- Triển khai website: [TRIEN-KHAI.md](../TRIEN-KHAI.md) (Bước 9 — tùy chọn Capacitor).
- Cấu trúc repo: [README gốc](../../README.md) (mục cấu trúc dự án).
