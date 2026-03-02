import { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Image,
  Card,
  Switch,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';

type SlideItem = {
  image_url: string;
  link_url?: string;
  title?: string;
  year?: string | number;
  country?: string;
  episode_current?: string;
  genres?: string[] | { name: string }[];
  description?: string;
  sort_order?: number;
  enabled?: boolean;
};

type MovieLight = {
  id?: string | number;
  slug?: string;
  title?: string;
  origin_name?: string;
  name?: string;
  thumb?: string;
  poster?: string;
  year?: string | number;
  country?: { name?: string }[];
  genre?: { name?: string }[];
  episode_current?: string;
};

const SLIDER_KEY = 'homepage_slider';
const MOVIES_DATA_URL_KEY = 'movies_data_url';

export default function Slider() {
  const [list, setList] = useState<SlideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [moviesDataUrl, setMoviesDataUrl] = useState<string>('');
  const [movieLinkInput, setMovieLinkInput] = useState('');
  const [addingFromMovie, setAddingFromMovie] = useState(false);
  const [addingLatest, setAddingLatest] = useState(false);
  const [latestCount, setLatestCount] = useState(5);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    const [sliderRes, settingsRes] = await Promise.all([
      supabase.from('site_settings').select('value').eq('key', SLIDER_KEY).single(),
      supabase.from('site_settings').select('value').eq('key', MOVIES_DATA_URL_KEY).maybeSingle(),
    ]);
    try {
      const parsed = sliderRes.data?.value ? JSON.parse(sliderRes.data.value) : [];
      const arr = Array.isArray(parsed) ? parsed : [];
      setList(arr.map((s: SlideItem) => ({ ...s, enabled: s.enabled !== false })));
    } catch {
      setList([]);
    }
    setMoviesDataUrl(settingsRes.data?.value ?? '');
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const addSlideFromMovieLink = async () => {
    const raw = movieLinkInput.trim();
    if (!raw) {
      message.warning('Nhập link trang phim hoặc slug phim');
      return;
    }
    if (!moviesDataUrl) {
      message.warning('Cấu hình URL dữ liệu phim trong Cài đặt (movies_data_url) để dùng tính năng này.');
      return;
    }
    let slug = '';
    try {
      if (/^https?:\/\//i.test(raw)) {
        const path = new URL(raw).pathname;
        const m = path.match(/\/phim\/([^/]+)\.html$/);
        slug = m ? m[1] : path.replace(/^\/phim\//, '').replace(/\.html$/, '');
      } else {
        slug = raw.replace(/\.html$/, '');
      }
    } catch {
      slug = raw.replace(/\.html$/, '');
    }
    if (!slug) {
      message.warning('Không tìm thấy slug phim trong link');
      return;
    }
    setAddingFromMovie(true);
    try {
      const res = await fetch(moviesDataUrl);
      if (!res.ok) throw new Error('Không tải được dữ liệu phim');
      let text = await res.text();
      text = text.replace(/^[\s\S]*?window\.moviesLight\s*=\s*/, '').replace(/;\s*$/, '');
      const movies: MovieLight[] = JSON.parse(text);
      const movie = movies.find((m) => (m.slug || '').toLowerCase() === slug.toLowerCase());
      if (!movie) {
        message.error('Không tìm thấy phim với slug: ' + slug);
        return;
      }
      const base = moviesDataUrl.replace(/\/data\/movies-light\.js.*$/, '') || new URL(moviesDataUrl).origin;
      const linkUrl = base + '/phim/' + (movie.slug || slug) + '.html';
      const img = ((movie as any).poster || movie.thumb || '').replace(/^\/\//, 'https://');
      const title = movie.title || movie.origin_name || (movie as any).name || '';
      const countryName = Array.isArray(movie.country) && movie.country[0] ? (movie.country[0].name || '') : '';
      const genreNames = Array.isArray(movie.genre)
        ? movie.genre.map((g: any) => (g && g.name) ? g.name : '').filter(Boolean)
        : [];
      const newSlide: SlideItem = {
        image_url: img,
        link_url: linkUrl,
        title,
        year: movie.year != null ? String(movie.year) : undefined,
        country: countryName || undefined,
        episode_current: movie.episode_current || undefined,
        genres: genreNames.length ? genreNames : undefined,
        sort_order: list.length,
        enabled: true,
      };
      await saveList([...list, newSlide]);
      setMovieLinkInput('');
      message.success('Đã thêm slide từ phim: ' + (title || slug));
    } catch (e: any) {
      message.error(e?.message || 'Lỗi lấy thông tin phim');
    } finally {
      setAddingFromMovie(false);
    }
  };

  const saveList = async (newList: SlideItem[]) => {
    try {
      const { error } = await supabase.from('site_settings').upsert(
        { key: SLIDER_KEY, value: JSON.stringify(newList), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      if (error) throw error;
      message.success('Đã lưu slider');
      setList(newList);
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
  };

  const openAdd = () => {
    setEditingIndex(null);
    form.resetFields();
    form.setFieldsValue({ sort_order: list.length, enabled: true });
    setModalVisible(true);
  };

  const openEdit = (idx: number) => {
    setEditingIndex(idx);
    form.setFieldsValue({ ...list[idx], enabled: list[idx]?.enabled !== false });
    setModalVisible(true);
  };

  const handleDelete = async (idx: number) => {
    const next = list.filter((_, i) => i !== idx);
    await saveList(next);
  };

  const addLatestMovies = async () => {
    if (!moviesDataUrl) {
      message.warning('Cấu hình URL dữ liệu phim trong Cài đặt (movies_data_url).');
      return;
    }
    const n = Math.max(1, Math.min(50, latestCount || 5));
    setAddingLatest(true);
    try {
      const res = await fetch(moviesDataUrl);
      if (!res.ok) throw new Error('Không tải được dữ liệu phim');
      let text = await res.text();
      text = text.replace(/^[\s\S]*?window\.moviesLight\s*=\s*/, '').replace(/;\s*$/, '');
      const movies: MovieLight[] = JSON.parse(text);
      const sorted = [...movies].sort((a, b) => {
        const ya = Number(a.year) || 0;
        const yb = Number(b.year) || 0;
        if (yb !== ya) return yb - ya;
        return 0;
      });
      const base = moviesDataUrl.replace(/\/data\/movies-light\.js.*$/, '') || new URL(moviesDataUrl).origin;
      const newSlides: SlideItem[] = sorted.slice(0, n).map((movie, i) => {
        const linkUrl = base + '/phim/' + (movie.slug || movie.id) + '.html';
        const img = (movie.poster || movie.thumb || '').replace(/^\/\//, 'https://');
        const title = movie.title || movie.origin_name || (movie as any).name || '';
        const countryName = Array.isArray(movie.country) && movie.country[0] ? (movie.country[0].name || '') : '';
        const genreNames = Array.isArray(movie.genre)
          ? movie.genre.map((g: any) => (g && g.name) ? g.name : '').filter(Boolean)
          : [];
        return {
          image_url: img,
          link_url: linkUrl,
          title,
          year: movie.year != null ? String(movie.year) : undefined,
          country: countryName || undefined,
          episode_current: movie.episode_current || undefined,
          genres: genreNames.length ? genreNames : undefined,
          sort_order: list.length + i,
          enabled: true,
        };
      });
      await saveList([...list, ...newSlides]);
      message.success('Đã thêm ' + newSlides.length + ' phim mới nhất vào slider.');
    } catch (e: any) {
      message.error(e?.message || 'Lỗi thêm phim mới nhất');
    } finally {
      setAddingLatest(false);
    }
  };

  const toggleEnabled = async (idx: number, checked: boolean) => {
    const next = list.map((s, i) => (i === idx ? { ...s, enabled: checked } : s));
    await saveList(next);
  };

  const handleSubmit = async (values: any) => {
    const genresRaw = values.genres;
    const genres = typeof genresRaw === 'string'
      ? (genresRaw || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(genresRaw) ? genresRaw : undefined;
    const slide: SlideItem = {
      image_url: values.image_url || '',
      link_url: values.link_url || '',
      title: values.title || '',
      year: values.year != null && values.year !== '' ? String(values.year) : undefined,
      country: values.country || undefined,
      episode_current: values.episode_current || undefined,
      genres: genres?.length ? genres : undefined,
      description: values.description || undefined,
      sort_order: typeof values.sort_order === 'number' ? values.sort_order : list.length,
      enabled: values.enabled !== false,
    };
    let next: SlideItem[];
    if (editingIndex !== null) {
      next = list.map((s, i) => (i === editingIndex ? slide : s));
    } else {
      next = [...list, slide];
    }
    next.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    await saveList(next);
    setModalVisible(false);
  };

  return (
    <>
      <h1>Slider trang chủ</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Các slide hiển thị dạng carousel trên trang chủ. Lưu trong Cài đặt chung (site_settings).
      </p>
      <Card title="Thêm phim mới nhất" style={{ marginBottom: 16 }}>
        <p style={{ color: '#666', marginBottom: 8 }}>
          Thêm N phim mới nhất (sắp xếp theo năm) vào slider. Cần cấu hình URL dữ liệu phim trong Cài đặt.
        </p>
        <Space>
          <InputNumber min={1} max={50} value={latestCount} onChange={(v) => setLatestCount(Number(v) || 5)} />
          <Button type="primary" icon={<ThunderboltOutlined />} loading={addingLatest} onClick={addLatestMovies}>
            Thêm phim mới nhất
          </Button>
        </Space>
      </Card>
      <Card title="Thêm slide từ phim" style={{ marginBottom: 16 }}>
        <p style={{ color: '#666', marginBottom: 8 }}>
          Nhập link trang phim (ví dụ: https://your-site.com/phim/nam-em-la-ba-anh.html) hoặc slug phim. Cần cấu hình URL dữ liệu phim trong Cài đặt.
        </p>
        <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
          <Input
            placeholder="Link phim hoặc slug (vd: nam-em-la-ba-anh)"
            value={movieLinkInput}
            onChange={(e) => setMovieLinkInput(e.target.value)}
            onPressEnter={addSlideFromMovieLink}
          />
          <Button type="primary" icon={<LinkOutlined />} loading={addingFromMovie} onClick={addSlideFromMovieLink}>
            Lấy và thêm
          </Button>
        </Space.Compact>
      </Card>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Thêm slide (ảnh + link tùy chỉnh)
        </Button>
      </div>
      <Table
        loading={loading}
        dataSource={list.map((item, idx) => ({ ...item, key: idx, _index: idx }))}
        rowKey="_index"
        pagination={false}
        columns={[
          {
            title: 'Bật',
            key: 'enabled',
            width: 64,
            render: (_: any, row: any) => (
              <Switch
                checked={row.enabled !== false}
                onChange={(checked) => toggleEnabled(row._index, checked)}
              />
            ),
          },
          {
            title: 'Ảnh',
            dataIndex: 'image_url',
            key: 'img',
            render: (url: string) =>
              url ? <Image src={url} width={80} height={45} style={{ objectFit: 'cover' }} alt="" /> : '-',
          },
          { title: 'Tiêu đề', dataIndex: 'title', key: 'title' },
          { title: 'Link', dataIndex: 'link_url', key: 'link_url', ellipsis: true },
          { title: 'Thứ tự', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
          {
            title: '',
            key: 'action',
            width: 140,
            render: (_: any, row: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row._index)}>Sửa</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(row._index)}>Xóa</Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editingIndex !== null ? 'Sửa slide' : 'Thêm slide'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="image_url" label="URL ảnh" rules={[{ required: true }]}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input placeholder="https://... hoặc Upload R2" style={{ flex: 1 }} />
              <label style={{ marginBottom: 0 }}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || file.size > 4 * 1024 * 1024) {
                      message.warning('Chọn ảnh ≤ 4MB');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const base64 = (reader.result as string)?.split(',')[1];
                      if (!base64) return;
                      try {
                        const apiBase = (import.meta as any).env?.VITE_API_URL || '';
                        const r = await fetch(apiBase + '/api/upload-image', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            image: base64,
                            contentType: file.type || 'image/jpeg',
                            filename: file.name,
                            folder: 'slider',
                          }),
                        });
                        const data = await r.json();
                        if (data.url) {
                          form.setFieldValue('image_url', data.url);
                          message.success('Đã upload ảnh');
                        } else {
                          const errMsg = data.error || 'Upload thất bại';
                          message.error({ content: errMsg, duration: 8 });
                        }
                      } catch {
                        message.error('Lỗi kết nối API upload');
                      }
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                <Button type="default" size="small">Upload R2</Button>
              </label>
            </div>
          </Form.Item>
          <Form.Item name="link_url" label="Link khi click">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="title" label="Tiêu đề">
            <Input />
          </Form.Item>
          <Form.Item name="year" label="Năm (tùy chọn)">
            <Input placeholder="2026" />
          </Form.Item>
          <Form.Item name="country" label="Quốc gia (tùy chọn)">
            <Input placeholder="Hàn Quốc" />
          </Form.Item>
          <Form.Item name="episode_current" label="Tập / Trọn bộ (tùy chọn)">
            <Input placeholder="Tập 3 hoặc Trọn bộ 8 tập" />
          </Form.Item>
          <Form.Item name="genres" label="Thể loại (tùy chọn, cách nhau bằng dấu phẩy)">
            <Input placeholder="Chính Kịch, Hài Hước, Tâm Lý" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả ngắn (tùy chọn)">
            <Input.TextArea rows={2} placeholder="Một hai câu giới thiệu phim..." />
          </Form.Item>
          <Form.Item name="sort_order" label="Thứ tự">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="Hiển thị slide" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
