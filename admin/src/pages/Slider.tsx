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
  Select,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import { getApiBaseUrl } from '../lib/api';
import { buildCdnMovieImageUrlBySlug } from '../lib/movie-image-urls';

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
const SITE_URL_KEY = 'site_url';
const SLIDER_DISPLAY_MODE_KEY = 'homepage_slider_display_mode';
const SLIDER_AUTO_COUNT_KEY = 'homepage_slider_auto_latest_count';

export default function Slider() {
  const [list, setList] = useState<SlideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [r2ImgDomain, setR2ImgDomain] = useState<string>('');
  const [ophimImgDomain, setOphimImgDomain] = useState<string>('');
  const [movieLinkInput, setMovieLinkInput] = useState('');
  const [addingFromMovie, setAddingFromMovie] = useState(false);
  const [addingLatest, setAddingLatest] = useState(false);
  const [latestCount, setLatestCount] = useState(5);
  const [displayMode, setDisplayMode] = useState<'manual' | 'auto'>('manual');
  const [autoLatestCount, setAutoLatestCount] = useState(5);
  const [siteBase, setSiteBase] = useState<string>('');
  const [form] = Form.useForm();

  const derivePosterFromThumb = (url: string) => {
    if (!url) return '';
    const u = String(url);
    if (/poster\.(jpe?g|png|webp)$/i.test(u)) return u;
    const r1 = u.replace(/thumb\.(jpe?g|png|webp)$/i, 'poster.$1');
    if (r1 !== u) return r1;
    const r2 = u.replace(/-thumb\.(jpe?g|png|webp)$/i, '-poster.$1');
    if (r2 !== u) return r2;
    const r3 = u.replace(/_thumb\.(jpe?g|png|webp)$/i, '_poster.$1');
    if (r3 !== u) return r3;
    return '';
  };

  const saveDisplaySettings = async (mode: 'manual' | 'auto', count: number) => {
    const n = Math.max(1, Math.min(50, Number(count) || 5));
    try {
      const payload = [
        { key: SLIDER_DISPLAY_MODE_KEY, value: mode, updated_at: new Date().toISOString() },
        { key: SLIDER_AUTO_COUNT_KEY, value: String(n), updated_at: new Date().toISOString() },
      ];
      const { error } = await supabase.from('site_settings').upsert(payload, { onConflict: 'key' });
      if (error) throw error;
      setDisplayMode(mode);
      setAutoLatestCount(n);
      message.success('Đã lưu chế độ hiển thị slider');
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
  };

  const toStoredLinkPathOnly = (raw: string) => {
    const u = String(raw || '').trim();
    if (!u) return '';
    if (u.startsWith('#')) return u;
    if (u.startsWith('/')) return u;
    if (u.startsWith('//')) return u;
    if (!/^https?:\/\//i.test(u)) return u;
    try {
      const parsed = new URL(u);
      const p = parsed.pathname || '';
      const q = parsed.search || '';
      const h = parsed.hash || '';
      return (p || '/') + q + h;
    } catch {
      return u;
    }
  };

  const getSiteBaseFromMovieUrl = (rawUrl: string) => {
    const raw = String(rawUrl || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      const path = u.pathname || '';
      const basePath = path
        .replace(/\/?phim\/.*$/, '')
        .replace(/\/?xem-phim\/.*$/, '')
        .replace(/\/?dien-vien\/.*$/, '')
        .replace(/\/?the-loai\/.*$/, '')
        .replace(/\/?quoc-gia\/.*$/, '')
        .replace(/\/?tim-kiem\/.*$/, '')
        .replace(/\/?$/, '');
      return u.origin + basePath;
    } catch {
      return '';
    }
  };

  const getSlugShardPrefix = (slugRaw: string) => {
    const s = String(slugRaw || '').trim().toLowerCase();
    const c1 = s[0] || '_';
    const c2 = s[1] || '_';
    const ok = (c: string) => /^[a-z0-9]$/.test(c);
    const p1 = ok(c1) ? c1 : '_';
    const p2 = ok(c2) ? c2 : '_';
    return p1 + p2;
  };

  const parseSlugShardText = (text: string) => {
    // window.DAOP.slugIndex["ha"] = { "some-slug": { ...light } }
    const m = String(text || '').match(/slugIndex\s*\[\s*"([^"]+)"\s*\]\s*=\s*({[\s\S]*});?\s*$/);
    if (!m) throw new Error('Không parse được slug index shard');
    const prefix = m[1];
    const objStr = m[2];
    const map = JSON.parse(objStr);
    return { prefix, map } as { prefix: string; map: Record<string, any> };
  };

  const normalizePreviewUrl = (raw: string, siteBase: string) => {
    const u = String(raw || '').trim();
    if (!u) return '';
    const r2 = String(r2ImgDomain || '').replace(/\/$/, '');
    const ophim = String(ophimImgDomain || '').replace(/\/$/, '');
    const toWebpName = (filename: string) => {
      const f = String(filename || '').trim();
      if (!f) return '';
      if (/\.gif$/i.test(f)) return f;
      return f.replace(/\.(jpe?g|jpg|png|webp)$/i, '') + '.webp';
    };
    const buildR2FromUploadsPath = (uploadsPath: string) => {
      const p = String(uploadsPath || '').trim();
      if (!p || p.indexOf('/uploads/') !== 0) return '';
      if (!r2) return '';
      let filename = '';
      try {
        filename = p.split('/').pop() || '';
      } catch {
        filename = '';
      }
      if (!filename) return '';
      const lower = filename.toLowerCase();
      const folder = (lower.indexOf('poster') >= 0) ? 'posters' : 'thumbs';
      return r2 + '/' + folder + '/' + toWebpName(filename);
    };
    if (/^https?:\/\//i.test(u)) {
      try {
        const parsed = new URL(u);
        const p = parsed.pathname || '';
        if (p.indexOf('/uploads/') === 0) {
          const r2u = buildR2FromUploadsPath(p);
          if (r2u) return r2u;
          if (ophim) return ophim + p;
        }
      } catch {}
      return u;
    }
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/uploads/')) {
      const r2u = buildR2FromUploadsPath(u);
      if (r2u) return r2u;
      if (ophim) return ophim + u;
      const b = String(siteBase || '').replace(/\/$/, '');
      return b ? b + u : u;
    }
    if (u.startsWith('/')) {
      const b = String(siteBase || '').replace(/\/$/, '');
      return b ? b + u : u;
    }
    return u;
  };

  const normalizeStoredSlideImageUrl = (raw: string, r2Override?: string) => {
    const u = String(raw || '').trim();
    if (!u) return '';
    const r2 = String((r2Override != null ? r2Override : r2ImgDomain) || '').replace(/\/$/, '');
    if (r2 && /^https?:\/\//i.test(u)) {
      try {
        const parsed = new URL(u);
        if (parsed.origin === r2 || (r2 && u.indexOf(r2 + '/') === 0)) {
          if (!/\.gif(\?|#|$)/i.test(u)) {
            return u.replace(/\.(jpe?g|jpg|png|webp)(\?|#|$)/i, '.webp$2');
          }
        }
      } catch {}
    }
    return u;
  };

  const pickUploadsUrlFromAnyUrl = (raw: string) => {
    const u = String(raw || '').trim();
    if (!u) return '';
    if (u.startsWith('/uploads/')) return u;
    if (/^https?:\/\//i.test(u)) {
      try {
        const parsed = new URL(u);
        const p = parsed.pathname || '';
        if (p.startsWith('/uploads/')) return u;
      } catch {}
    }
    return '';
  };

  const fetchMovieLightBySlug = async (siteBase: string, slug: string) => {
    const base = String(siteBase || '').replace(/\/$/, '');
    if (!base) throw new Error('Thiếu Site URL');
    const prefix = getSlugShardPrefix(slug);
    const shardUrl = base + '/data/index/slug/' + prefix + '.js';
    const res = await fetch(shardUrl);
    if (!res.ok) throw new Error('Không tải được slug index: ' + shardUrl);
    const text = await res.text();
    const parsed = parseSlugShardText(text);
    const hit = (parsed.map || {})[String(slug || '').toLowerCase()];
    return hit || null;
  };

  const loadData = async () => {
    setLoading(true);
    const sliderKeys = [
      SLIDER_KEY,
      'r2_img_domain',
      'ophim_img_domain',
      SITE_URL_KEY,
      SLIDER_DISPLAY_MODE_KEY,
      SLIDER_AUTO_COUNT_KEY,
    ];
    const { data: settingsRows, error: settingsErr } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', sliderKeys);
    if (settingsErr) {
      message.error(settingsErr.message || 'Không tải cấu hình site_settings');
      setLoading(false);
      return;
    }
    const byKey = Object.fromEntries((settingsRows || []).map((r: { key: string; value: string }) => [r.key, r.value]));

    const r2Domain = String(byKey['r2_img_domain'] ?? '');
    const ophimDomain = String(byKey['ophim_img_domain'] ?? '');
    const base = String(byKey[SITE_URL_KEY] ?? '').trim();

    setR2ImgDomain(r2Domain);
    setOphimImgDomain(ophimDomain);
    setSiteBase(base);

    const modeRaw = String(byKey[SLIDER_DISPLAY_MODE_KEY] ?? '').trim().toLowerCase();
    const mode = (modeRaw === 'auto' || modeRaw === 'manual') ? modeRaw : 'manual';
    const autoCountNum = Number(byKey[SLIDER_AUTO_COUNT_KEY]);
    const autoCountFinal = Number.isFinite(autoCountNum) && autoCountNum > 0 ? autoCountNum : 5;
    setDisplayMode(mode as any);
    setAutoLatestCount(autoCountFinal);

    try {
      const sliderJson = byKey[SLIDER_KEY];
      const parsed = sliderJson ? JSON.parse(sliderJson) : [];
      const arr = Array.isArray(parsed) ? parsed : [];
      setList(arr.map((s: SlideItem) => ({
        ...s,
        image_url: normalizeStoredSlideImageUrl((s as any)?.image_url || '', r2Domain),
        link_url: toStoredLinkPathOnly((s as any)?.link_url || ''),
        enabled: s.enabled !== false,
      })));
    } catch {
      setList([]);
    }
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
    let slug = '';
    let baseFromLink = '';
    try {
      if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        baseFromLink = getSiteBaseFromMovieUrl(raw);
        const path = u.pathname;
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
    if (!baseFromLink) {
      message.warning('Vui lòng dán link đầy đủ của trang phim (không hỗ trợ chỉ nhập slug).');
      return;
    }
    setAddingFromMovie(true);
    try {
      const movie = await fetchMovieLightBySlug(baseFromLink, slug);

      if (!movie) {
        message.error('Không tìm thấy phim với slug: ' + slug);
        return;
      }

      const linkUrl = '/phim/' + (movie.slug || slug) + '.html';
      const r2b = String(r2ImgDomain || '').replace(/\/$/, '');
      const slugForCdn = String((movie as any).slug || slug || '').trim();
      let img = '';
      if (r2b && slugForCdn) {
        img = buildCdnMovieImageUrlBySlug(r2b, slugForCdn, 'poster');
      }
      if (!img) {
        const derivedPoster = (!movie.poster && movie.thumb) ? derivePosterFromThumb(movie.thumb) : '';
        const imgRaw = ((movie as any).poster || derivedPoster || movie.thumb || (movie as any).image_url || '').replace(/^\/\//, 'https://');
        const uploadsUrl = pickUploadsUrlFromAnyUrl(imgRaw);
        img = uploadsUrl || normalizeStoredSlideImageUrl(imgRaw);
      }
      const title = movie.title || movie.origin_name || (movie as any).name || '';
      const countryName = Array.isArray(movie.country)
        ? (movie.country[0]?.name || '')
        : '';
      const genreNames = Array.isArray(movie.genre)
        ? movie.genre.map((g: any) => (g && g.name) ? g.name : '').filter(Boolean)
        : Array.isArray(movie.genres)
          ? movie.genres.map((g: any) => (g && g.name) ? g.name : String(g || '')).filter(Boolean)
          : [];
      const newSlide: SlideItem = {
        image_url: img,
        link_url: toStoredLinkPathOnly(linkUrl),
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
    const base = String(siteBase || '').trim().replace(/\/$/, '');
    if (!base) {
      message.warning('Vui lòng cấu hình Site URL trong Cài đặt chung để dùng tính năng này.');
      return;
    }
    const n = Math.max(1, Math.min(50, latestCount || 5));
    setAddingLatest(true);
    try {
      const res2 = await fetch(base + '/data/home/home-sections-data.json');
      if (!res2.ok) throw new Error('Không tải được dữ liệu phim');
      const sections = await res2.json();
      const pool: Record<string, any> = {};
      (sections || []).forEach((sec: any) => {
        (sec?.movies || []).forEach((m: any) => {
          const k = String(m?.slug || m?.id || '');
          if (k && !pool[k]) pool[k] = m;
        });
      });
      const movies: any[] = Object.values(pool);

      const sorted = [...movies].sort((a: any, b: any) => {
        const ya = Number(a.year) || 0;
        const yb = Number(b.year) || 0;
        if (yb !== ya) return yb - ya;
        return 0;
      });

      const r2b = String(r2ImgDomain || '').replace(/\/$/, '');
      const newSlides: SlideItem[] = sorted.slice(0, n).map((movie: any, i: number) => {
        const linkUrl = '/phim/' + (movie.slug || movie.id) + '.html';
        const slugForCdn = String(movie?.slug || '').trim();
        let img = '';
        if (r2b && slugForCdn) {
          img = buildCdnMovieImageUrlBySlug(r2b, slugForCdn, 'poster');
        }
        if (!img) {
          const derivedPoster = (!movie.poster && movie.thumb) ? derivePosterFromThumb(movie.thumb) : '';
          const imgRaw = (movie.poster || derivedPoster || movie.thumb || movie.image_url || '').replace(/^\/\//, 'https://');
          const uploadsUrl = pickUploadsUrlFromAnyUrl(imgRaw);
          img = uploadsUrl || normalizeStoredSlideImageUrl(imgRaw);
        }
        const title = movie.title || movie.origin_name || movie.name || '';
        const countryName = Array.isArray(movie.country) && movie.country[0] ? (movie.country[0].name || '') : '';
        const genreNames = Array.isArray(movie.genre)
          ? movie.genre.map((g: any) => (g && g.name) ? g.name : '').filter(Boolean)
          : [];
        return {
          image_url: img,
          link_url: toStoredLinkPathOnly(linkUrl),
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
      image_url: normalizeStoredSlideImageUrl(values.image_url || ''),
      link_url: toStoredLinkPathOnly(values.link_url || ''),
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
        Sau khi lưu, cần chạy Build website để áp dụng slider lên site.
      </p>
      <Card title="Thêm phim mới nhất" style={{ marginBottom: 16 }}>
        <p style={{ color: '#666', marginBottom: 8 }}>
          Thêm N phim mới nhất (sắp xếp theo năm) vào slider. Cần cấu hình Site URL (website chính) trong Cài đặt chung.
        </p>
        <Space>
          <InputNumber min={1} max={50} value={latestCount} onChange={(v) => setLatestCount(Number(v) || 5)} />
          <Button type="primary" icon={<ThunderboltOutlined />} loading={addingLatest} onClick={addLatestMovies}>
            Thêm phim mới nhất
          </Button>
        </Space>
      </Card>

      <Card title="Chế độ hiển thị slider" style={{ marginBottom: 16 }}>
        <p style={{ color: '#666', marginBottom: 8 }}>
          Manual: dùng slider lưu trong Supabase (chỉnh sửa thủ công). Auto: slider sẽ được tạo tự động khi chạy workflow update-data.
        </p>
        <Space wrap>
          <span>Chế độ</span>
          <Select
            value={displayMode}
            style={{ minWidth: 160 }}
            options={[
              { value: 'manual', label: 'Manual (Supabase)' },
              { value: 'auto', label: 'Auto (build)' },
            ]}
            onChange={(v) => {
              const mode = (v === 'auto' || v === 'manual') ? v : 'manual';
              setDisplayMode(mode);
            }}
          />
          <span>Số lượng (Auto)</span>
          <InputNumber
            min={1}
            max={50}
            value={autoLatestCount}
            onChange={(v) => {
              const n = Number(v) || 5;
              setAutoLatestCount(n);
            }}
          />
          <Button type="primary" onClick={() => saveDisplaySettings(displayMode, autoLatestCount)}>
            Lưu chế độ
          </Button>
        </Space>
      </Card>
      <Card title="Thêm slide từ phim" style={{ marginBottom: 16 }}>
        <p style={{ color: '#666', marginBottom: 8 }}>
          Nhập link trang phim (ví dụ: https://your-site.com/phim/nam-em-la-ba-anh.html).
        </p>
        <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
          <Input
            placeholder="Link phim (vd: https://your-site.com/phim/nam-em-la-ba-anh.html)"
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
              url ? (
                <Image
                  src={normalizePreviewUrl(url, String(siteBase || '').trim())}
                  width={80}
                  height={45}
                  style={{ objectFit: 'cover' }}
                  alt=""
                />
              ) : '-',
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
                        const r = await fetch(`${getApiBaseUrl()}/api/upload-image`, {
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
