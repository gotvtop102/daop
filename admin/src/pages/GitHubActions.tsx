import { useState, useEffect } from 'react';
import { Card, Button, List, message, Spin, Typography, InputNumber, Input, Form, Space, Modal, Radio, Switch, Tag, Tabs } from 'antd';
import type { RadioChangeEvent } from 'antd';
import { PlayCircleOutlined, InfoCircleOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabase';

const { Text } = Typography;

const API_URL = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
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
    id: 'export-to-sheets',
    name: 'Export to Google Sheets',
    description: 'Đẩy phim hiện có (build) xuống Google Sheets (chỉ append phim mới).',
    triggerable: true,
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
  const [form] = Form.useForm();
  const [uploadForm] = Form.useForm();
  const [deleteForm] = Form.useForm();

  const readTextFile = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không đọc được file'));
      reader.readAsText(file);
    });
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
      const res = await fetch(`${API_URL}/api/trigger-action`, {
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
    const PHRASE = 'XOA ANH R2';
    const values = await deleteForm.validateFields();
    const dryRun = !!values.dry_run;
    let typed = '';
    Modal.confirm({
      title: dryRun ? 'Xác nhận chạy thử xóa ảnh R2 (dry-run)' : 'Xác nhận XÓA ảnh hàng loạt trên R2',
      okText: dryRun ? 'Chạy dry-run' : 'XÓA ảnh',
      okType: 'danger',
      cancelText: 'Hủy',
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>
            Thao tác này sẽ {dryRun ? 'chỉ liệt kê đối tượng khớp điều kiện (không xóa thật).' : 'xóa ảnh hàng loạt trên R2 và không thể hoàn tác.'}
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
          const res = await fetch(`${API_URL}/api/trigger-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete-movie-images-r2', ...payload }),
          });
          const data = await res.json().catch(async () => ({ error: await res.text() }));
          if (res.ok && data?.ok) {
            message.success(data?.message || 'Đã kích hoạt xóa ảnh R2.');
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
      const res = await fetch(`${API_URL}/api/github-runs?per_page=20&page=1`, { method: 'GET' });
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
  };

  const fetchActions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/trigger-action`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.actions)) {
        setActions(data.actions);
      } else {
        setActions([
          { id: 'build-on-demand', name: 'Build on demand', description: 'Build incremental (config + category pages).' },
          { id: 'update-data', name: 'Update data daily', description: 'Full build (OPhim, TMDB, Sheets…).' },
        ]);
      }
    } catch {
      setActions([
        { id: 'build-on-demand', name: 'Build on demand', description: 'Build incremental (config + category pages).' },
        { id: 'update-data', name: 'Update data daily', description: 'Full build (OPhim, TMDB, Sheets…).' },
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
      const body: { action: string; start_page?: number; end_page?: number; two_phase?: boolean; upload_images?: string } = { action: actionId };
      if (actionId === 'update-data' || actionId === 'clean-rebuild') {
        const values = form.getFieldsValue();
        if (values.start_page != null) body.start_page = values.start_page;
        if (values.end_page != null) body.end_page = values.end_page;
        body.two_phase = !!twoPhase;
        body.upload_images = autoUploadImagesAfterBuild ? 'true' : 'false';
      }
      const res = await fetch(`${API_URL}/api/trigger-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            children: (
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
                          Tự động upload ảnh lên R2 sau khi Update data:
                        </Text>
                        <Switch checked={autoUploadImagesAfterBuild} onChange={setAutoUploadImagesAfterBuild} />
                      </div>
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={{ flex: '1 1 240px', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                          Chỉ deploy Cloudflare sau khi upload ảnh R2 xong (khi chạy 2 pha):
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
                      <Button icon={<SaveOutlined />} onClick={handleSaveUpdateSettings} loading={savingSettings}>
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
                                  disabled={!!triggering}
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
            ),
          },
          {
            key: 'upload-r2',
            label: 'Upload ảnh R2',
            children: (
              <Card
                title="Upload movie images to R2"
                extra={
                  <Button icon={<SaveOutlined />} onClick={handleSaveUploadSettings} loading={savingUploadSettings}>
                    Lưu mặc định
                  </Button>
                }
              >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                  Chạy tải + nén + upload ảnh (thumb/poster) lên R2 bằng GitHub Actions.
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

                    <Form.Item name="force_slugs" label="Force slugs (comma/newline separated)" style={{ minWidth: 0, flex: 1 }}>
                      <Input.TextArea style={{ width: '100%', minWidth: 0 }} rows={3} placeholder="slug-1\nslug-2" />
                    </Form.Item>

                    <Form.Item name="force_slugs_file" label="File danh sách slug (.txt/.csv)" style={{ minWidth: 0, flex: 1 }}>
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

                    <Form.Item name="reupload_existing" label="Upload lại nếu đã upload" valuePropName="checked">
                      <Switch />
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
              </Card>
            ),
          },
          {
            key: 'delete-r2',
            label: 'Xóa ảnh R2',
            children: (
              <Card title="Delete movie images on R2">
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                  Xóa ảnh trên R2 theo prefix (thư mục), theo keys, hoặc theo movie ids (đọc từ r2_upload_state.json). Mặc định chạy dry-run để an toàn.
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

                  <Form.Item name="prefix" label="Prefix (ví dụ: thumbs/ hoặc posters/)">
                    <Input placeholder="thumbs/" />
                  </Form.Item>

                  <Form.Item name="keys" label="Keys (mỗi dòng 1 key)">
                    <Input.TextArea rows={3} placeholder="thumbs/a.jpg\nposters/b.jpg" />
                  </Form.Item>

                  <Form.Item name="movie_ids" label="Movie IDs (mỗi dòng 1 id)">
                    <Input.TextArea rows={3} placeholder="62a4...\n6264..." />
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
                      Xóa ảnh R2
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}
