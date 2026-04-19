-- Dọn bản sao text trùng title/description để giảm heap/TOAST (chạy một lần trên project Supabase Admin).
-- Nguồn chuẩn: title, description. Cột name/content giữ nullable cho tương thích schema cũ.

update public.movies
set name = null
where name is not distinct from title;

update public.movies
set content = null
where content is not distinct from description;

-- URL ảnh có thể dựng từ slug/id + site_settings.r2_img_domain.
-- Nếu bạn đang dùng thumb_url/poster_url như "override" ảnh theo từng phim, KHÔNG chạy 2 câu lệnh dưới.
update public.movies
set thumb_url = null
where nullif(trim(coalesce(thumb_url, '')), '') is not null;

update public.movies
set poster_url = null
where nullif(trim(coalesce(poster_url, '')), '') is not null;
