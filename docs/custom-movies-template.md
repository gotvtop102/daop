# Template Excel import phim tùy chỉnh

**Mục lục tổng:** [README.md](./README.md).

Build đọc phim tùy chỉnh từ **Supabase** (bảng `movies` / `movie_episodes`, khi cấu hình `SUPABASE_ADMIN_URL` + service role) hoặc từ file **custom_movies.xlsx** tại thư mục gốc khi không dùng Supabase. File mẫu có thể tạo bằng:

```bash
node scripts/generate-custom-movies-template.js
```

Sẽ tạo ra **custom_movies_template.xlsx**. Đổi tên thành `custom_movies.xlsx` và điền dữ liệu, sau đó chạy `npm run build`.

## Cấu trúc file

### Worksheet `movies` (trong file Excel)

| Cột | Bắt buộc | Mô tả |
|-----|----------|--------|
| id | Không | **Dãy số duy nhất** (1, 2, 3...) – dùng làm `movie_id` ở tab episodes. Nếu trống, build tự sinh id. **Đồng bộ với episodes.movie_id.** |
| title | Có | Tên phim |
| slug | Không | Tùy chọn. Nếu trống, build tạo từ title; nếu nhiều phim trùng tên → slug trùng → build tự thêm -2, -3... để không trùng. |
| origin_name | Không | Tên gốc |
| type | Không | single / series / tvshows / hoathinh (mặc định: single) |
| year | Không | Năm |
| genre | Không | Thể loại, cách nhau bằng dấu phẩy (vd: Hành động, Tình cảm) |
| country | Không | Quốc gia, cách nhau bằng dấu phẩy |
| language | Không | Ngôn ngữ (vd: Vietsub) |
| quality | Không | HD, 4K, ... (có 4K → is_4k = true) |
| episode_current | Không | Số tập hiện tại (vd: 6 hoặc "Hoàn tất (6/6)") |
| thumb_url hoặc thumb | Không | URL ảnh thumb |
| poster_url hoặc poster | Không | URL ảnh poster. Nếu trống, build dùng thumb; nếu có tmdb_id và TMDB_API_KEY, build lấy poster từ TMDB. |
| description hoặc content | Không | Mô tả |
| status | Không | current / upcoming |
| chieurap | Không | 0/1 hoặc true/false. `true` = phim chiếu rạp |
| showtimes | Không | Thông tin suất chiếu (tùy dùng) |
| is_exclusive | Không | 0/1 hoặc true/false |
| tmdb_id | Không | ID TMDB (số) |

Tên cột không phân biệt hoa thường; dấu gạch dưới có thể thay bằng space (vd. `origin name`).

### Worksheet `episodes` (tùy chọn)

Dùng để gán tập phim và nguồn phát cho từng phim.

| Cột | Mô tả |
|-----|--------|
| movie_id | **Đồng bộ với movies:** điền **đúng số id** của phim (vd. 1, 2, 3). Có thể điền **title** hoặc **slug** nếu movies không có cột id. |
| name | Tên tập (vd: Tập 1) |
| sources hoặc source | Chuỗi JSON mảng server_data (link_embed, link_m3u8, name, slug...) |

## File CSV mẫu (tham khảo / import tay vào Supabase)

Trong `docs/csv-templates/` có **movies-template.csv** và **episodes-template.csv** — cột tương ứng bảng Supabase; có thể dùng làm mẫu khi nhập dữ liệu hoặc import vào DB.
