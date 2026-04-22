import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
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
import { getApiBaseUrl } from '../lib/api';
import { getAdminApiAuthHeaders } from '../lib/adminAuth';
import { useAdminRole } from '../context/AdminRoleContext';
import {
  buildCdnMovieImageUrlBySlug,
  buildOphimUploadsImageUrlByStem,
  extractImageFileStem,
} from '../lib/movie-image-urls';
import { parseViteTmdbKeys, fetchWithTmdbKeyRotation } from '../lib/tmdb-fetch';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface MovieForm {
  id?: string;
  title: string;
  origin_name: string;
  slug: string;
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
  language: string;
  showtimes: string;
  chieurap: boolean;
  is_exclusive: boolean;
  update?: string;
}

const STATUS_OPTIONS = [
  { value: 'ongoing', label: 'Đang cập nhật' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'trailer', label: 'Trailer' },
];

/** DB: text 0|1; Switch cần boolean — trong JS chuỗi '0' vẫn truthy nên phải parse. */
function coerceBoolFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '' || s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  return false;
}

const LANGUAGE_OPTIONS = [
  { value: 'Vietsub', label: 'Vietsub' },
  { value: 'Thuyết minh', label: 'Thuyết minh' },
  { value: 'Lồng tiếng', label: 'Lồng tiếng' },
  { value: 'Raw', label: 'Raw' },
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
  { value: 'TIME-EXCLUSIVE', label: 'TIME-EXCLUSIVE' },
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
  const [saving, setSaving] = useState(false);
  const [fetchingTMDB, setFetchingTMDB] = useState(false);
  const [posterPreview, setPosterPreview] = useState('');
  const [thumbPreview, setThumbPreview] = useState('');
  const [r2ImgDomain, setR2ImgDomain] = useState<string>('');
  const [ophimImgDomain, setOphimImgDomain] = useState<string>('');
  const [configReady, setConfigReady] = useState<boolean>(false);
  const { isAdmin } = useAdminRole();
  const isNew = id === 'new';

  const refreshSourcePreviews = (next?: { poster?: any; thumb?: any }) => {
    const posterRaw = next && next.poster != null ? next.poster : form.getFieldValue('poster_url');
    const thumbRaw = next && next.thumb != null ? next.thumb : form.getFieldValue('thumb_url');
    const slugForCdn = String(form.getFieldValue('slug') || '').trim();

    const p0 = normalizeMovieImageUrl(String(posterRaw || '').trim(), 'poster');
    const t0 = normalizeMovieImageUrl(String(thumbRaw || '').trim(), 'thumb');

    const p = p0 || (slugForCdn ? buildRepoMovieImageUrlBySlug(slugForCdn, 'poster') : '');
    const t = t0 || (slugForCdn ? buildRepoMovieImageUrlBySlug(slugForCdn, 'thumb') : '');

    setPosterPreview(p);
    setThumbPreview(t);
  };

  useEffect(() => {
    const loadConfig = async () => {
      const { data: settings, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['r2_img_domain', 'ophim_img_domain']);

      if (!error && settings) {
        const r2Domain = settings.find((s) => s.key === 'r2_img_domain')?.value;
        const ophimDomain = settings.find((s) => s.key === 'ophim_img_domain')?.value;
        if (r2Domain) setR2ImgDomain(r2Domain);
        if (ophimDomain) setOphimImgDomain(ophimDomain);
      } else {
        try {
          const apiBase = getApiBaseUrl();
          const fallbackRes = await fetch(`${apiBase}/api/movies?action=readonlySiteConfig`, {
            headers: {
              ...(await getAdminApiAuthHeaders()),
            },
          });
          const fallbackJson = await fallbackRes.json().catch(() => ({}));
          const fallbackSettings = (fallbackJson as any)?.data || {};
          if (fallbackRes.ok) {
            if (fallbackSettings?.r2_img_domain) setR2ImgDomain(String(fallbackSettings.r2_img_domain));
            if (fallbackSettings?.ophim_img_domain) setOphimImgDomain(String(fallbackSettings.ophim_img_domain));
          }
        } catch {
          // Keep empty domains and rely on raw URLs.
        }
      }
      setConfigReady(true);
    };
    loadConfig();
  }, []);

  /** CDN/repo: …/thumbs|posters/{shard}/{slug}.webp */
  const buildRepoMovieImageUrlBySlug = (movieSlug: string, kind: 'thumb' | 'poster') => {
    const s = String(movieSlug || '').trim();
    if (!s) return '';
    const r2u = buildCdnMovieImageUrlBySlug(r2ImgDomain, s, kind);
    if (r2u) return r2u;
    return buildOphimUploadsImageUrlByStem(ophimImgDomain, s, kind);
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
    const stem = extractImageFileStem(u, { r2Origin: r2ImgDomain, ophimOrigin: ophimImgDomain });
    if (!stem) return u;
    if (/^https?:\/\//i.test(stem)) return stem;
    if (stem.startsWith('/')) return u;
    return buildRepoMovieImageUrlBySlug(stem, kind);
  };

  // Load movie data
  useEffect(() => {
    if (!configReady) return; // Wait for config to load first
    if (!isNew && id) {
      loadMovie(id);
    } else if (isNew) {
      const existingId = String(form.getFieldValue('id') || '').trim();
      if (!existingId) {
        form.setFieldsValue({ id: String(Date.now()) });
      }
      // Set default values for new movie
      form.setFieldsValue({
        type: typeFromQuery,
        year: new Date().getFullYear(),
        status: 'current',
        chieurap: false,
        quality: 'HD',
        genre: [],
        country: [],
        language: '',
        is_exclusive: false,
        update: '',
      });
      refreshSourcePreviews();
    }
  }, [id, typeFromQuery, configReady]);

  const loadMovie = async (movieId: string) => {
    if (!configReady) return;
    setLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/movies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAdminApiAuthHeaders()) },
        body: JSON.stringify({
          action: 'get',
          id: movieId,
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

      // Parse arrays from comma-separated strings
      form.setFieldsValue({
        ...result,
        genre: typeof result.genre === 'string' ? result.genre.split(',').filter(Boolean) : result.genre || [],
        country: typeof result.country === 'string' ? result.country.split(',').filter(Boolean) : result.country || [],
        director: typeof result.director === 'string' ? result.director.split(',').filter(Boolean) : result.director || [],
        actor: typeof result.actor === 'string' ? result.actor.split(',').filter(Boolean) : result.actor || [],
        year: result.year ? parseInt(result.year) : undefined,
        chieurap: coerceBoolFlag(result.chieurap),
        is_exclusive: coerceBoolFlag(result.is_exclusive),
      });

      refreshSourcePreviews({ poster: result.poster_url || '', thumb: result.thumb_url || '' });
    } catch (e: any) {
      message.error(e?.message || 'Không thể tải thông tin phim');
    } finally {
      setLoading(false);
    }
  };

  const fetchTMDBData = async () => {
    const tmdbTypeRaw = String(form.getFieldValue('tmdb_type') || '').trim().toLowerCase();
    const tmdbType: 'movie' | 'tv' | '' = (tmdbTypeRaw === 'movie' || tmdbTypeRaw === 'tv') ? (tmdbTypeRaw as any) : '';
    if (!tmdbType) {
      message.warning('Vui lòng chọn TMDB Type (movie hoặc tv)');
      return;
    }
    const rawTmdbId = form.getFieldValue('tmdb_id');
    const tmdbId = (() => {
      const s = String(rawTmdbId ?? '').trim();
      if (!s) return '';
      // Allow pasting full TMDB URLs or text like "movie/123".
      const m = s.match(/\b(\d{2,})\b/);
      return m ? m[1] : s;
    })();
    if (!tmdbId) {
      message.warning('Vui lòng nhập TMDB ID');
      return;
    }

    const tmdbKeys = parseViteTmdbKeys();
    if (!tmdbKeys.length) {
      message.error(
        'Thiếu VITE_TMDB_API_KEY (hoặc VITE_TMDB_API_KEYS). Hãy cấu hình trong Vercel / admin/.env'
      );
      return;
    }

    setFetchingTMDB(true);
    try {
      const asStr = (v: any) => String(v ?? '').trim();
      const safeJson = async (r: Response) => r.json().catch(async () => ({ error: await r.text() }));
      const pickTranslation = (translations: any, iso639: string) => {
        const arr = translations && Array.isArray(translations.translations) ? translations.translations : [];
        const found = arr.find((t: any) => String(t?.iso_639_1 || '').toLowerCase() === String(iso639).toLowerCase());
        return found?.data || null;
      };

      const fetchDetails = async (resource: 'movie' | 'tv', language: string) => {
        const res = await fetchWithTmdbKeyRotation(
          (k) =>
            `https://api.themoviedb.org/3/${resource}/${tmdbId}?api_key=${encodeURIComponent(
              k
            )}&language=${encodeURIComponent(language)}&region=VN&append_to_response=translations`
        );
        return { ok: res.ok, status: res.status, data: await safeJson(res) };
      };

      const viRes = await fetchDetails(tmdbType, 'vi-VN');
      if (!viRes.ok || !viRes.data || (viRes.data as any)?.error) {
        throw new Error('Không tìm thấy phim trên TMDB');
      }
      const resource: 'movie' | 'tv' = tmdbType;
      const viData: any = viRes.data;

      // Fallback EN for missing fields
      const enData = await fetchDetails(resource, 'en-US').then((r) => (r.ok ? r.data : null)).catch(() => null);
      const viTrans = pickTranslation((viData as any)?.translations, 'vi');

      // Credits (names usually not localized by TMDB)
      const creditsRes = await fetchWithTmdbKeyRotation(
        (k) => `https://api.themoviedb.org/3/${resource}/${tmdbId}/credits?api_key=${encodeURIComponent(k)}`
      );
      const credits = creditsRes.ok ? await safeJson(creditsRes) : { crew: [], cast: [] };

      const crew = Array.isArray((credits as any)?.crew) ? (credits as any).crew : [];
      const cast = Array.isArray((credits as any)?.cast) ? (credits as any).cast : [];
      const createdBy = Array.isArray((viData as any)?.created_by) ? (viData as any).created_by : [];

      const directors = [
        ...crew
          .filter((c: any) => String(c?.job || '') === 'Director')
          .map((c: any) => c?.name)
          .filter(Boolean),
        ...createdBy.map((c: any) => c?.name).filter(Boolean),
      ].map((x: any) => String(x)).filter(Boolean);

      const actors = cast
        .slice(0, 10)
        .map((c: any) => c?.name)
        .filter(Boolean)
        .map((x: any) => String(x));

      const titleVi =
        asStr(viTrans?.title) ||
        asStr(viTrans?.name) ||
        (resource === 'tv' ? asStr((enData as any)?.name) : asStr((enData as any)?.title)) ||
        (resource === 'tv' ? asStr((viData as any).original_name) : asStr((viData as any).original_title));

      const originName =
        (resource === 'tv' ? asStr((viData as any).original_name) : asStr((viData as any).original_title)) ||
        (resource === 'tv' ? asStr((viData as any).name) : asStr((viData as any).title)) ||
        (resource === 'tv' ? asStr((enData as any)?.original_name) : asStr((enData as any)?.original_title)) ||
        (resource === 'tv' ? asStr((enData as any)?.name) : asStr((enData as any)?.title));

      const overviewVi =
        asStr(viTrans?.overview) ||
        asStr((enData as any)?.overview);

      const dateStr =
        resource === 'tv'
          ? asStr((viData as any).first_air_date) || asStr((enData as any)?.first_air_date)
          : asStr((viData as any).release_date) || asStr((enData as any)?.release_date);
      const year = dateStr ? parseInt(String(dateStr).split('-')[0]) : new Date().getFullYear();

      const episodeCount = Number((viData as any)?.number_of_episodes || (enData as any)?.number_of_episodes || 0);
      const seasonCount = Number((viData as any)?.number_of_seasons || (enData as any)?.number_of_seasons || 0);
      const currentTypeRaw = String(form.getFieldValue('type') || typeFromQuery || '').trim();
      const suggestedType = resource === 'movie' ? 'single' : (episodeCount > 1 || seasonCount > 1 ? 'series' : 'single');
      const nextType =
        !currentTypeRaw || currentTypeRaw === 'single' || currentTypeRaw === 'series'
          ? suggestedType
          : currentTypeRaw;

      // Theo yêu cầu: ảnh dọc (poster_path) => thumb, ảnh ngang (backdrop_path) => poster
      const backdropPath = asStr((viData as any).backdrop_path) || asStr((enData as any)?.backdrop_path);
      const posterPath = asStr((viData as any).poster_path) || asStr((enData as any)?.poster_path);

      const posterUrl = (backdropPath
        ? `https://image.tmdb.org/t/p/w780${backdropPath}`
        : (posterPath ? `https://image.tmdb.org/t/p/w780${posterPath}` : ''));
      const thumbUrl = (posterPath
        ? `https://image.tmdb.org/t/p/w500${posterPath}`
        : (backdropPath ? `https://image.tmdb.org/t/p/w500${backdropPath}` : ''));

      const genres = (viData as any).genres || (enData as any)?.genres || [];
      const countries =
        resource === 'tv'
          ? ((viData as any).origin_country || (enData as any)?.origin_country || []).map((x: any) => ({ iso_3166_1: x }))
          : ((viData as any).production_countries || (enData as any)?.production_countries || []);

      const tmdbData = {
        type: nextType,
        title: titleVi,
        origin_name: originName,
        poster_url: posterUrl,
        thumb_url: thumbUrl,
        year,
        genre: normalizeGenres((genres || []).map((g: any) => g?.name).filter(Boolean) || []),
        country: normalizeCountries(countries),
        description: overviewVi,
        director: directors,
        actor: actors,
      };

      form.setFieldsValue(tmdbData);
      refreshSourcePreviews({ poster: tmdbData.poster_url, thumb: tmdbData.thumb_url });
      message.success('Đã lấy thông tin từ TMDB');
    } catch (e: any) {
      message.error(e?.message || 'Không thể lấy dữ liệu từ TMDB');
    } finally {
      setFetchingTMDB(false);
    }
  };

  const handleSave = async (values: MovieForm) => {
    if (!isAdmin) {
      message.warning('Chế độ chỉ xem: tài khoản không có quyền lưu/cập nhật.');
      return;
    }
    setSaving(true);
    try {
      const apiBase = getApiBaseUrl();

      const movieId = isNew ? String(values.id || '').trim() : String(id || '').trim();
      if (isNew && !movieId) {
        throw new Error('Thiếu id phim (không thể upload ảnh theo id)');
      }

      const updateMode = String(values.update || '').trim().toUpperCase();
      if (updateMode === 'TIME-EXCLUSIVE') {
        if (isNew) {
          throw new Error('TIME-EXCLUSIVE chỉ dùng khi cập nhật phim đã tồn tại');
        }

        const res = await fetch(`${apiBase}/api/movies?action=updateShowtimesExclusive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAdminApiAuthHeaders()) },
          body: JSON.stringify({
            id: movieId,
            showtimes: String(values.showtimes || '').trim(),
            is_exclusive: Boolean(values.is_exclusive),
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

        // Trigger build to apply showtimes changes
        try {
          await fetch(`${apiBase}/api/trigger-build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await getAdminApiAuthHeaders()) },
            body: JSON.stringify({ reason: 'update_showtimes_exclusive', id: movieId }),
          });
        } catch (e) {
          // ignore build trigger errors here; user can manually trigger
        }

        message.success('Đã cập nhật showtimes + exclusive và trigger build');
        refreshSourcePreviews();
        return;
      }

      // Convert arrays to comma-separated strings
      const payload = {
        ...values,
        id: movieId,
        poster_url: String(values.poster_url || '').trim(),
        thumb_url: String(values.thumb_url || '').trim(),
        genre: Array.isArray(values.genre) ? values.genre.join(',') : values.genre,
        country: Array.isArray(values.country) ? values.country.join(',') : values.country,
        director: Array.isArray(values.director) ? values.director.join(',') : values.director,
        actor: Array.isArray(values.actor) ? values.actor.join(',') : values.actor,
      };

      const res = await fetch(`${apiBase}/api/movies?action=save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAdminApiAuthHeaders()) },
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

      refreshSourcePreviews();

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
    refreshSourcePreviews({ poster: e.target.value });
  };

  const handleThumbChange = (e: ChangeEvent<HTMLInputElement>) => {
    refreshSourcePreviews({ thumb: e.target.value });
  };

  return (
    <Spin spinning={loading} tip="Đang tải...">
      <div>
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
                disabled={!isAdmin}
                title={!isAdmin ? 'Chỉ admin mới được lưu.' : undefined}
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
                    <Col>
                      <Form.Item
                        name="tmdb_type"
                        label="TMDB Type"
                        style={{ margin: 0 }}
                      >
                        <Select
                          style={{ width: 140 }}
                          placeholder="movie/tv"
                          options={[
                            { label: 'movie', value: 'movie' },
                            { label: 'tv', value: 'tv' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
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
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="slug"
                      label="Slug"
                      rules={[
                        { required: true, message: 'Vui lòng nhập slug' },
                      ]}
                    >
                      <Input placeholder="vd: than-kiem-hanh" onChange={() => refreshSourcePreviews()} />
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
                    <Form.Item name="language" label="Ngôn ngữ">
                      <Select
                        placeholder="Chọn ngôn ngữ"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={LANGUAGE_OPTIONS}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="chieurap"
                      label="Phim chiếu rạp"
                      valuePropName="checked"
                      extra="Cột chieurap (DB). Bật nếu là phim chiếu rạp."
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="showtimes"
                      label="Showtimes (lịch chiếu)"
                      extra="Cột showtimes (DB). VD: 'Tập mới mỗi thứ 6' hoặc để trống nếu không có."
                    >
                      <Input.TextArea rows={2} placeholder="VD: Tập mới mỗi thứ 6" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="is_exclusive"
                      label="Exclusive"
                      valuePropName="checked"
                      extra="Cột is_exclusive (DB). Build nhận 0/1 hoặc true/false. Bật nếu là phim độc quyền."
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  name="update"
                  label="Update"
                  extra="Cột update (không bắt buộc). NEW: ép build coi phim thay đổi; sau build/update sẽ tự clear về trống."
                >
                  <Select placeholder="Chọn update" allowClear>
                    {UPDATE_OPTIONS.map((o) => (
                      <Select.Option key={o.value} value={o.value}>
                        {o.label}
                      </Select.Option>
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
                <Form.Item name="id" label="ID" rules={[{ required: true, message: 'Thiếu ID' }]}>
                  <Input
                    disabled={!isNew}
                    placeholder={isNew ? 'Nhập ID (vd: 123456)' : undefined}
                    onChange={() => {
                      refreshSourcePreviews();
                    }}
                  />
                </Form.Item>

                <Form.Item
                  name="poster_url"
                  label="URL Poster"
                  rules={[{ required: isNew, message: 'Vui lòng nhập URL poster' }]}
                  extra="Trên repo CDN (workflow / build): posters/{2 ký tự đầu slug}/{slug}.webp — cùng thư mục thumbs|posters. Xem trước khi ô URL trống dùng slug phim."
                >
                  <Input placeholder="https://... hoặc để trống nếu đã có file theo id" onChange={handlePosterChange} />
                </Form.Item>

                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <Image
                    src={posterPreview || '/images/default_poster.png'}
                    alt="Poster preview"
                    style={{ maxWidth: '100%', borderRadius: 8 }}
                    fallback="/images/default_poster.png"
                  />
                </div>

                <Divider />

                <Form.Item
                  name="thumb_url"
                  label="URL Thumbnail (nếu có)"
                  extra="Trên repo CDN: thumbs/{shard}/{slug}.webp."
                >
                  <Input placeholder="https://... hoặc để trống nếu đã có file theo id" onChange={handleThumbChange} />
                </Form.Item>

                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <Image
                    src={thumbPreview || '/images/default_thumb.png'}
                    alt="Thumb preview"
                    style={{ maxWidth: '100%', borderRadius: 8 }}
                    fallback="/images/default_thumb.png"
                  />
                </div>
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
