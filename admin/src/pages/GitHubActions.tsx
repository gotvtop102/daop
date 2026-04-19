import { useState, useEffect, useMemo } from 'react';
import { Card, Button, List, message, Spin, Typography, InputNumber, Input, Form, Space, Modal, Radio, Switch, Tag, Tabs, Select, Checkbox, Divider } from 'antd';
import type { RadioChangeEvent } from 'antd';
import {
  PlayCircleOutlined,
  InfoCircleOutlined,
  SaveOutlined,
  DeleteOutlined,
  DatabaseOutlined,
  CopyOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import { getApiBaseUrl } from '../lib/api';
import { getAdminApiAuthHeaders } from '../lib/adminAuth';
import { useAdminRole } from '../context/AdminRoleContext';
import { buildCdnMovieImageUrlBySlug } from '../lib/movie-image-urls';

const { Text } = Typography;
const OPHIM_BASE = (((import.meta as any).env?.VITE_OPHIM_BASE_URL) || 'https://ophim1.com/v1/api').replace(/\/$/, '');
const OPHIM_KEYS = {
  start_page: 'ophim_start_page',
  end_page: 'ophim_end_page',
};
const OPHIM_AUTO_KEYS = {
  start_page: 'ophim_auto_start_page',
  end_page: 'ophim_auto_end_page',
};

const UPDATE_DATA_TWO_PHASE_KEY = 'update_data_two_phase';
const UPDATE_DATA_MANUAL_TWO_PHASE_KEY = 'update_data_manual_two_phase';
const UPLOAD_IMAGES_AFTER_BUILD_KEY = 'upload_images_after_build';
const DEPLOY_AFTER_R2_UPLOAD_KEY = 'deploy_after_r2_upload';

const R2_PREFIX_PRESETS_KEY = 'r2_prefix_presets';
const R2_IMG_DOMAIN_KEY = 'r2_img_domain';

const UPLOAD_R2_KEYS = {
  mode: 'upload_r2_mode',
  quality: 'upload_r2_quality',
  thumb_quality: 'upload_r2_thumb_quality',
  poster_quality: 'upload_r2_poster_quality',
  thumb_width: 'upload_r2_thumb_width',
  thumb_height: 'upload_r2_thumb_height',
  poster_width: 'upload_r2_poster_width',
  poster_height: 'upload_r2_poster_height',
  limit: 'upload_r2_limit',
  concurrency: 'upload_r2_concurrency',
  reupload_existing: 'upload_r2_reupload_existing',
};

type ActionItem = {
  id: string;
  name: string;
  description: string;
};

type WorkflowRunItem = {
  id: number;
  name: string;
  display_title?: string;
  event: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_attempt?: number;
  actor?: { login?: string };
};

const EXTRA_ACTIONS = [
  {
    id: 'deploy',
    name: 'Deploy to Cloudflare Pages',
    description: 'Tự chạy khi push lên nhánh main. Không kích hoạt thủ công.',
    triggerable: false,
  },
  {
    id: 'purge-movie-data',
    name: 'Purge movie data',
    description: 'Xóa sạch dữ liệu phim đã build trong public/data (giữ config) để chạy update data lại từ đầu.',
    triggerable: true,
    danger: true,
  },
  {
    id: 'clean-rebuild',
    name: 'Clean & Rebuild',
    description: 'Xóa toàn bộ dữ liệu cũ (batches, movies-light, actors…) rồi full build lại từ đầu.',
    triggerable: true,
    danger: true,
  },
];

export default function GitHubActions() {
  const { isAdmin } = useAdminRole();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runs, setRuns] = useState<WorkflowRunItem[]>([]);
  const [twoPhase, setTwoPhase] = useState(false);
  const [autoTwoPhase, setAutoTwoPhase] = useState(false);
  const [autoUploadImagesAfterBuild, setAutoUploadImagesAfterBuild] = useState(false);
  const [deployAfterR2Upload, setDeployAfterR2Upload] = useState(false);
  const [updateSettings, setUpdateSettings] = useState<{ start_page: number; end_page: number }>({
    start_page: 1,
    end_page: 1,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [totalMovies, setTotalMovies] = useState<number | null>(null);
  const [fetchingTotalPages, setFetchingTotalPages] = useState(false);
  const [savingUploadSettings, setSavingUploadSettings] = useState(false);
  const [r2PrefixPresetsText, setR2PrefixPresetsText] = useState('');
  const [savingR2PrefixPresets, setSavingR2PrefixPresets] = useState(false);
  const [form] = Form.useForm();
  const [uploadForm] = Form.useForm();
  const [deleteForm] = Form.useForm();
  const [uploadUrlsForm] = Form.useForm();

  const [r2LinkBaseUrl, setR2LinkBaseUrl] = useState('');
  const [r2LinkSlugsText, setR2LinkSlugsText] = useState('');
  const [r2LinkOutput, setR2LinkOutput] = useState('');
  const [r2LinkPrefixes, setR2LinkPrefixes] = useState<string[]>(['thumbs', 'posters']);
  const [r2LinkMode, setR2LinkMode] = useState<'by_slug' | 'by_prefix'>('by_slug');
  const [r2ListUrlsLoading, setR2ListUrlsLoading] = useState(false);
  const [r2ListCap, setR2ListCap] = useState<number>(0);

  const [sbMovieCount, setSbMovieCount] = useState<number | null>(null);
  const [sbEpisodeCount, setSbEpisodeCount] = useState<number | null>(null);
  const [sbCountsLoading, setSbCountsLoading] = useState(false);
  const [sbDeleteIdsText, setSbDeleteIdsText] = useState('');
  const [sbDeleting, setSbDeleting] = useState(false);
  const [sbDeletingAll, setSbDeletingAll] = useState(false);

  const parseR2PrefixPresets = (raw: string) => {
    const s = String(raw || '').trim();
    if (!s) return [] as Array<{ label: string; prefix: string; notes: string }>;
    const lines = s
      .split(/[\n\r]+/)
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    const out: Array<{ label: string; prefix: string; notes: string }> = [];
    for (const line of lines) {
      const parts = line.split('|');
      const label = String(parts[0] || '').trim();
      const prefix = String(parts[1] || '').trim();
      const notes = String(parts.slice(2).join('|') || '').trim();
      if (!label || !prefix) continue;
      out.push({ label, prefix, notes });
    }
    return out;
  };

  const normalizePresetPrefixValue = (p: string) => {
    const s = String(p || '').trim();
    if (!s) return '';
    return s.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '');
  };

  const normalizeR2PrefixForDelete = (p: string) => {
    const base = normalizePresetPrefixValue(p);
    if (!base) return '';
    return base.endsWith('/') ? base : base + '/';
  };

  const r2LinkPrefixOptions = useMemo(() => {
    const presets = parseR2PrefixPresets(r2PrefixPresetsText);
    const seen = new Set<string>();
    const opts: { label: string; value: string }[] = [];
    const push = (label: string, value: string) => {
      const v = normalizePresetPrefixValue(value);
      if (!v || seen.has(v)) return;
      seen.add(v);
      opts.push({ label: `${label} → ${v}/`, value: v });
    };
    push('Thumb', 'thumbs');
    push('Poster', 'posters');
    for (const p of presets) {
      const v = normalizePresetPrefixValue(p.prefix);
      if (!v) continue;
      if (!seen.has(v)) push(p.label || v, v);
    }
    return opts;
  }, [r2PrefixPresetsText]);

  const handleGenerateR2Links = () => {
    const base = String(r2LinkBaseUrl || '').trim();
    if (!base) {
      message.warning('Nhập base URL ảnh (Cài đặt trang → Base URL ảnh / jsDelivr …/public).');
      return;
    }
    const slugs = parseSlugList(r2LinkSlugsText);
    if (!slugs.length) {
      message.warning('Nhập ít nhất một slug phim (giống slug trên URL /phim/… và tên file .webp trên repo).');
      return;
    }
    const rawFolders = (r2LinkPrefixes || []).map((x) => normalizePresetPrefixValue(String(x))).filter(Boolean);
    const folderRank = (f: string) => {
      if (f === 'thumbs') return 0;
      if (f === 'posters') return 1;
      return 2;
    };
    const folders = [...rawFolders].sort((a, b) => {
      const ra = folderRank(a);
      const rb = folderRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
    if (!folders.length) {
      message.warning('Chọn ít nhất một prefix (thư mục).');
      return;
    }
    const b = String(base || '').replace(/\/$/, '');
    const lines: string[] = [];
    for (const slug of slugs) {
      for (const folder of folders) {
        const f = normalizePresetPrefixValue(folder);
        if (!f || !slug) continue;
        let u = '';
        if (f === 'thumbs' || f === 'posters') {
          const kind: 'thumb' | 'poster' = f === 'posters' ? 'poster' : 'thumb';
          u = buildCdnMovieImageUrlBySlug(b, slug, kind);
        } else {
          u = `${b}/${f}/${slug}.webp`;
        }
        if (u) lines.push(u);
      }
    }
    setR2LinkOutput(lines.join('\n'));
    message.success(`Đã tạo ${lines.length} link.`);
  };

  const handleCopyR2Links = async () => {
    const t = String(r2LinkOutput || '').trim();
    if (!t) {
      message.warning('Chưa có nội dung để copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(t);
      message.success('Đã copy vào clipboard.');
    } catch {
      message.error('Không copy được (trình duyệt chặn clipboard).');
    }
  };

  const handleDownloadR2LinksFile = () => {
    const t = String(r2LinkOutput || '').trim();
    if (!t) {
      message.warning('Chưa có danh sách link để tải.');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const suffix = r2LinkMode === 'by_prefix' ? 'prefix' : 'by-slug';
    const filename = `image-urls_${suffix}_${stamp}.txt`;
    const blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success(`Đã tải ${filename}`);
  };

  const handleFetchR2UrlsFromBucket = async () => {
    const base = String(r2LinkBaseUrl || '').trim();
    if (!base) {
      message.warning('Nhập base URL ảnh (Cài đặt trang → Base URL ảnh / jsDelivr …/public).');
      return;
    }
    const folders = (r2LinkPrefixes || []).map((x) => normalizePresetPrefixValue(String(x))).filter(Boolean);
    if (!folders.length) {
      message.warning('Chọn ít nhất một prefix (thư mục).');
      return;
    }
    setR2ListUrlsLoading(true);
    try {
      const payload: Record<string, unknown> = { prefixes: folders, public_base: base };
      const cap = Number(r2ListCap) || 0;
      if (cap > 0) payload.limit = cap;
      const res = await fetch(`${getApiBaseUrl()}/api/r2-list-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(async () => ({ error: await res.text() }));
      if (!res.ok || !data?.ok) {
        message.error(data?.error || data?.message || `Lỗi ${res.status}`);
        return;
      }
      const urls: string[] = Array.isArray(data.urls) ? data.urls : [];
      setR2LinkOutput(urls.join('\n'));
      let msg = `Đã lấy ${data.count} link từ repo ảnh.`;
      if (data.capped) {
        msg += ` (dừng ở giới hạn ${data.cap}; tăng «Giới hạn» hoặc đổi REPO_LIST_MAX_KEYS trên server nếu cần.)`;
      }
      message.success(msg);
    } catch (e: any) {
      message.error(e?.message || 'Không gọi được API r2-list-urls.');
    } finally {
      setR2ListUrlsLoading(false);
    }
  };

  const readTextFile = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không đọc được file'));
      reader.readAsText(file);
    });
  };

  const handleSaveR2PrefixPresets = async () => {
    setSavingR2PrefixPresets(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('site_settings')
        .upsert([{ key: R2_PREFIX_PRESETS_KEY, value: String(r2PrefixPresetsText || ''), updated_at: now }], { onConflict: 'key' });
      if (error) throw error;
      message.success('Đã lưu danh sách prefix ảnh.');
    } catch (e: any) {
      message.error(e?.message || 'Lưu danh sách prefix ảnh thất bại.');
    } finally {
      setSavingR2PrefixPresets(false);
    }
  };

  const handleTriggerUploadR2FromUrls = async () => {
    setTriggering('upload-r2-from-urls');
    try {
      const values = await uploadUrlsForm.validateFields();
      const payload: any = { ...values };
      const res = await fetch(`${getApiBaseUrl()}/api/trigger-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload-r2-from-urls', ...payload }),
      });
      const data = await res.json().catch(async () => ({ error: await res.text() }));
      if (res.ok && data?.ok) {
        message.success(data?.message || 'Đã kích hoạt upload ảnh từ URLs.');
      } else {
        message.error(data?.error || data?.message || `Lỗi ${res.status}`);
      }
    } catch (e: any) {
      message.error(e?.message || 'Không kết nối được API.');
    } finally {
      setTriggering(null);
    }
  };

  const handleTriggerUploadR2 = async () => {
    setTriggering('upload-movie-images-r2');
    try {
      const values = uploadForm.getFieldsValue();
      const file: File | null = values.force_slugs_file || null;
      const fileText = file ? await readTextFile(file).catch(() => '') : '';
      const slugs = Array.from(new Set([...(parseSlugList(values.force_slugs) || []), ...parseSlugList(fileText)]));
      const payload = {
        ...values,
        force_slugs: slugs.join('\n'),
        reupload_existing: values.reupload_existing ? 'true' : 'false',
      } as any;
      delete payload.force_slugs_file;
      const res = await fetch(`${getApiBaseUrl()}/api/trigger-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload-movie-images-r2', ...payload }),
      });
      const data = await res.json().catch(async () => ({ error: await res.text() }));
      if (res.ok && data?.ok) {
        message.success(data?.message || 'Đã kích hoạt upload ảnh.');
      } else {
        message.error(data?.error || data?.message || `Lỗi ${res.status}`);
      }
    } catch (e: any) {
      message.error(e?.message || 'Không kết nối được API.');
    } finally {
      setTriggering(null);
    }
  };

  const handleTriggerDeleteR2 = async () => {
    const PHRASE = 'XOA ANH REPO';
    const values = await deleteForm.validateFields();
    const dryRun = !!values.dry_run;
    let typed = '';
    Modal.confirm({
      title: dryRun ? 'Xác nhận chạy thử xóa ảnh (dry-run)' : 'Xác nhận XÓA ảnh hàng loạt trong repo',
      okText: dryRun ? 'Chạy dry-run' : 'XÓA ảnh',
      okType: 'danger',
      cancelText: 'Hủy',
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>
            Thao tác này sẽ {dryRun ? 'chỉ liệt kê đối tượng khớp điều kiện (không xóa thật).' : 'xóa file ảnh trong public/ và không thể hoàn tác.'}
          </div>
          <div style={{ marginBottom: 8 }}>
            Nhập chính xác cụm sau để xác nhận: <b>{PHRASE}</b>
          </div>
          <Input autoFocus placeholder={PHRASE} onChange={(e) => { typed = e.target.value || ''; }} />
        </div>
      ),
      onOk: async () => {
        if ((typed || '').trim() !== PHRASE) {
          message.error('Cụm xác nhận không đúng. Đã hủy thao tác.');
          return Promise.reject();
        }
        setTriggering('delete-movie-images-r2');
        try {
          const payload: any = { ...values };
          const res = await fetch(`${getApiBaseUrl()}/api/trigger-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete-movie-images-r2', ...payload }),
          });
          const data = await res.json().catch(async () => ({ error: await res.text() }));
          if (res.ok && data?.ok) {
            message.success(data?.message || 'Đã kích hoạt xóa ảnh trong repo/CDN.');
          } else {
            message.error(data?.error || data?.message || `Lỗi ${res.status}`);
          }
        } catch (e: any) {
          message.error(e?.message || 'Không kết nối được API.');
        } finally {
          setTriggering(null);
        }
      },
    });
  };

  const handleSaveUploadSettings = async () => {
    const values = await uploadForm.validateFields();
    setSavingUploadSettings(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('site_settings').upsert(
        [
          { key: UPLOAD_R2_KEYS.mode, value: String(values.mode ?? 'thumb,poster'), updated_at: now },
          { key: UPLOAD_R2_KEYS.quality, value: String(values.quality ?? 70), updated_at: now },
          { key: UPLOAD_R2_KEYS.thumb_quality, value: String(values.thumb_quality ?? ''), updated_at: now },
          { key: UPLOAD_R2_KEYS.poster_quality, value: String(values.poster_quality ?? ''), updated_at: now },
          { key: UPLOAD_R2_KEYS.thumb_width, value: String(values.thumb_width ?? 238), updated_at: now },
          { key: UPLOAD_R2_KEYS.thumb_height, value: String(values.thumb_height ?? 344), updated_at: now },
          { key: UPLOAD_R2_KEYS.poster_width, value: String(values.poster_width ?? 486), updated_at: now },
          { key: UPLOAD_R2_KEYS.poster_height, value: String(values.poster_height ?? 274), updated_at: now },
          { key: UPLOAD_R2_KEYS.limit, value: String(values.limit ?? 0), updated_at: now },
          { key: UPLOAD_R2_KEYS.concurrency, value: String(values.concurrency ?? 6), updated_at: now },
          { key: UPLOAD_R2_KEYS.reupload_existing, value: values.reupload_existing ? '1' : '0', updated_at: now },
        ],
        { onConflict: 'key' }
      );
      if (error) throw error;
      message.success('Đã lưu cài đặt upload ảnh.');
    } catch (e: any) {
      message.error(e?.message || 'Lưu cài đặt upload ảnh thất bại.');
    } finally {
      setSavingUploadSettings(false);
    }
  };

  const fetchRuns = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setRunsLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/github-runs?per_page=20&page=1`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && Array.isArray(data?.runs)) {
        setRuns(data.runs as WorkflowRunItem[]);
      } else {
        if (!silent) message.error(data?.error || data?.message || `Lỗi ${res.status}`);
      }
    } catch (e: any) {
      if (!silent) message.error(e?.message || 'Không lấy được danh sách workflow runs.');
    } finally {
      if (!silent) setRunsLoading(false);
    }
  };

  const parseSlugList = (raw: any) => {
    const s = String(raw || '').trim();
    if (!s) return [] as string[];
    const parts = s
      .split(/[\n\r,\t ]+/)
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return Array.from(new Set(parts));
  };

  const loadUpdateSettings = async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', [
        OPHIM_KEYS.start_page,
        OPHIM_KEYS.end_page,
        OPHIM_AUTO_KEYS.start_page,
        OPHIM_AUTO_KEYS.end_page,
        UPDATE_DATA_TWO_PHASE_KEY,
        UPDATE_DATA_MANUAL_TWO_PHASE_KEY,
        UPLOAD_IMAGES_AFTER_BUILD_KEY,
        DEPLOY_AFTER_R2_UPLOAD_KEY,
        R2_IMG_DOMAIN_KEY,
        UPLOAD_R2_KEYS.mode,
        UPLOAD_R2_KEYS.quality,
        UPLOAD_R2_KEYS.thumb_quality,
        UPLOAD_R2_KEYS.poster_quality,
        UPLOAD_R2_KEYS.thumb_width,
        UPLOAD_R2_KEYS.thumb_height,
        UPLOAD_R2_KEYS.poster_width,
        UPLOAD_R2_KEYS.poster_height,
        UPLOAD_R2_KEYS.limit,
        UPLOAD_R2_KEYS.concurrency,
        UPLOAD_R2_KEYS.reupload_existing,
        R2_PREFIX_PRESETS_KEY,
      ]);
    const map: Record<string, string> = {};
    (data || []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
    const start_page = map[OPHIM_KEYS.start_page] != null ? Number(map[OPHIM_KEYS.start_page]) : 1;
    const end_page = map[OPHIM_KEYS.end_page] != null ? Number(map[OPHIM_KEYS.end_page]) : 1;
    const auto_start_page = map[OPHIM_AUTO_KEYS.start_page] != null ? Number(map[OPHIM_AUTO_KEYS.start_page]) : start_page;
    const auto_end_page = map[OPHIM_AUTO_KEYS.end_page] != null ? Number(map[OPHIM_AUTO_KEYS.end_page]) : end_page;
    const t2 = (map[UPDATE_DATA_TWO_PHASE_KEY] || '').toString().trim().toLowerCase();
    const t2On = (t2 === '1' || t2 === 'true');

    const tManual2 = (map[UPDATE_DATA_MANUAL_TWO_PHASE_KEY] || '').toString().trim().toLowerCase();
    const tManual2On = (tManual2 === '1' || tManual2 === 'true');

    const tUpload = (map[UPLOAD_IMAGES_AFTER_BUILD_KEY] || '').toString().trim().toLowerCase();
    const tUploadOn = (tUpload === '1' || tUpload === 'true');

    const tDeployAfter = (map[DEPLOY_AFTER_R2_UPLOAD_KEY] || '').toString().trim().toLowerCase();
    const tDeployAfterOn = (tDeployAfter === '1' || tDeployAfter === 'true');

    setAutoTwoPhase(t2On);
    setAutoUploadImagesAfterBuild(tUploadOn);
    setTwoPhase(tManual2On);
    setDeployAfterR2Upload(tDeployAfterOn);

    setUpdateSettings({ start_page, end_page });
    form.setFieldsValue({
      start_page,
      end_page,
      auto_start_page,
      auto_end_page,
    });

    const uploadDefaults = {
      mode: (map[UPLOAD_R2_KEYS.mode] || 'thumb,poster').toString(),
      quality: map[UPLOAD_R2_KEYS.quality] != null && map[UPLOAD_R2_KEYS.quality] !== '' ? Number(map[UPLOAD_R2_KEYS.quality]) : 70,
      thumb_quality: map[UPLOAD_R2_KEYS.thumb_quality] ?? '',
      poster_quality: map[UPLOAD_R2_KEYS.poster_quality] ?? '',
      thumb_width: map[UPLOAD_R2_KEYS.thumb_width] != null && map[UPLOAD_R2_KEYS.thumb_width] !== '' ? Number(map[UPLOAD_R2_KEYS.thumb_width]) : 238,
      thumb_height: map[UPLOAD_R2_KEYS.thumb_height] != null && map[UPLOAD_R2_KEYS.thumb_height] !== '' ? Number(map[UPLOAD_R2_KEYS.thumb_height]) : 344,
      poster_width: map[UPLOAD_R2_KEYS.poster_width] != null && map[UPLOAD_R2_KEYS.poster_width] !== '' ? Number(map[UPLOAD_R2_KEYS.poster_width]) : 486,
      poster_height: map[UPLOAD_R2_KEYS.poster_height] != null && map[UPLOAD_R2_KEYS.poster_height] !== '' ? Number(map[UPLOAD_R2_KEYS.poster_height]) : 274,
      limit: map[UPLOAD_R2_KEYS.limit] != null && map[UPLOAD_R2_KEYS.limit] !== '' ? Number(map[UPLOAD_R2_KEYS.limit]) : 0,
      concurrency: map[UPLOAD_R2_KEYS.concurrency] != null && map[UPLOAD_R2_KEYS.concurrency] !== '' ? Number(map[UPLOAD_R2_KEYS.concurrency]) : 6,
      reupload_existing: (() => {
        const v = (map[UPLOAD_R2_KEYS.reupload_existing] || '').toString().trim().toLowerCase();
        if (!v) return false;
        return v === '1' || v === 'true' || v === 'yes' || v === 'on';
      })(),
    };
    uploadForm.setFieldsValue(uploadDefaults);

    const presetsRaw = (map[R2_PREFIX_PRESETS_KEY] || '').toString();
    const defaultPresets = presetsRaw
      ? presetsRaw
      : [
          'Ảnh phim (thumbs)|thumbs|Thumbnail: public/thumbs/{shard}/{slug}.webp',
          'Ảnh phim (posters)|posters|Poster: public/posters/{shard}/{slug}.webp',
          'Slider|slider|Upload tức thời (giữ tên file gốc)',
          'Banners|banners|Upload tức thời (giữ tên file gốc)',
        ].join('\n');
    setR2PrefixPresetsText(defaultPresets);

    const r2Domain = (map[R2_IMG_DOMAIN_KEY] || '').toString().trim();
    setR2LinkBaseUrl(r2Domain);

    const presetFolders = parseR2PrefixPresets(defaultPresets)
      .map((p) => normalizePresetPrefixValue(p.prefix))
      .filter(Boolean);
    const folderSet = new Set<string>(['thumbs', 'posters', ...presetFolders]);
    setR2LinkPrefixes(Array.from(folderSet));
  };

  const fetchActions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/trigger-action`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.actions)) {
        setActions(data.actions);
      } else {
        setActions([
          { id: 'build-on-demand', name: 'Build on demand', description: 'Build incremental (config + category pages).' },
          { id: 'update-data', name: 'Update data daily', description: 'Full build (OPhim, TMDB, Supabase…).' },
        ]);
      }
    } catch {
      setActions([
        { id: 'build-on-demand', name: 'Build on demand', description: 'Build incremental (config + category pages).' },
        { id: 'update-data', name: 'Update data daily', description: 'Full build (OPhim, TMDB, Supabase…).' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActions();
    loadUpdateSettings();
    fetchRuns({ silent: true });
  }, []);

  useEffect(() => {
    const hasInProgress = (runs || []).some((r) => r.status === 'in_progress' || r.status === 'queued');
    if (!hasInProgress) return;
    const t = setInterval(() => {
      fetchRuns({ silent: true });
    }, 15000);
    return () => clearInterval(t);
  }, [runs]);

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const renderRunTag = (r: WorkflowRunItem) => {
    const st = (r.status || '').toLowerCase();
    const c = (r.conclusion || '').toLowerCase();
    if (st === 'queued') return <Tag color="default">queued</Tag>;
    if (st === 'in_progress') return <Tag color="processing">running</Tag>;
    if (st === 'completed') {
      if (c === 'success') return <Tag color="success">success</Tag>;
      if (c === 'failure') return <Tag color="error">failed</Tag>;
      if (c === 'cancelled') return <Tag color="default">cancelled</Tag>;
      if (c) return <Tag color="warning">{c}</Tag>;
      return <Tag color="warning">completed</Tag>;
    }
    return <Tag>{r.status}</Tag>;
  };

  const handleSaveUpdateSettings = async () => {
    const values = await form.validateFields();
    setSavingSettings(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('site_settings').upsert(
        [
          { key: OPHIM_KEYS.start_page, value: String(values.start_page ?? 1), updated_at: now },
          { key: OPHIM_KEYS.end_page, value: String(values.end_page ?? 1), updated_at: now },
          { key: OPHIM_AUTO_KEYS.start_page, value: String(values.auto_start_page ?? values.start_page ?? 1), updated_at: now },
          { key: OPHIM_AUTO_KEYS.end_page, value: String(values.auto_end_page ?? values.end_page ?? 1), updated_at: now },
          { key: UPDATE_DATA_TWO_PHASE_KEY, value: autoTwoPhase ? '1' : '0', updated_at: now },
          { key: UPDATE_DATA_MANUAL_TWO_PHASE_KEY, value: twoPhase ? '1' : '0', updated_at: now },
          { key: UPLOAD_IMAGES_AFTER_BUILD_KEY, value: autoUploadImagesAfterBuild ? '1' : '0', updated_at: now },
          { key: DEPLOY_AFTER_R2_UPLOAD_KEY, value: deployAfterR2Upload ? '1' : '0', updated_at: now },
        ],
        { onConflict: 'key' }
      );
      if (error) throw error;
      setUpdateSettings((prev: { start_page: number; end_page: number }) => ({
        ...prev,
        start_page: values.start_page ?? prev.start_page,
        end_page: values.end_page ?? prev.end_page,
      }));
      message.success('Đã lưu cài đặt.');
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTrigger = async (actionId: string) => {
    if (!isAdmin) {
      message.warning('Chế độ chỉ xem: tài khoản không có quyền kích hoạt workflow.');
      return;
    }
    if (actionId === 'clean-rebuild') {
      Modal.confirm({
        title: 'Xác nhận Clean & Rebuild',
        content: 'Thao tác này sẽ xóa toàn bộ dữ liệu cũ (batches, movies-light, actors, filters…) rồi build lại từ đầu. Bạn chắc chắn muốn tiếp tục?',
        okText: 'Xóa & Build lại',
        okType: 'danger',
        cancelText: 'Hủy',
        onOk: () => doTrigger(actionId),
      });
      return;
    }
    if (actionId === 'purge-movie-data') {
      const PHRASE = 'XOA DU LIEU PHIM';
      let typed = '';
      Modal.confirm({
        title: 'Xác nhận xóa sạch dữ liệu phim',
        content: (
          <div>
            <div style={{ marginBottom: 8 }}>
              Thao tác này sẽ xóa các file dữ liệu phim trong <code>public/data</code> (giữ <code>public/data/config</code>). Sau đó bạn có thể chạy <b>Update data</b> để build lại từ đầu.
            </div>
            <div style={{ marginBottom: 8 }}>
              Nhập chính xác cụm sau để xác nhận: <b>{PHRASE}</b>
            </div>
            <Input
              autoFocus
              placeholder={PHRASE}
              onChange={(e) => {
                typed = e.target.value || '';
              }}
            />
          </div>
        ),
        okText: 'Xóa dữ liệu phim',
        okType: 'danger',
        cancelText: 'Hủy',
        onOk: () => {
          if ((typed || '').trim() !== PHRASE) {
            message.error('Cụm xác nhận không đúng. Đã hủy thao tác.');
            return Promise.reject();
          }
          return doTrigger(actionId);
        },
      });
      return;
    }
    doTrigger(actionId);
  };

  const doTrigger = async (actionId: string) => {
    setTriggering(actionId);
    try {
      const body: {
        action: string;
        start_page?: number;
        end_page?: number;
        two_phase?: boolean;
        upload_images?: string;
        reupload_existing?: string;
      } = { action: actionId };
      if (actionId === 'update-data' || actionId === 'clean-rebuild') {
        const values = form.getFieldsValue();
        if (values.start_page != null) body.start_page = values.start_page;
        if (values.end_page != null) body.end_page = values.end_page;
        body.two_phase = !!twoPhase;
        body.upload_images = autoUploadImagesAfterBuild ? 'true' : 'false';
        if (autoUploadImagesAfterBuild) {
          const reuploadExisting = !!uploadForm.getFieldValue('reupload_existing');
          body.reupload_existing = reuploadExisting ? 'true' : 'false';
        }
      }
      const authH = await getAdminApiAuthHeaders();
      const res = await fetch(`${getApiBaseUrl()}/api/trigger-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(async () => ({ error: await res.text() }));
      if (res.ok && data?.ok) {
        message.success(data?.message || 'Đã kích hoạt.');
      } else {
        message.error(data?.error || data?.message || `Lỗi ${res.status}`);
      }
    } catch (e: any) {
      message.error(e?.message || 'Không kết nối được API. Kiểm tra GITHUB_TOKEN, GITHUB_REPO trên Vercel.');
    } finally {
      setTriggering(null);
    }
  };

  const fetchSbTableCounts = async () => {
    setSbCountsLoading(true);
    try {
      const authH = await getAdminApiAuthHeaders();
      const res = await fetch(`${getApiBaseUrl()}/api/movies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ action: 'countRows', tables: ['movies', 'movie_episodes'] }),
      });
      const data = await res.json().catch(async () => ({ error: await res.text() }));
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      const results = data?.results || [];
      let movies = 0;
      let eps = 0;
      for (const r of results) {
        const t = String(r.table || '');
        const n = Number(r.nonEmptyDataRows ?? 0);
        if (t === 'movies') movies = n;
        if (t === 'movie_episodes' || t === 'episodes') eps = n;
      }
      setSbMovieCount(movies);
      setSbEpisodeCount(eps);
      message.success(`Supabase: ${movies} phim • ${eps} dòng tập`);
    } catch (e: any) {
      message.error(e?.message || 'Không đếm được bảng Supabase (kiểm tra API / secrets).');
    } finally {
      setSbCountsLoading(false);
    }
  };

  const handleDeleteSbByIds = async () => {
    const ids = parseSlugList(sbDeleteIdsText);
    if (!ids.length) {
      message.warning('Nhập ít nhất một id phim (mỗi dòng hoặc cách nhau bởi dấu phẩy).');
      return;
    }
    Modal.confirm({
      title: `Xóa ${ids.length} phim khỏi Supabase?`,
      content: 'Các tập (movie_episodes) sẽ xóa theo CASCADE. Không hoàn tác.',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        setSbDeleting(true);
        try {
          const res = await fetch(`${getApiBaseUrl()}/api/movies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await getAdminApiAuthHeaders()) },
            body: JSON.stringify({ action: 'deleteIds', ids }),
          });
          const data = await res.json().catch(async () => ({ error: await res.text() }));
          if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
          message.success(data?.message || `Đã xóa ${data?.deleted ?? ids.length} phim.`);
          setSbDeleteIdsText('');
          await fetchSbTableCounts();
        } catch (e: any) {
          message.error(e?.message || 'Xóa thất bại.');
        } finally {
          setSbDeleting(false);
        }
      },
    });
  };

  const handleDeleteAllSbMovies = () => {
    const PHRASE = 'XOA HET PHIM SUPABASE';
    let typed = '';
    Modal.confirm({
      title: 'Xóa TOÀN BỘ phim và tập trong Supabase',
      okText: 'Xóa hết',
      okType: 'danger',
      width: 520,
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            Xóa mọi dòng trong bảng <code>movies</code> (tập <code>movie_episodes</code> CASCADE). Tương tự xóa sạch sheet — không hoàn tác.
          </p>
          <p style={{ marginBottom: 8 }}>
            Nhập chính xác: <b>{PHRASE}</b>
          </p>
          <Input placeholder={PHRASE} onChange={(e) => { typed = e.target.value || ''; }} />
        </div>
      ),
      onOk: async () => {
        if ((typed || '').trim() !== PHRASE) {
          message.error('Cụm xác nhận không đúng.');
          return Promise.reject();
        }
        setSbDeletingAll(true);
        try {
          const res = await fetch(`${getApiBaseUrl()}/api/movies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await getAdminApiAuthHeaders()) },
            body: JSON.stringify({ action: 'deleteAll', confirmPhrase: PHRASE }),
          });
          const data = await res.json().catch(async () => ({ error: await res.text() }));
          if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
          message.success(data?.message || 'Đã xóa toàn bộ.');
          setSbMovieCount(0);
          setSbEpisodeCount(0);
        } catch (e: any) {
          message.error(e?.message || 'Thao tác thất bại.');
        } finally {
          setSbDeletingAll(false);
        }
      },
    });
  };

  const handleFetchTotalPages = async () => {
    setFetchingTotalPages(true);
    try {
      // API mặc định: 24 phim/trang, trang 1 là mới nhất
      const res = await fetch(`${OPHIM_BASE}/danh-sach/phim-moi?page=1&limit=24`);
      const data = await res.json().catch(() => ({}));
      const pagination = data?.data?.params?.pagination;
      const totalItems = pagination?.totalItems;
      const perPage = 24;
      if (totalItems == null) {
        throw new Error('Không đọc được tổng số phim từ API OPhim.');
      }
      const pages = Math.ceil(Number(totalItems) / perPage);
      setTotalPages(pages);
      setTotalMovies(Number(totalItems));
      message.success(`OPhim: tổng phim ${Number(totalItems)} • tổng trang ${pages} (24 phim/trang)`);
    } catch (e: any) {
      message.error(e?.message || 'Không lấy được tổng số trang/phim từ OPhim.');
    } finally {
      setFetchingTotalPages(false);
    }
  };

  const extraMap = new Map(EXTRA_ACTIONS.map((a) => [a.id, a]));
  const triggerableList = actions.map((a: ActionItem) => {
    const extra = extraMap.get(a.id);
    return { ...a, triggerable: true, ...(extra ? { danger: (extra as any).danger } : {}) };
  });
  const apiIds = new Set(actions.map((a: ActionItem) => a.id));
  const extraFiltered = EXTRA_ACTIONS.filter((a) => !apiIds.has(a.id));
  const allList = [...triggerableList, ...extraFiltered];

  const updateDataExcludeIds = new Set(['upload-movie-images-r2', 'delete-movie-images-r2']);
  const updateDataTriggerList = allList.filter((a: ActionItem) => !updateDataExcludeIds.has(a.id));

  const updateDataTabChildren = (
    <>
      <Card title="Cài đặt Update data">
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Chỉ chọn khoảng trang để lấy. API mặc định: 24 phim/trang, trang 1 là mới nhất. Lấy theo kiểu lùi và kết thúc ở trang 1.
        </Text>
        <Form form={form} layout="vertical" initialValues={updateSettings} style={{ maxWidth: '100%' }}>
          <Text strong style={{ width: '100%', marginBottom: 8 }}>Chế độ chạy:</Text>
          <Form.Item style={{ marginBottom: 8 }}>
            <Radio.Group
              value={twoPhase ? '2' : '1'}
              onChange={(e: RadioChangeEvent) => setTwoPhase(e.target.value === '2')}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="1">1 pha (full)</Radio.Button>
              <Radio.Button value="2">2 pha (core → tmdb)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Text strong style={{ width: '100%', marginBottom: 8 }}>Tự động (schedule):</Text>
          <Form.Item style={{ marginBottom: 8 }}>
            <Radio.Group
              value={autoTwoPhase ? '2' : '1'}
              onChange={(e: RadioChangeEvent) => setAutoTwoPhase(e.target.value === '2')}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="1">1 pha (full)</Radio.Button>
              <Radio.Button value="2">2 pha (core → tmdb)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ flex: '1 1 240px', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                Tự động ghi ảnh vào repo sau khi Update data:
              </Text>
              <Switch checked={autoUploadImagesAfterBuild} onChange={setAutoUploadImagesAfterBuild} />
            </div>
          </Form.Item>

          <Form.Item style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ flex: '1 1 240px', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                Chỉ deploy Cloudflare sau khi ghi ảnh xong (khi chạy 2 pha):
              </Text>
              <Switch checked={deployAfterR2Upload} onChange={setDeployAfterR2Upload} />
            </div>
          </Form.Item>

          <Text strong style={{ width: '100%' }}>Thủ công (khi bấm Kích hoạt):</Text>
          <Form.Item name="start_page" label="Trang bắt đầu" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
            <InputNumber min={1} max={100000} placeholder="1" style={{ width: '100%', maxWidth: 200 }} />
          </Form.Item>
          <Form.Item name="end_page" label="Trang kết thúc" style={{ marginBottom: 8 }}>
            <InputNumber min={1} max={100000} placeholder="1" style={{ width: '100%', maxWidth: 200 }} />
          </Form.Item>
          <Form.Item>
            <Button icon={<SaveOutlined />} onClick={handleSaveUpdateSettings} loading={savingSettings} disabled={!isAdmin}>
              Lưu mặc định
            </Button>
          </Form.Item>
          <Text strong style={{ width: '100%', marginTop: 16 }}>Tự động (0h, 6h, 12h, 18h):</Text>
          <Form.Item name="auto_start_page" label="Auto: Trang bắt đầu" style={{ marginBottom: 8 }}>
            <InputNumber min={1} max={100000} placeholder="1" style={{ width: '100%', maxWidth: 200 }} />
          </Form.Item>
          <Form.Item name="auto_end_page" label="Auto: Trang kết thúc" style={{ marginBottom: 8 }}>
            <InputNumber min={1} max={100000} placeholder="1" style={{ width: '100%', maxWidth: 200 }} />
          </Form.Item>
          <Form.Item>
            <Space direction="vertical" size={4}>
              <Button onClick={handleFetchTotalPages} loading={fetchingTotalPages}>
                Lấy tổng số trang/phim
              </Button>
              {totalMovies != null && totalPages != null && (
                <Text type="secondary">Tổng phim: {totalMovies} • Tổng trang: {totalPages}</Text>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <Spin tip="Đang tải danh sách..." />
        ) : (
          <List
            grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2 }}
            dataSource={updateDataTriggerList}
            renderItem={(item: ActionItem & { triggerable?: boolean; danger?: boolean }) => (
              <List.Item>
                <Card
                  title={item.name}
                  extra={
                    item.triggerable !== false ? (
                      <Button
                        type={item.danger ? 'default' : 'primary'}
                        danger={!!item.danger}
                        icon={triggering === item.id ? <Spin size="small" /> : item.danger ? <DeleteOutlined /> : <PlayCircleOutlined />}
                        onClick={() => handleTrigger(item.id)}
                        loading={triggering === item.id}
                        disabled={!isAdmin || !!triggering}
                        title={!isAdmin ? 'Chỉ admin mới được kích hoạt workflow.' : undefined}
                      >
                        {item.danger ? 'Clean & Build' : 'Kích hoạt'}
                      </Button>
                    ) : (
                      <Button type="text" icon={<InfoCircleOutlined />} disabled>
                        Tự động (push main)
                      </Button>
                    )
                  }
                >
                  <Text type="secondary">{item.description}</Text>
                </Card>
              </List.Item>
            )}
          />
        )}
      </div>
    </>
  );

  return (
    <>
      <h1>GitHub Actions</h1>
      <Text type="secondary">
        Gom tất cả workflow có thể kích hoạt. Mỗi nút gọi API trigger tương ứng trên GitHub.
      </Text>

      <Tabs
        style={{ marginTop: 24 }}
        defaultActiveKey="progress"
        more={{ icon: null }}
        tabBarStyle={{ overflow: 'hidden' }}
        items={[
          {
            key: 'progress',
            label: 'Tiến trình',
            children: (
              <Card
                title="Tiến trình GitHub Actions"
                extra={
                  <Space size={8}>
                    <Button onClick={() => fetchRuns()} loading={runsLoading}>
                      Refresh
                    </Button>
                  </Space>
                }
              >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                  Hiển thị các workflow runs gần đây. Khi có job đang chạy, trang sẽ tự refresh mỗi 15 giây.
                </Text>

                <List
                  size="small"
                  loading={runsLoading}
                  dataSource={runs}
                  locale={{ emptyText: 'Chưa có run nào hoặc không truy cập được GitHub API.' }}
                  renderItem={(r: WorkflowRunItem) => (
                    <List.Item
                      style={{ alignItems: 'flex-start' }}
                      actions={[
                        <a key="open" href={r.html_url} target="_blank" rel="noreferrer">
                          Mở
                        </a>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={8} wrap>
                            <Text strong>{r.name || 'Workflow'}</Text>
                            {renderRunTag(r)}
                            <Text type="secondary">#{String(r.id).slice(-6)}</Text>
                          </Space>
                        }
                        description={
                          <div>
                            <div>
                              <Text type="secondary">{r.display_title || r.event}</Text>
                              {r.actor?.login ? <Text type="secondary"> • {r.actor.login}</Text> : null}
                            </div>
                            <div>
                              <Text type="secondary">Created: {fmtTime(r.created_at)} • Updated: {fmtTime(r.updated_at)}</Text>
                            </div>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              </Card>
            ),
          },
          {
            key: 'update-data',
            label: 'Update Data',
            children: updateDataTabChildren,
          },
          {
            key: 'supabase-movies',
            label: (
              <span>
                <DatabaseOutlined /> Supabase phim
              </span>
            ),
            children: (
              <Card
                title="Bảng Supabase: phim & tập"
                extra={
                  <Button type="primary" onClick={fetchSbTableCounts} loading={sbCountsLoading} disabled={!isAdmin}>
                    Làm mới số hàng
                  </Button>
                }
              >
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                  Đếm số dòng <code>movies</code> (Movies project) và <code>movie_episodes</code> (Episodes project) qua API Vercel + service role.
                </Text>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <div>
                    <Text strong>Số hàng hiện tại:</Text>
                    <div style={{ marginTop: 8 }}>
                      <Tag color="blue">movies</Tag>{' '}
                      <Text>{sbMovieCount != null ? sbMovieCount : '—'}</Text>
                      {' · '}
                      <Tag color="purple">movie_episodes</Tag>{' '}
                      <Text>{sbEpisodeCount != null ? sbEpisodeCount : '—'}</Text>
                    </div>
                  </div>

                  <Card size="small" title="Xóa theo id phim" type="inner">
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      Mỗi dòng một <code>id</code> (giống chọn dòng sheet), hoặc cách nhau bằng dấu phẩy / khoảng trắng.
                    </Text>
                    <Input.TextArea
                      rows={5}
                      value={sbDeleteIdsText}
                      onChange={(e) => setSbDeleteIdsText(e.target.value || '')}
                      placeholder="ext_xxx&#10;62a4b2c3..."
                    />
                    <Button
                      danger
                      style={{ marginTop: 12 }}
                      onClick={handleDeleteSbByIds}
                      loading={sbDeleting}
                      disabled={!isAdmin || sbDeleting || sbDeletingAll}
                      title={!isAdmin ? 'Chỉ admin mới được xóa.' : undefined}
                    >
                      Xóa các id đã nhập
                    </Button>
                  </Card>

                  <Card size="small" title="Vùng nguy hiểm — xóa toàn bộ" type="inner">
                    <Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
                      Xóa hết phim trong Supabase (giống xóa sạch bảng sheet). Chỉ dùng khi chắc chắn.
                    </Text>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                      Mẹo nhanh (chạy trong SQL Editor từng project): Movies → <code>truncate table public.movies;</code> • Episodes →{' '}
                      <code>truncate table public.movie_episodes;</code>
                    </Text>
                    <Button
                      danger
                      type="primary"
                      onClick={handleDeleteAllSbMovies}
                      loading={sbDeletingAll}
                      disabled={!isAdmin || sbDeleting || sbDeletingAll}
                      title={!isAdmin ? 'Chỉ admin mới được xóa.' : undefined}
                    >
                      Xóa toàn bộ phim &amp; tập
                    </Button>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text strong>SQL làm rỗng bảng (copy chạy trực tiếp)</Text>
                    <Input.TextArea
                      rows={4}
                      readOnly
                      value={[
                        '-- Movies project (Org B / project Movies)',
                        'truncate table public.movies;',
                        '',
                        '-- Episodes project (Org B / project Episodes)',
                        'truncate table public.movie_episodes;',
                      ].join('\n')}
                      style={{ marginTop: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                    />
                  </Card>
                </Space>
              </Card>
            ),
          },
          {
            key: 'r2-manager',
            label: 'Quản lý ảnh (repo + CDN)',
            children: (
              <Tabs
                items={[
                  {
                    key: 'r2-settings',
                    label: 'Cài đặt',
                    children: (
                      <>
                        <Card size="small" style={{ marginBottom: 16 }} title="Chuẩn đường dẫn ảnh phim">
                          <Text type="secondary">
                            Trên repo GitHub (thư mục <Text code>public</Text>):{' '}
                            <Text code>thumbs/{'{shard2}'}/{'{slug}'}.webp</Text> và{' '}
                            <Text code>posters/{'{shard2}'}/{'{slug}'}.webp</Text> — <Text code>shard2</Text> là 2 ký tự đầu
                            slug (a–z, 0–9), giống script <Text code>upload-movie-images-repo.js</Text> và <Text code>build.js</Text>.
                            Base URL trong Cài đặt trang nên trỏ tới <Text code>…/public</Text> trên jsDelivr (không gồm <Text code>@ref</Text> trong ô cấu hình site).
                          </Text>
                        </Card>
                        <Card
                          title="Cài đặt upload ảnh (GitHub repo + jsDelivr)"
                          extra={
                            <Button icon={<SaveOutlined />} onClick={handleSaveUploadSettings} loading={savingUploadSettings}>
                              Lưu mặc định
                            </Button>
                          }
                        >
                          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                            Các thông số này áp dụng cho upload tự động hoặc thủ công (GitHub Actions).
                          </Text>
                          <Form
                            form={uploadForm}
                            layout="vertical"
                            initialValues={{
                              mode: 'thumb,poster',
                              quality: 70,
                              thumb_quality: '',
                              poster_quality: '',
                              thumb_width: 238,
                              thumb_height: 344,
                              poster_width: 486,
                              poster_height: 274,
                              limit: 0,
                              concurrency: 6,
                              force_slugs: '',
                              force_slugs_file: null,
                              reupload_existing: false,
                            }}
                          >
                            <Space wrap align="start">
                              <Form.Item name="mode" label="Mode (thumb, poster, thumb,poster)">
                                <Input style={{ width: '100%', maxWidth: 220 }} placeholder="thumb,poster" />
                              </Form.Item>

                              <Form.Item name="quality" label="Quality (1-100)">
                                <InputNumber min={1} max={100} style={{ width: '100%', maxWidth: 140 }} />
                              </Form.Item>

                              <Form.Item name="thumb_quality" label="Thumb quality (override)">
                                <Input style={{ width: '100%', maxWidth: 190 }} placeholder="" />
                              </Form.Item>

                              <Form.Item name="poster_quality" label="Poster quality (override)">
                                <Input style={{ width: '100%', maxWidth: 190 }} placeholder="" />
                              </Form.Item>

                              <Form.Item name="thumb_width" label="Thumb width">
                                <InputNumber min={0} style={{ width: '100%', maxWidth: 140 }} />
                              </Form.Item>

                              <Form.Item name="thumb_height" label="Thumb height">
                                <InputNumber min={0} style={{ width: '100%', maxWidth: 140 }} />
                              </Form.Item>

                              <Form.Item name="poster_width" label="Poster width">
                                <InputNumber min={0} style={{ width: '100%', maxWidth: 140 }} />
                              </Form.Item>

                              <Form.Item name="poster_height" label="Poster height">
                                <InputNumber min={0} style={{ width: '100%', maxWidth: 140 }} />
                              </Form.Item>

                              <Form.Item name="limit" label="Limit (0 = no limit)">
                                <InputNumber min={0} style={{ width: '100%', maxWidth: 170 }} />
                              </Form.Item>

                              <Form.Item name="concurrency" label="Concurrency (1-32)">
                                <InputNumber min={1} max={32} style={{ width: '100%', maxWidth: 190 }} />
                              </Form.Item>

                              <Form.Item name="reupload_existing" label="Upload lại nếu đã upload" valuePropName="checked">
                                <Switch />
                              </Form.Item>
                            </Space>
                          </Form>
                        </Card>

                        <Card
                          style={{ marginTop: 16 }}
                          title="Danh sách prefix ảnh (chọn khi upload)"
                          extra={
                            <Button icon={<SaveOutlined />} onClick={handleSaveR2PrefixPresets} loading={savingR2PrefixPresets}>
                              Lưu prefix
                            </Button>
                          }
                        >
                          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                            Mỗi dòng: <b>tên hiển thị|prefix|ghi chú</b>. Prefix <Text code>thumbs</Text> / <Text code>posters</Text> dùng layout{' '}
                            <Text code>{'{shard}'}/{'{slug}'}.webp</Text>; prefix khác (vd. <Text code>slider</Text>) thường là file phẳng{' '}
                            <Text code>{'{prefix}'}/{'{tên}'}.webp</Text> khi dùng «Tạo link».
                          </Text>
                          <Input.TextArea
                            rows={6}
                            value={r2PrefixPresetsText}
                            onChange={(e) => setR2PrefixPresetsText(e.target.value || '')}
                            placeholder="Ảnh phim (thumbs)|thumbs|Thumbnail theo slug\nSlider|slider|Ảnh slider (tên file tùy nhập)"
                          />
                        </Card>
                      </>
                    ),
                  },
                  {
                    key: 'r2-upload',
                    label: 'Upload',
                    children: (
                      <Card title="Upload ảnh vào repo">
                        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                          Upload hàng loạt bằng GitHub Actions. Tab «Theo slug» gửi danh sách <b>slug OPhim</b> để tải ảnh nguồn; file ghi vào repo vẫn là{' '}
                          <Text code>public/thumbs|posters/{'{shard}'}/{'{slug}'}.webp</Text> (theo slug phim, không đặt tên theo id).
                        </Text>

                        <Tabs
                          items={[
                            {
                              key: 'upload-by-slugs',
                              label: 'Theo slug (OPhim)',
                              children: (
                                <Form form={uploadForm} layout="vertical">
                                  <Space wrap align="start">
                                    <Form.Item name="force_slugs" label="Danh sách slug OPhim (mỗi dòng / phẩy)" style={{ minWidth: 0, flex: 1 }}>
                                      <Input.TextArea style={{ width: '100%', minWidth: 0 }} rows={3} placeholder="ten-phim-op\nphim-khac" />
                                    </Form.Item>

                                    <Form.Item name="force_slugs_file" label="File chứa slug (.txt/.csv)" style={{ minWidth: 0, flex: 1 }}>
                                      <input
                                        type="file"
                                        accept=".txt,.csv,text/plain,text/csv"
                                        style={{ width: '100%' }}
                                        onChange={(e) => {
                                          const f = (e.target && (e.target as HTMLInputElement).files && (e.target as HTMLInputElement).files?.[0]) || null;
                                          uploadForm.setFieldsValue({ force_slugs_file: f });
                                        }}
                                      />
                                    </Form.Item>

                                    <Form.Item label=" ">
                                      <Button
                                        type="primary"
                                        icon={triggering === 'upload-movie-images-r2' ? <Spin size="small" /> : <PlayCircleOutlined />}
                                        onClick={handleTriggerUploadR2}
                                        loading={triggering === 'upload-movie-images-r2'}
                                        disabled={!!triggering}
                                      >
                                        Upload ảnh
                                      </Button>
                                    </Form.Item>
                                  </Space>
                                </Form>
                              ),
                            },
                            {
                              key: 'upload-by-urls',
                              label: 'Theo URLs + IDs',
                              children: (
                                <>
                                  <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                    Chọn 1 trong 2 cách (workflow riêng <Text code>upload-r2-from-urls</Text>):
                                    <br />
                                    - <b>IDs + URLs</b>: mỗi dòng một cặp — tên file đích trong prefix thường là <b>id phim</b> (xem workflow; có thể khác chuẩn{' '}
                                    <Text code>thumbs/{'{shard}'}/{'{slug}'}</Text> ở tab OPhim).
                                    <br />- <b>name|link</b>: tên file = phần <Text code>name</Text> (vd. slug hoặc id tuỳ bạn đặt), không tự thêm shard — cần khớp
                                    cách bạn tổ chức thư mục.
                                  </Text>
                                  <Form
                                    form={uploadUrlsForm}
                                    layout="vertical"
                                    initialValues={{
                                      mode: 'ids_urls',
                                      folder: 'thumbs',
                                      pairs: '',
                                      ids: '',
                                      urls: '',
                                      quality: 70,
                                      width: 0,
                                      height: 0,
                                      limit: 0,
                                      concurrency: 6,
                                    }}
                                  >
                                    <Space wrap align="start">
                                      <Form.Item name="mode" label="Chế độ input">
                                        <Radio.Group optionType="button" buttonStyle="solid">
                                          <Radio.Button value="ids_urls">IDs + URLs</Radio.Button>
                                          <Radio.Button value="pairs">name|link</Radio.Button>
                                        </Radio.Group>
                                      </Form.Item>

                                      <Form.Item name="folder" label="Prefix đích">
                                        <Select
                                          style={{ width: 260 }}
                                          placeholder="Chọn prefix..."
                                          options={(() => {
                                            const presets = parseR2PrefixPresets(r2PrefixPresetsText);
                                            const opts = presets.map((p) => ({
                                              label: p.notes ? `${p.label} (${normalizePresetPrefixValue(p.prefix)})` : `${p.label} (${normalizePresetPrefixValue(p.prefix)})`,
                                              value: normalizePresetPrefixValue(p.prefix),
                                            }));
                                            const hasThumbs = opts.some((o) => o.value === 'thumbs');
                                            const hasPosters = opts.some((o) => o.value === 'posters');
                                            if (!hasThumbs) opts.unshift({ label: 'thumbs (mặc định)', value: 'thumbs' });
                                            if (!hasPosters) opts.unshift({ label: 'posters', value: 'posters' });
                                            return opts;
                                          })()}
                                          showSearch
                                        />
                                      </Form.Item>

                                      <Form.Item name="quality" label="Quality (1-100)">
                                        <InputNumber min={1} max={100} style={{ width: 190 }} />
                                      </Form.Item>

                                      <Form.Item name="width" label="Width (0 = keep)">
                                        <InputNumber min={0} style={{ width: 190 }} />
                                      </Form.Item>

                                      <Form.Item name="height" label="Height (0 = keep)">
                                        <InputNumber min={0} style={{ width: 190 }} />
                                      </Form.Item>

                                      <Form.Item name="limit" label="Limit (0 = no limit)">
                                        <InputNumber min={0} style={{ width: 190 }} />
                                      </Form.Item>

                                      <Form.Item name="concurrency" label="Concurrency (1-16)">
                                        <InputNumber min={1} max={16} style={{ width: 190 }} />
                                      </Form.Item>
                                    </Space>

                                    <Form.Item
                                      noStyle
                                      shouldUpdate={(prev, cur) => prev.mode !== cur.mode}
                                    >
                                      {({ getFieldValue }) => {
                                        const mode = String(getFieldValue('mode') || 'ids_urls');
                                        if (mode !== 'pairs') return null;
                                        return (
                                          <Form.Item
                                            name="pairs"
                                            label="Pairs (mỗi dòng 1: name|link)"
                                            rules={[{ required: true, message: 'Nhập danh sách name|link' }]}
                                          >
                                            <Input.TextArea rows={6} placeholder="123|https://...\n456|https://..." />
                                          </Form.Item>
                                        );
                                      }}
                                    </Form.Item>

                                    <Form.Item
                                      noStyle
                                      shouldUpdate={(prev, cur) => prev.mode !== cur.mode}
                                    >
                                      {({ getFieldValue }) => {
                                        const mode = String(getFieldValue('mode') || 'ids_urls');
                                        if (mode !== 'ids_urls') return null;
                                        return (
                                          <>
                                            <Form.Item
                                              name="ids"
                                              label="Movie IDs (mỗi dòng 1 id, cùng thứ tự với URLs)"
                                              rules={[{ required: true, message: 'Nhập danh sách IDs' }]}
                                            >
                                              <Input.TextArea rows={4} placeholder="62a4...\n6264..." />
                                            </Form.Item>

                                            <Form.Item
                                              name="urls"
                                              label="URLs (mỗi dòng 1 URL, cùng thứ tự với IDs)"
                                              rules={[{ required: true, message: 'Nhập danh sách URLs' }]}
                                            >
                                              <Input.TextArea rows={6} placeholder="https://...\nhttps://..." />
                                            </Form.Item>
                                          </>
                                        );
                                      }}
                                    </Form.Item>

                                    <Form.Item>
                                      <Button
                                        type="primary"
                                        icon={triggering === 'upload-r2-from-urls' ? <Spin size="small" /> : <PlayCircleOutlined />}
                                        onClick={handleTriggerUploadR2FromUrls}
                                        loading={triggering === 'upload-r2-from-urls'}
                                        disabled={!!triggering}
                                      >
                                        Upload
                                      </Button>
                                    </Form.Item>
                                  </Form>
                                </>
                              ),
                            },
                          ]}
                        />
                      </Card>
                    ),
                  },
                  {
                    key: 'r2-download',
                    label: 'Link ảnh',
                    children: (
                      <Card title="Link ảnh (jsDelivr)">
                        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                          «Theo slug phim»: dựng URL đúng layout <Text code>…/thumbs|posters/{'{shard2}'}/{'{slug}'}.webp</Text>. Base URL = Cài đặt trang (
                          <Text code>r2_img_domain</Text>), thường dạng <Text code>https://cdn.jsdelivr.net/gh/owner/img@main/public</Text>.
                          «Toàn bộ object»: gọi API liệt kê file trong repo ảnh (cần <Text code>IMAGES_*</Text> / token trên Vercel).
                        </Text>

                        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                          <Radio.Group
                            optionType="button"
                            buttonStyle="solid"
                            value={r2LinkMode}
                            onChange={(e) => {
                              setR2LinkMode(e.target.value);
                              setR2LinkOutput('');
                            }}
                          >
                            <Radio.Button value="by_slug">Theo slug phim</Radio.Button>
                            <Radio.Button value="by_prefix">Toàn bộ object trong prefix</Radio.Button>
                          </Radio.Group>

                          <div>
                            <Text strong>Base URL ảnh (…/public)</Text>
                            <Input
                              style={{ marginTop: 6 }}
                              placeholder="https://cdn.jsdelivr.net/gh/ophim102/cm114@main/public"
                              value={r2LinkBaseUrl}
                              onChange={(e) => setR2LinkBaseUrl(e.target.value || '')}
                              allowClear
                            />
                          </div>

                          <div>
                            <Text strong>Thư mục (prefix)</Text>
                            <div style={{ marginTop: 8 }}>
                              <Checkbox.Group
                                value={r2LinkPrefixes}
                                onChange={(v) => setR2LinkPrefixes((v as string[]) || [])}
                                style={{ width: '100%' }}
                              >
                                <Space direction="vertical" size={6}>
                                  {r2LinkPrefixOptions.map((o) => (
                                    <Checkbox key={o.value} value={o.value}>
                                      {o.label}
                                    </Checkbox>
                                  ))}
                                </Space>
                              </Checkbox.Group>
                            </div>
                          </div>

                          {r2LinkMode === 'by_slug' ? (
                            <div>
                              <Text strong>Slug phim</Text>
                              <Input.TextArea
                                style={{ marginTop: 6 }}
                                rows={5}
                                placeholder={'Mỗi dòng một slug (như trên URL /phim/slug.html)\nchuong-tu-diet-mon\nhoac-nhau-bang-dau-phay'}
                                value={r2LinkSlugsText}
                                onChange={(e) => setR2LinkSlugsText(e.target.value || '')}
                              />
                              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                                Chuẩn file trên repo (sau thư mục public trong base URL):{' '}
                                <Text code>
                                  thumbs|posters/{'{shard2}'}/{'{slug}'}.webp
                                </Text>
                              </Text>
                            </div>
                          ) : (
                            <div>
                              <Space wrap align="center">
                                <div>
                                  <Text strong>Giới hạn số link</Text>
                                  <InputNumber
                                    min={0}
                                    style={{ marginLeft: 8, width: 200 }}
                                    placeholder="0 = tối đa server"
                                    value={r2ListCap}
                                    onChange={(v) => setR2ListCap(typeof v === 'number' ? v : 0)}
                                  />
                                </div>
                              </Space>
                              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                                Gọi API liệt kê cây GitHub repo ảnh, dựng URL <Text code>{'{domain}'}/{'{key}'}</Text> theo đường dẫn trong public/ (có thể khác
                                .webp nếu file không theo chuẩn phim).
                              </Text>
                              <Button
                                type="primary"
                                style={{ marginTop: 12 }}
                                loading={r2ListUrlsLoading}
                                disabled={!!triggering || r2ListUrlsLoading}
                                onClick={handleFetchR2UrlsFromBucket}
                              >
                                Lấy link từ repo
                              </Button>
                            </div>
                          )}

                          <Space wrap>
                            {r2LinkMode === 'by_slug' ? (
                              <Button type="primary" onClick={handleGenerateR2Links} disabled={!!r2ListUrlsLoading}>
                                Tạo link
                              </Button>
                            ) : null}
                            <Button icon={<CopyOutlined />} onClick={handleCopyR2Links} disabled={!r2LinkOutput.trim()}>
                              Copy toàn bộ
                            </Button>
                            <Button icon={<DownloadOutlined />} onClick={handleDownloadR2LinksFile} disabled={!r2LinkOutput.trim()}>
                              Tải file .txt
                            </Button>
                          </Space>

                          <div>
                            <Text strong>Kết quả (mỗi dòng một URL)</Text>
                            <Input.TextArea
                              style={{ marginTop: 6 }}
                              rows={12}
                              readOnly
                              value={r2LinkOutput}
                              placeholder={
                                r2LinkMode === 'by_prefix'
                                  ? 'Bấm «Lấy link từ repo»…'
                                  : 'Bấm «Tạo link»…'
                              }
                            />
                          </div>
                        </Space>
                      </Card>
                    ),
                  },
                  {
                    key: 'r2-delete',
                    label: 'Delete',
                    children: (
                      <Card title="Xóa ảnh trong repo">
                        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                          Xóa theo prefix (vd. <Text code>thumbs/</Text>), theo keys đầy đủ (vd. <Text code>thumbs/ab/slug.webp</Text>), hoặc theo movie ids trong{' '}
                          <Text code>repo_image_upload_state.json</Text>. Mặc định dry-run.
                        </Text>

                        <Form
                          form={deleteForm}
                          layout="vertical"
                          initialValues={{
                            mode: 'prefix',
                            prefix: 'thumbs/',
                            keys: '',
                            movie_ids: '',
                            kind: 'both',
                            dry_run: true,
                            limit: 0,
                          }}
                        >
                          <Space wrap align="start">
                            <Form.Item name="mode" label="Mode">
                              <Radio.Group optionType="button" buttonStyle="solid">
                                <Radio.Button value="prefix">prefix</Radio.Button>
                                <Radio.Button value="keys">keys</Radio.Button>
                                <Radio.Button value="movie_ids">movie_ids</Radio.Button>
                              </Radio.Group>
                            </Form.Item>

                            <Form.Item name="kind" label="Loại ảnh">
                              <Radio.Group optionType="button" buttonStyle="solid">
                                <Radio.Button value="both">both</Radio.Button>
                                <Radio.Button value="thumb">thumb</Radio.Button>
                                <Radio.Button value="poster">poster</Radio.Button>
                              </Radio.Group>
                            </Form.Item>

                            <Form.Item name="limit" label="Limit (0 = no limit)">
                              <InputNumber min={0} style={{ width: 190 }} />
                            </Form.Item>

                            <Form.Item name="dry_run" label="Dry run (không xóa thật)" valuePropName="checked">
                              <Switch />
                            </Form.Item>
                          </Space>

                          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.mode !== cur.mode}>
                            {({ getFieldValue }) => {
                              const mode = String(getFieldValue('mode') || 'prefix');
                              if (mode !== 'prefix') return null;
                              return (
                                <Form.Item
                                  name="prefix"
                                  label="Prefix (thư mục trong public/)"
                                  rules={[{ required: true, message: 'Chọn prefix để xóa' }]}
                                  normalize={normalizeR2PrefixForDelete}
                                >
                                  <Select
                                    style={{ width: 320 }}
                                    placeholder="Chọn prefix..."
                                    options={(() => {
                                      const presets = parseR2PrefixPresets(r2PrefixPresetsText);
                                      const opts = presets.map((p) => {
                                        const base = normalizePresetPrefixValue(p.prefix);
                                        return {
                                          label: `${p.label} (${base}/)`,
                                          value: base ? `${base}/` : '',
                                        };
                                      }).filter((o) => !!o.value);
                                      const hasThumbs = opts.some((o) => o.value === 'thumbs/');
                                      const hasPosters = opts.some((o) => o.value === 'posters/');
                                      if (!hasThumbs) opts.unshift({ label: 'thumbs/', value: 'thumbs/' });
                                      if (!hasPosters) opts.unshift({ label: 'posters/', value: 'posters/' });
                                      return opts;
                                    })()}
                                    showSearch
                                  />
                                </Form.Item>
                              );
                            }}
                          </Form.Item>

                          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.mode !== cur.mode}>
                            {({ getFieldValue }) => {
                              const mode = String(getFieldValue('mode') || 'prefix');
                              if (mode !== 'keys') return null;
                              return (
                                <Form.Item
                                  name="keys"
                                  label="Keys (mỗi dòng 1 key)"
                                  rules={[{ required: true, message: 'Nhập danh sách keys để xóa' }]}
                                >
                                  <Input.TextArea rows={3} placeholder="thumbs/ab/ten-phim.webp\nposters/ab/ten-phim.webp" />
                                </Form.Item>
                              );
                            }}
                          </Form.Item>

                          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.mode !== cur.mode}>
                            {({ getFieldValue }) => {
                              const mode = String(getFieldValue('mode') || 'prefix');
                              if (mode !== 'movie_ids') return null;
                              return (
                                <Form.Item
                                  name="movie_ids"
                                  label="Movie IDs (mỗi dòng 1 id)"
                                  rules={[{ required: true, message: 'Nhập danh sách movie ids' }]}
                                >
                                  <Input.TextArea rows={3} placeholder="62a4...\n6264..." />
                                </Form.Item>
                              );
                            }}
                          </Form.Item>

                          <Form.Item>
                            <Button
                              danger
                              type="primary"
                              icon={triggering === 'delete-movie-images-r2' ? <Spin size="small" /> : <DeleteOutlined />}
                              onClick={handleTriggerDeleteR2}
                              loading={triggering === 'delete-movie-images-r2'}
                              disabled={!!triggering}
                            >
                              Xóa ảnh trong repo
                            </Button>
                          </Form.Item>
                        </Form>
                      </Card>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </>
  );
}
