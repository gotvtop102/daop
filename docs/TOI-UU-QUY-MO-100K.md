# Theo dõi tối ưu quy mô ~100k phim

File này ghi lại phân tích kiến trúc hiện tại, rủi ro khi scale, và thứ tự ưu tiên. Cập nhật khi hoàn thành từng hạng mục hoặc khi quyết định thay đổi hướng.

**Cập nhật lần cuối:** 2026-03-28

---

## Bối cảnh

- Mục tiêu: site static (batch + index + search) với **~100k phim** vẫn build được, deploy được, và trải nghiệm người dùng chấp nhận được.
- **100k bản ghi** = tải lớn về **số file, dung lượng repo/CDN, thời gian build, băng thông**.
- **Nguồn OPhim** có thể không đủ 100k trong một list “phim mới”; catalog lớn thường đến từ **nhiều lần build incremental**, merge, hoặc phim custom / nguồn khác. Cần tách: *giới hạn API nguồn* vs *giới hạn kiến trúc site*.

---

## Rủi ro / nút thắt trong code (scripts + client)

### 1. `idIndex` — đã chia part theo `SHARD_MAX_BYTES` (giống slug)

- Build: `splitObjectBySize` trên mỗi shard 2 ký tự; ghi `public/data/index/id/meta.json` (`parts[shardKey]`); file `id/{key}.js` hoặc `id/{key}.0.js` … `id/{key}.N.js`.
- Client: `loadIdIndexMetaOnce()` + `Promise.all` load đủ part trước khi đọc `window.DAOP.idIndex[key]`.
- Nếu deploy cũ không có `meta.json`: client coi `parts = 1` và chỉ tải `{key}.js` (tương thích).

### 2. Search prefix — đã giảm payload + tùy chọn giới hạn token (P1 một phần)

- Build: bỏ `type` khỏi item trong `search/prefix` (không dùng khi render thẻ); lọc token theo `SEARCH_PREFIX_MIN_TOKEN_LEN` (mặc định 2); tùy chọn `SEARCH_PREFIX_MAX_TOKENS` (0 = không cắt).
- `public/data/search/prefix/meta.json` có thêm `searchOpts` (ghi nhận cấu hình).
- **Nếu vẫn quá lớn:** tăng `SHARD_MAX_BYTES` / giảm token; hoặc **search ngoài static** (Supabase FTS, Meilisearch, Typesense…) — cần API + đồng bộ dữ liệu, không nằm trong thay đổi hiện tại.

### 3. Batch — số file và TMDB_ONLY (P1)

- `BASE_BATCH_SIZE` / `BATCH_MAX_BYTES` → hàng trăm–nghìn file `batch_*.js` / `tmdb_batch_*.js`. Lazy load ổn nhưng **deploy/clone Git** nặng nếu commit hết.
- TMDB_ONLY yêu cầu `batch-windows` khớp tổng phim — pipeline 2 pha phải nhất quán.

### 4. Client fallback `batchSize` 120 (`public/js/main.js`)

- Khi không có `row.b`/`row.t`, fallback theo batch cố định có thể **lệch** nếu cửa sổ batch không đều 120.
- **Hướng:** luôn có pointer batch trong idIndex; tránh phụ thuộc fallback.

### 5. Ingest: OPhim + TMDB + RAM build

- OPhim: detail tuần tự + delay → wall-clock lớn khi nhiều phim mới.
- TMDB: nhiều request/phim + person → tổng request khổng lồ nếu full enrich.
- Load batch cũ vào `Map` khi merge → RAM tăng theo quy mô.

---

## Hạ tầng & vận hành

- **Git:** tránh phình repo — artifact / không commit full `public/data` nếu scale lớn (hoặc LFS có chủ đích).
- **CDN (Pages/R2):** cache header; cân bằng kích thước batch vs số request.
- **CI:** timeout (GitHub thường ~6h), tách job (Core / TMDB / ảnh / index).
- **Supabase:** nếu sync 100k dòng — batch upsert, index DB.

---

## Thứ tự ưu tiên (checklist tiến độ)

| ID | Ưu tiên | Nội dung | Trạng thái |
|----|---------|----------|------------|
| P0-1 | P0 | Tách/chia nhỏ `idIndex` hoặc tăng bucket; cập nhật client load đúng part | ☑ 2026-03-28 — `writeIndexAndSearchShards` + `index/id/meta.json` + `main.js` (`loadIdIndexMetaOnce`, tải `key.js` hoặc `key.N.js`). Tương thích cũ: không có `meta.json` thì chỉ tải `key.js`. |
| P0-2 | P0 | Chiến lược dữ liệu: incremental, không kỳ vọng một lần build full 100k từ một list API ngắn | ☐ Chưa |
| P1-1 | P1 | Giảm chi phí search (payload / thiết kế) hoặc search ngoài static | ☐ Chưa |
| P1-2 | P1 | CI: tách pha, artifact, chiến lược không commit toàn bộ `public/data` | ☐ Chưa |
| P2-1 | P2 | Tune `BASE_BATCH_SIZE`, `BATCH_MAX_BYTES`, `SHARD_MAX_BYTES` theo đo thực tế | ☐ Chưa |
| P2-2 | P2 | Đo thời gian từng bước build (OPhim / TMDB / ghi index) | ☐ Chưa |

**Ghi chú tiến độ:** đổi `☐ Chưa` → `☑ YYYY-MM-DD` hoặc mô tả ngắn khi xong.

---

## Biến môi trường liên quan (tham khảo)

| Biến | Ý nghĩa ngắn |
|------|----------------|
| `BASE_BATCH_SIZE` | Kích thước batch cơ sở (mặc định 120) |
| `BATCH_MAX_BYTES` | Trần byte mỗi file batch core |
| `SHARD_MAX_BYTES` | Trần byte mỗi file shard (slug, **idIndex**, search prefix) |
| `SEARCH_PREFIX_MIN_TOKEN_LEN` | Không đưa token ngắn hơn (mặc định 2) vào phân phối prefix |
| `SEARCH_PREFIX_MAX_TOKENS` | Tối đa số từ/phim cho prefix (0 = không giới hạn) |
| `OPHIM_*` | Giới hạn trang/phạm vi fetch OPhim |
| `TMDB_CONCURRENCY`, `TMDB_API_KEY(S)` | Song song + xoay key khi 429 |
| `SKIP_TMDB` / `TMDB_ONLY` / `FORCE_TMDB` | Tách pha TMDB |

---

## Liên kết code chính

- `scripts/build.js` — `writeBatches`, `writeIndexAndSearchShards`, OPhim/TMDB.
- `public/js/main.js` — `getBatchPathAsync`, `idIndex`, `batchSize` fallback.

---

## Ghi chú phiên làm việc

_(Thêm dòng dưới đây mỗi khi họp / quyết định quan trọng.)_

- 2026-03-28: Khởi tạo file từ phân tích quy mô ~100k (idIndex, search, batch, CI, ingest).
- 2026-03-28: P0-1 — idIndex split + `index/id/meta.json` + cập nhật `public/js/main.js`; `validateBuildOutputs` + `loadIdIndexShardMapFromDisk` trong `scripts/build.js`.
- 2026-03-28: P1-1 (partial) — search prefix: bỏ `type` khỏi item, `SEARCH_PREFIX_MIN_TOKEN_LEN` / `SEARCH_PREFIX_MAX_TOKENS`, `searchOpts` trong `search/prefix/meta.json`.
