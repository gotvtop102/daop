import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Typography,
  Button,
  Form,
  Input,
  Select,
  InputNumber,
  message,
  Card,
  Row,
  Col,
  Space,
  Image,
  Tag,
  Divider,
  Switch,
  Spin,
  Tooltip,
} from 'antd';
import {
  SaveOutlined,
  ArrowLeftOutlined,
  SearchOutlined,
  ReloadOutlined,
  LinkOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface MovieForm {
  id?: string;
  title: string;
  origin_name: string;
  poster_url: string;
  thumb_url: string;
  year: number;
  type: string;
  status: string;
  episode_current: string;
  episode_total: string;
  quality: string;
  genre: string[];
  country: string[];
  director: string[];
  actor: string[];
  description: string;
  tmdb_id: string;
  time: string;
  language: string;
  showtimes: string;
  is_exclusive: boolean;
  update?: string;
}

const STATUS_OPTIONS = [
  { value: 'current', label: 'Đang chiếu' },
  { value: 'upcoming', label: 'Sắp chiếu' },
  { value: 'theater', label: 'Chiếu rạp' },
];

const QUALITY_OPTIONS = [
  { value: 'CAM', label: 'CAM' },
  { value: 'SD', label: 'SD' },
  { value: 'HD', label: 'HD' },
  { value: 'FHD', label: 'Full HD' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const TYPE_OPTIONS = [
  { value: 'single', label: 'Phim lẻ' },
  { value: 'series', label: 'Phim bộ' },
  { value: 'hoathinh', label: 'Hoạt hình' },
  { value: 'tvshows', label: 'TV Show' },
];

const GENRE_OPTIONS = [
  'Hành động', 'Phiêu lưu', 'Tình cảm', 'Hài hước', 'Kinh dị', 'Khoa học viễn tưởng',
  'Fantasy', 'Thần thoại', 'Chiến tranh', 'Tâm lý', 'Tội phạm', 'Bí ẩn', 'Học đường',
  'Thể thao', 'Âm nhạc', 'Gia đình', 'Chính kịch', 'Lịch sử', 'Cổ trang', 'Tài liệu',
];

const COUNTRY_OPTIONS = [
  'Việt Nam', 'Mỹ', 'Hàn Quốc', 'Trung Quốc', 'Nhật Bản', 'Thái Lan', 'Pháp', 'Anh',
  'Đức', 'Nga', 'Ấn Độ', 'Tây Ban Nha', 'Ý', 'Canada', 'Úc', 'Hồng Kông', 'Đài Loan',
];

const UPDATE_OPTIONS = [
  { value: 'NEW', label: 'NEW' },
  { value: 'NEW2', label: 'NEW2' },
  { value: 'OK', label: 'OK' },
  { value: 'OK2', label: 'OK2' },
  { value: 'COPY', label: 'COPY' },
  { value: 'COPY2', label: 'COPY2' },
];

const normalizeLooseText = (input: any) => {
  const s = String(input ?? '').trim().toLowerCase();
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const stripPhimPrefix = (input: any) => {
  const raw = String(input ?? '').trim();
  const norm = normalizeLooseText(raw);
  if (norm.startsWith('phim ')) {
    const trimmed = raw.replace(/^\s*phim\s+/i, '').trim();
    return trimmed || raw;
  }
  return raw;
};

const pickClosestFromOptions = (raw: any, options: string[]) => {
  const original = String(raw ?? '').trim();
  if (!original) return '';
  const cleaned = stripPhimPrefix(original);
  const n = normalizeLooseText(cleaned);
  if (!n) return cleaned;

  let best: string | null = null;
  let bestScore = -1;
  for (const opt of options || []) {
    const o = String(opt ?? '').trim();
    if (!o) continue;
    const on = normalizeLooseText(o);
    if (!on) continue;
    if (on === n) return o;

    let score = 0;
    if (on.includes(n) || n.includes(on)) {
      const shorter = Math.min(on.length, n.length);
      const longer = Math.max(on.length, n.length);
      const ratio = longer ? shorter / longer : 0;
      score = 50 + Math.round(ratio * 50);
    } else {
      const tokens = n.split(' ').filter(Boolean);
      const ot = on.split(' ').filter(Boolean);
      const common = tokens.filter((t) => ot.includes(t));
      if (common.length) {
        score = common.length * 10;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }

  if (best && bestScore >= 50) return best;
  return cleaned;
};

const normalizeGenres = (rawGenres: any[]) => {
  const arr = Array.isArray(rawGenres) ? rawGenres : [];
  const out: string[] = [];
  for (const g of arr) {
    const picked = pickClosestFromOptions(g, GENRE_OPTIONS);
    if (picked && !out.includes(picked)) out.push(picked);
  }
  return out;
};

const COUNTRY_CODE_TO_VN: Record<string, string> = {
  VN: 'Việt Nam',
  US: 'Mỹ',
  KR: 'Hàn Quốc',
  KP: 'Triều Tiên',
  CN: 'Trung Quốc',
  JP: 'Nhật Bản',
  TH: 'Thái Lan',
  FR: 'Pháp',
  GB: 'Anh',
  UK: 'Anh',
  DE: 'Đức',
  RU: 'Nga',
  IN: 'Ấn Độ',
  ES: 'Tây Ban Nha',
  IT: 'Ý',
  CA: 'Canada',
  AU: 'Úc',
  HK: 'Hồng Kông',
  TW: 'Đài Loan',
};

const COUNTRY_NAME_ALIAS: Record<string, string> = {
  'united states': 'Mỹ',
  'united states of america': 'Mỹ',
  usa: 'Mỹ',
  america: 'Mỹ',
  'south korea': 'Hàn Quốc',
  'korea republic of': 'Hàn Quốc',
  'north korea': 'Triều Tiên',
  china: 'Trung Quốc',
  japan: 'Nhật Bản',
  thailand: 'Thái Lan',
  france: 'Pháp',
  'united kingdom': 'Anh',
  england: 'Anh',
  germany: 'Đức',
  russia: 'Nga',
  india: 'Ấn Độ',
  spain: 'Tây Ban Nha',
  italy: 'Ý',
  canada: 'Canada',
  australia: 'Úc',
  'hong kong': 'Hồng Kông',
  taiwan: 'Đài Loan',
  vietnam: 'Việt Nam',
};

const normalizeCountries = (rawCountries: any[]) => {
  const arr = Array.isArray(rawCountries) ? rawCountries : [];
  const out: string[] = [];
  for (const c of arr) {
    if (!c) continue;
    const code = String((c as any).iso_3166_1 || '').trim().toUpperCase();
    const name = String((c as any).name ?? c).trim();
    const pickedByCode = code && COUNTRY_CODE_TO_VN[code] ? COUNTRY_CODE_TO_VN[code] : '';
    if (pickedByCode) {
      if (!out.includes(pickedByCode)) out.push(pickedByCode);
      continue;
    }

    const aliasKey = normalizeLooseText(name);
    const alias = aliasKey && COUNTRY_NAME_ALIAS[aliasKey] ? COUNTRY_NAME_ALIAS[aliasKey] : '';
    if (alias) {
      if (!out.includes(alias)) out.push(alias);
      continue;
    }

    const picked = pickClosestFromOptions(name, COUNTRY_OPTIONS);
    if (picked && !out.includes(picked)) out.push(picked);
  }
  return out;
};

export default function MovieEdit() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const typeFromQuery = searchParams.get('type') || 'single';
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [originalMovie, setOriginalMovie] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [fetchingTMDB, setFetchingTMDB] = useState(false);
  const [posterPreview, setPosterPreview] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [serviceAccountKey, setServiceAccountKey] = useState<string>('');
  const [r2ImgDomain, setR2ImgDomain] = useState<string>('');
  const [ophimImgDomain, setOphimImgDomain] = useState<string>('');
  const [configReady, setConfigReady] = useState<boolean>(false);
  const isNew = id === 'new';

  const isNormalizeMode = useMemo(() => {
    const v = String(searchParams.get('normalize') || '').trim();
    return v === '1' || v.toLowerCase() === 'true';
  }, [searchParams]);

  const applyFromOriginal = (field: keyof MovieForm) => {
    if (!originalMovie) return;
    let v: any = originalMovie[field as any];
    if (v == null) return;

    if (field === 'year') {
      const n = Number(String(v || '').trim());
      if (Number.isFinite(n) && n > 0) v = n;
    }

    if (field === 'is_exclusive') {
      const s = String(v ?? '').trim().toLowerCase();
      v = s === '1' || s === 'true' || s === 'yes';
    }

    if (field === 'genre' || field === 'country' || field === 'director' || field === 'actor') {
      if (typeof v === 'string') {
        v = v
          .split(',')
          .map((x) => String(x || '').trim())
          .filter(Boolean);
      }
      if (!Array.isArray(v)) v = [];
    }

    form.setFieldsValue({ [field]: v } as any);
    message.success(`Đã chuyển dữ liệu: ${String(field)}`);
  };

  const loadOriginalBySlug = async (slug: string) => {
    const s = String(slug || '').trim();
    if (!s) return;
    if (!spreadsheetId || !serviceAccountKey) return;

    const envBase = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
    const base = envBase || window.location.origin;

    const url = new URL(`${base}/api/movies`);
    url.searchParams.append('action', 'getBySlug');
    url.searchParams.append('spreadsheetId', spreadsheetId);
    url.searchParams.append('serviceAccountKey', serviceAccountKey);
    url.searchParams.append('slug', s);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data?.error) throw new Error(data.error);
    setOriginalMovie(data);
  };

  // Load spreadsheetId và serviceAccountKey từ Supabase hoặc localStorage
  useEffect(() => {
    const loadConfig = async () => {
      const { data: settings, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['google_sheets_id', 'google_service_account_key', 'r2_img_domain', 'ophim_img_domain']);
      
      if (!error && settings) {
        const sheetId = settings.find(s => s.key === 'google_sheets_id')?.value;
        const svcKey = settings.find(s => s.key === 'google_service_account_key')?.value;
        const r2Domain = settings.find(s => s.key === 'r2_img_domain')?.value;
        const ophimDomain = settings.find(s => s.key === 'ophim_img_domain')?.value;
        if (sheetId) setSpreadsheetId(sheetId);
        if (svcKey) setServiceAccountKey(svcKey);
        if (r2Domain) setR2ImgDomain(r2Domain);
        if (ophimDomain) setOphimImgDomain(ophimDomain);
      }
      
      try {
        const saved = JSON.parse(localStorage.getItem('daop_google_sheets_config') || '{}');
        if (saved?.google_sheets_id) setSpreadsheetId(saved.google_sheets_id);
        if (saved?.google_service_account_key) setServiceAccountKey(saved.google_service_account_key);
      } catch {
        // ignore
      }
      setConfigReady(true);
    };
    loadConfig();
  }, []);

  const extractImageSlug = (raw: string) => {
    const u = String(raw || '').trim();
    if (!u) return '';
    const r2 = String(r2ImgDomain || '').replace(/\/$/, '');
    const ophim = String(ophimImgDomain || '').replace(/\/$/, '');
    let name = u;
    if (/^https?:\/\//i.test(u)) {
      try {
        const parsed = new URL(u);
        const p = parsed.pathname || '';
        const underKnownDomain =
          (!!r2 && parsed.origin === r2) ||
          (!!ophim && parsed.origin === ophim);
        if (!underKnownDomain && p.indexOf('/uploads/') !== 0) {
          return u;
        }
        name = p.split('/').pop() || '';
      } catch {
        name = u.split('/').pop() || '';
      }
    } else if (u.startsWith('/')) {
      if (u.indexOf('/uploads/') !== 0) return u;
      name = u.split('/').pop() || '';
    }
    name = name.split('?')[0].split('#')[0];
    name = name.replace(/\.(jpe?g|jpg|png|webp|gif)$/i, '');
    name = name
      .replace(/[-_]?thumb$/i, '')
      .replace(/[-_]?poster$/i, '')
      .trim();
    return name;
  };

  const buildImageUrlFromSlug = (slug: string, kind: 'thumb' | 'poster') => {
    const s = String(slug || '').trim();
    if (!s) return '';
    const r2 = String(r2ImgDomain || '').replace(/\/$/, '');
    const ophim = String(ophimImgDomain || '').replace(/\/$/, '');
    if (r2) return `${r2}/${kind === 'poster' ? 'posters' : 'thumbs'}/${s}.webp`;
    if (ophim) return `${ophim}/uploads/${kind === 'poster' ? 'posters' : 'thumbs'}/${s}.webp`;
    return '';
  };

  const normalizeMovieImageUrl = (raw: string, kind: 'thumb' | 'poster') => {
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
      const folder = lower.indexOf('poster') >= 0 ? 'posters' : 'thumbs';
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
      } catch {
        // ignore
      }
      return u;
    }

    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/uploads/')) {
      const r2u = buildR2FromUploadsPath(u);
      if (r2u) return r2u;
      if (ophim) return ophim + u;
    }
    // slug-only
    const slug = extractImageSlug(u);
    return slug ? buildImageUrlFromSlug(slug, kind) : u;
  };

  // Load movie data
  useEffect(() => {
    if (!configReady) return; // Wait for config to load first
    if (!isNew && id && spreadsheetId && serviceAccountKey) {
      loadMovie(id);
    } else if (isNew) {
      // Set default values for new movie
      form.setFieldsValue({
        type: typeFromQuery,
        year: new Date().getFullYear(),
        status: 'current',
        quality: 'HD',
        genre: [],
        country: [],
        language: '',
        is_exclusive: false,
        update: '',
      });
    }
  }, [id, typeFromQuery, spreadsheetId, serviceAccountKey, configReady]);

  const loadMovie = async (movieId: string) => {
    if (!configReady) return; // Wait for config to load first
    if (!spreadsheetId) {
      message.error('Chưa cấu hình Google Sheets ID');
      return;
    }
    if (!serviceAccountKey) {
      message.error('Chưa cấu hình Service Account Key');
      return;
    }
    setLoading(true);
    try {
      const base = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const apiBase = base || window.location.origin;
      const res = await fetch(`${apiBase}/api/movies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get',
          id: movieId,
          spreadsheetId,
          serviceAccountKey,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const result = await res.json();
      if (result.error) {
        throw new Error(result.error);
      }

      if (!result) {
        throw new Error('Phim không tồn tại');
      }

      const posterSlug = extractImageSlug(result.poster_url || '');
      const thumbSlug = extractImageSlug(result.thumb_url || '');

      // Parse arrays from comma-separated strings
      form.setFieldsValue({
        ...result,
        genre: typeof result.genre === 'string' ? result.genre.split(',').filter(Boolean) : result.genre || [],
        country: typeof result.country === 'string' ? result.country.split(',').filter(Boolean) : result.country || [],
        director: typeof result.director === 'string' ? result.director.split(',').filter(Boolean) : result.director || [],
        actor: typeof result.actor === 'string' ? result.actor.split(',').filter(Boolean) : result.actor || [],
        year: result.year ? parseInt(result.year) : undefined,
      });

      if (isNormalizeMode) {
        const u = String(result.update || '').trim().toUpperCase();
        if (u === 'COPY' || u === 'COPY2') {
          const slug = String(result.slug || '').trim();
          if (slug) {
            await loadOriginalBySlug(slug);
          }
        }
      }

      const preview =
        normalizeMovieImageUrl(result.poster_url || '', 'poster') ||
        (posterSlug ? buildImageUrlFromSlug(posterSlug, 'poster') : '') ||
        (thumbSlug ? buildImageUrlFromSlug(thumbSlug, 'thumb') : '');
      setPosterPreview(preview);
    } catch (e: any) {
      message.error(e?.message || 'Không thể tải thông tin phim');
    } finally {
      setLoading(false);
    }
  };

  const fetchTMDBData = async () => {
    const tmdbId = form.getFieldValue('tmdb_id');
    if (!tmdbId) {
      message.warning('Vui lòng nhập TMDB ID');
      return;
    }

    const tmdbApiKey = (import.meta as any).env?.VITE_TMDB_API_KEY;
    if (!tmdbApiKey) {
      message.error('Thiếu VITE_TMDB_API_KEY (TMDB API key). Hãy cấu hình trong admin/.env');
      return;
    }

    setFetchingTMDB(true);
    try {
      const currentType = String(form.getFieldValue('type') || typeFromQuery || '').trim();
      const useTvEndpoint = currentType === 'series' || currentType === 'tvshows' || currentType === 'hoathinh';
      const resource = useTvEndpoint ? 'tv' : 'movie';

      // Call TMDB API
      const res = await fetch(
        `https://api.themoviedb.org/3/${resource}/${tmdbId}?api_key=${tmdbApiKey}&language=vi-VN&region=VN&append_to_response=translations`
      );

      if (!res.ok) {
        throw new Error('Không tìm thấy phim trên TMDB');
      }

      const data = await res.json();

      // Also fetch credits for director and cast
      const creditsRes = await fetch(`https://api.themoviedb.org/3/${resource}/${tmdbId}/credits?api_key=${tmdbApiKey}`);
      const credits = creditsRes.ok ? await creditsRes.json() : { crew: [], cast: [] };

      const directors = credits.crew?.filter((c: any) => c.job === 'Director' || c.job === 'Creator').map((c: any) => c.name) || [];
      const actors = credits.cast?.slice(0, 10).map((c: any) => c.name) || [];

      const titleVi = useTvEndpoint ? (data.name || data.original_name) : (data.title || data.original_title);
      const originName = useTvEndpoint ? (data.original_name || data.name) : (data.original_title || data.title);
      const dateStr = useTvEndpoint ? (data.first_air_date || '') : (data.release_date || '');
      const year = dateStr ? parseInt(String(dateStr).split('-')[0]) : new Date().getFullYear();
      const runtimeMin = useTvEndpoint
        ? (Array.isArray(data.episode_run_time) && data.episode_run_time.length ? Number(data.episode_run_time[0]) : 0)
        : Number(data.runtime || 0);

      const tmdbData = {
        title: titleVi,
        origin_name: originName,
        // Theo yêu cầu: ảnh dọc (poster_path) => thumb, ảnh ngang (backdrop_path) => poster
        poster_url: data.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : '',
        thumb_url: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
        year,
        genre: normalizeGenres(data.genres?.map((g: any) => g?.name).filter(Boolean) || []),
        country: normalizeCountries(useTvEndpoint ? (data.origin_country || []).map((x: any) => ({ iso_3166_1: x })) : (data.production_countries || [])),
        description: data.overview,
        time: runtimeMin ? `${runtimeMin} phút` : '',
        director: directors,
        actor: actors,
      };

      form.setFieldsValue(tmdbData);
      if (tmdbData.poster_url) {
        setPosterPreview(tmdbData.poster_url);
      }
      message.success('Đã lấy thông tin từ TMDB');
    } catch (e: any) {
      message.error(e?.message || 'Không thể lấy dữ liệu từ TMDB');
    } finally {
      setFetchingTMDB(false);
    }
  };

  const handleSave = async (values: MovieForm) => {
    if (!spreadsheetId) {
      message.error('Chưa cấu hình Google Sheets ID');
      return;
    }
    if (!serviceAccountKey) {
      message.error('Chưa cấu hình Service Account Key');
      return;
    }
    setSaving(true);
    try {
      const base = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const apiBase = base || window.location.origin;

      const posterSlug = extractImageSlug(values.poster_url || '');
      const thumbSlug = extractImageSlug(values.thumb_url || '');

      // Convert arrays to comma-separated strings
      const payload = {
        ...values,
        id: isNew ? undefined : id,
        spreadsheetId,
        serviceAccountKey,
        poster_url: posterSlug,
        thumb_url: thumbSlug,
        genre: Array.isArray(values.genre) ? values.genre.join(',') : values.genre,
        country: Array.isArray(values.country) ? values.country.join(',') : values.country,
        director: Array.isArray(values.director) ? values.director.join(',') : values.director,
        actor: Array.isArray(values.actor) ? values.actor.join(',') : values.actor,
      };

      const res = await fetch(`${apiBase}/api/movies?action=save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const result = await res.json();
      if (result.error) {
        throw new Error(result.error);
      }

      message.success(isNew ? 'Đã thêm phim mới' : 'Đã cập nhật phim');

      if (isNew) {
        navigate(`/movies/${values.type}`);
      }
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handlePosterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPosterPreview(normalizeMovieImageUrl(e.target.value, 'poster'));
  };

  return (
    <Spin spinning={loading} tip="Đang tải...">
      <div>
        {isNormalizeMode && originalMovie ? (
          <Card title="Dữ liệu bản gốc (chỉ đọc)" style={{ marginBottom: 16 }}>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Title</div>
                <div style={{ color: '#666' }}>{String(originalMovie.title || '')}</div>
                <Button style={{ marginTop: 8 }} onClick={() => applyFromOriginal('title')}>Chuyển dữ liệu</Button>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Origin name</div>
                <div style={{ color: '#666' }}>{String(originalMovie.origin_name || '')}</div>
                <Button style={{ marginTop: 8 }} onClick={() => applyFromOriginal('origin_name')}>Chuyển dữ liệu</Button>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Thumb</div>
                <div style={{ color: '#666' }}>{String(originalMovie.thumb_url || originalMovie.thumb || '')}</div>
                <Button style={{ marginTop: 8 }} onClick={() => applyFromOriginal('thumb_url')}>Chuyển dữ liệu</Button>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Poster</div>
                <div style={{ color: '#666' }}>{String(originalMovie.poster_url || originalMovie.poster || '')}</div>
                <Button style={{ marginTop: 8 }} onClick={() => applyFromOriginal('poster_url')}>Chuyển dữ liệu</Button>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Năm</div>
                <div style={{ color: '#666' }}>{String(originalMovie.year || '')}</div>
                <Button style={{ marginTop: 8 }} onClick={() => applyFromOriginal('year')}>Chuyển dữ liệu</Button>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Thể loại</div>
                <div style={{ color: '#666' }}>{String(originalMovie.genre || '')}</div>
                <Button style={{ marginTop: 8 }} onClick={() => applyFromOriginal('genre')}>Chuyển dữ liệu</Button>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Quốc gia</div>
                <div style={{ color: '#666' }}>{String(originalMovie.country || '')}</div>
                <Button style={{ marginTop: 8 }} onClick={() => applyFromOriginal('country')}>Chuyển dữ liệu</Button>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Mô tả</div>
                <div style={{ color: '#666', whiteSpace: 'pre-wrap' }}>{String(originalMovie.description || '')}</div>
                <Button style={{ marginTop: 8 }} onClick={() => applyFromOriginal('description')}>Chuyển dữ liệu</Button>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>TMDB</div>
                <div style={{ color: '#666' }}>{String(originalMovie.tmdb_id || '')}</div>
                <Button style={{ marginTop: 8 }} onClick={() => applyFromOriginal('tmdb_id')}>Chuyển dữ liệu</Button>
              </Col>
            </Row>
          </Card>
        ) : null}

        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
                Quay lại
              </Button>
              <Title level={3} style={{ margin: 0 }}>
                {isNew ? 'Thêm phim mới' : 'Chỉnh sửa phim'}
              </Title>
            </Space>
          </Col>
          <Col>
            <Space>
              {!isNew && (
                <Button
                  icon={<LinkOutlined />}
                  onClick={() =>
                    window.open(
                      `${window.location.origin}/movies/episodes/${id}?type=${form.getFieldValue('type')}`,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  Chỉnh sửa link
                </Button>
              )}
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => form.submit()}
                loading={saving}
              >
                Lưu
              </Button>
            </Space>
          </Col>
        </Row>

        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Row gutter={16}>
            <Col xs={24} lg={16}>
              <Card title="Lấy dữ liệu từ TMDB" style={{ marginBottom: 16 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Row gutter={16} align="middle">
                    <Col flex="auto">
                      <Form.Item name="tmdb_id" label="TMDB ID" style={{ margin: 0 }}>
                        <Input placeholder="Nhập TMDB ID để tự động lấy thông tin" />
                      </Form.Item>
                    </Col>
                    <Col>
                      <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        onClick={fetchTMDBData}
                        loading={fetchingTMDB}
                      >
                        Lấy dữ liệu
                      </Button>
                    </Col>
                  </Row>
                </Space>
              </Card>

              <Card title="Thông tin cơ bản" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="title"
                      label="Tên phim (Tiếng Việt)"
                      rules={[{ required: true, message: 'Vui lòng nhập tên phim' }]}
                    >
                      <Input placeholder="Nhập tên phim tiếng Việt" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="origin_name"
                      label="Tên gốc (Tiếng Anh)"
                      rules={[{ required: true, message: 'Vui lòng nhập tên gốc' }]}
                    >
                      <Input placeholder="Nhập tên gốc tiếng Anh" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="type"
                      label="Loại phim"
                      rules={[{ required: true }]}
                    >
                      <Select placeholder="Chọn loại phim">
                        {TYPE_OPTIONS.map((opt) => (
                          <Option key={opt.value} value={opt.value}>
                            {opt.label}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="year"
                      label="Năm phát hành"
                      rules={[{ required: true }]}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={1900}
                        max={2100}
                        placeholder="Năm"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="quality"
                      label="Chất lượng"
                      rules={[{ required: true }]}
                    >
                      <Select placeholder="Chọn chất lượng">
                        {QUALITY_OPTIONS.map((opt) => (
                          <Option key={opt.value} value={opt.value}>
                            {opt.label}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="status"
                      label="Trạng thái"
                      rules={[{ required: true }]}
                    >
                      <Select placeholder="Chọn trạng thái">
                        {STATUS_OPTIONS.map((opt) => (
                          <Option key={opt.value} value={opt.value}>
                            {opt.label}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="episode_current"
                      label="Tập hiện tại"
                    >
                      <Input placeholder="VD: 10" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="episode_total"
                      label="Tổng số tập"
                    >
                      <Input placeholder="VD: 16" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  name="genre"
                  label="Thể loại"
                  rules={[{ required: true, message: 'Vui lòng chọn thể loại' }]}
                >
                  <Select mode="multiple" placeholder="Chọn thể loại">
                    {GENRE_OPTIONS.map((g) => (
                      <Option key={g} value={g}>
                        {g}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  name="country"
                  label="Quốc gia"
                  rules={[{ required: true, message: 'Vui lòng chọn quốc gia' }]}
                >
                  <Select mode="multiple" placeholder="Chọn quốc gia">
                    {COUNTRY_OPTIONS.map((c) => (
                      <Option key={c} value={c}>
                        {c}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="time" label="Thời lượng">
                      <Input placeholder="VD: 120 phút" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="language" label="Ngôn ngữ">
                      <Input placeholder="VD: Vietsub, Thuyết minh" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="showtimes"
                      label="Showtimes (lịch chiếu)"
                      extra="Sheet: cột showtimes. VD: 'Tập mới mỗi thứ 6' hoặc để trống nếu không có."
                    >
                      <Input placeholder="VD: Tập mới mỗi thứ 6" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="is_exclusive"
                      label="Exclusive"
                      valuePropName="checked"
                      extra="Sheet: cột is_exclusive. Build nhận 0/1 hoặc true/false. Bật nếu là phim độc quyền."
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  name="update"
                  label="Update"
                  extra="Sheet: cột update (không bắt buộc). NEW: ép build coi phim thay đổi và có thể tự đổi NEW→OK sau build; OK: bản ổn định (export không ghi đè); COPY: dòng lịch sử."
                >
                  <Select allowClear placeholder="(tùy chọn)">
                    {UPDATE_OPTIONS.map((o) => (
                      <Option key={o.value} value={o.value}>
                        {o.label}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item name="description" label="Mô tả phim">
                  <TextArea
                    rows={4}
                    placeholder="Nhập mô tả phim..."
                    showCount
                    maxLength={2000}
                  />
                </Form.Item>
              </Card>
            </Col>

            <Col xs={24} lg={8}>
              <Card title="Poster phim" style={{ marginBottom: 16 }}>
                <Form.Item
                  name="poster_url"
                  label="URL Poster"
                  rules={[{ required: true, message: 'Vui lòng nhập URL poster' }]}
                >
                  <Input
                    placeholder="https://..."
                    onChange={handlePosterChange}
                  />
                </Form.Item>

                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <Image
                    src={posterPreview || 'https://via.placeholder.com/300x450?text=No+Image'}
                    alt="Poster preview"
                    style={{ maxWidth: '100%', borderRadius: 8 }}
                    fallback="https://via.placeholder.com/300x450?text=Error"
                  />
                </div>

                <Divider />

                <Form.Item name="thumb_url" label="URL Thumbnail (nếu có)">
                  <Input placeholder="https://..." />
                </Form.Item>
              </Card>

              <Card title="Thông tin bổ sung">
                <Form.Item name="director" label="Đạo diễn">
                  <Select mode="tags" placeholder="Nhập tên đạo diễn" />
                </Form.Item>

                <Form.Item name="actor" label="Diễn viên">
                  <Select mode="tags" placeholder="Nhập tên diễn viên" />
                </Form.Item>
              </Card>
            </Col>
          </Row>
        </Form>
      </div>
    </Spin>
  );
}
