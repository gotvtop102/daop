import { useEffect, useMemo, useState } from 'react';
import {
  Typography,
  Button,
  Input,
  Table,
  Space,
  Card,
  Image,
  Tag,
  Tooltip,
  message,
  Row,
  Col,
  Tabs,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  LinkOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const { Title } = Typography;
const { TabPane } = Tabs;

interface Movie {
  id: string;
  title: string;
  origin_name?: string;
  poster_url?: string;
  thumb_url?: string;
  year?: number;
  type?: string;
  status?: string;
  episode_current?: string;
  episode_total?: string;
  quality?: string;
  genre?: string[];
  country?: string[];
  tmdb_id?: string;
  created_at?: string;
}

const CATEGORY_MAP: Record<string, string> = {
  single: 'Phim lẻ',
  series: 'Phim bộ',
  hoathinh: 'Hoạt hình',
  tvshows: 'TV Show',
  unbuilt: 'Phim chưa build',
  normalize: 'Cần chuẩn hóa',
  duplicates: 'Trùng lặp',
};

const TYPE_MAP: Record<string, string> = {
  single: 'single',
  series: 'series',
  hoathinh: 'hoathinh',
  tvshows: 'tvshows',
};

export default function MovieList() {
  const { category = 'single' } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [serviceAccountKey, setServiceAccountKey] = useState<string>('');
  const [r2ImgDomain, setR2ImgDomain] = useState<string>('');
  const [ophimImgDomain, setOphimImgDomain] = useState<string>('');
  const [configReady, setConfigReady] = useState<boolean>(false);

  // Load spreadsheetId và serviceAccountKey từ Supabase hoặc localStorage
  useEffect(() => {
    const loadConfig = async () => {
      // Try Supabase first
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
      
      // Fallback to localStorage
      try {
        const saved = JSON.parse(localStorage.getItem('daop_google_sheets_config') || '{}');
        if (saved?.google_sheets_id && !spreadsheetId) {
          setSpreadsheetId(saved.google_sheets_id);
        }
        if (saved?.google_service_account_key && !serviceAccountKey) {
          setServiceAccountKey(saved.google_service_account_key);
        }
      } catch {
        // ignore
      }
      setConfigReady(true);
    };
    loadConfig();
  }, []);

  const buildR2MovieImageUrl = (id: string, kind: 'thumb' | 'poster') => {
    const idStr = String(id || '').trim();
    if (!idStr) return '';
    const r2 = String(r2ImgDomain || '').replace(/\/$/, '');
    if (!r2) return '';
    return `${r2}/${kind === 'poster' ? 'posters' : 'thumbs'}/${idStr}.webp`;
  };

  // Load movies from Google Sheets via API
  const loadMovies = async (opts?: { nextPage?: number; nextPageSize?: number }) => {
    if (!configReady) return; // Wait for config to load first
    if (!spreadsheetId) {
      message.error('Chưa cấu hình Google Sheets ID. Vui lòng vào Google Sheets để thiết lập.');
      return;
    }
    setLoading(true);
    try {
      const envBase = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const base = envBase || window.location.origin;
      const p = opts?.nextPage ?? page;
      const ps = opts?.nextPageSize ?? pageSize;

      const url = new URL(`${base}/api/movies`);
      url.searchParams.append('action', 'list');
      url.searchParams.append('spreadsheetId', spreadsheetId);
      if (serviceAccountKey) url.searchParams.append('serviceAccountKey', serviceAccountKey);
      const isUnbuiltTab = category === 'unbuilt';
      const isNormalizeTab = category === 'normalize';
      const isDuplicatesTab = category === 'duplicates';
      url.searchParams.append('type', isUnbuiltTab || isNormalizeTab || isDuplicatesTab ? 'all' : TYPE_MAP[category]);
      if (isUnbuiltTab) {
        url.searchParams.append('unbuilt', '1');
      }
      if (isNormalizeTab) {
        url.searchParams.append('copyOnly', '1');
      }
      if (isDuplicatesTab) {
        url.searchParams.append('duplicates', '1');
      }
      url.searchParams.append('page', String(p));
      url.searchParams.append('limit', String(ps));
      if (search.trim()) {
        url.searchParams.append('search', search.trim());
      }

      const res = await fetch(url.toString());
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const result = await res.json();
      if (result.error) {
        throw new Error(result.error);
      }

      // Parse genre and country from comma-separated strings
      const parsedData = (result.data || []).map((m: any) => ({
        ...m,
        genre: typeof m.genre === 'string' ? m.genre.split(',').filter(Boolean) : m.genre || [],
        country: typeof m.country === 'string' ? m.country.split(',').filter(Boolean) : m.country || [],
        year: m.year ? parseInt(m.year) : undefined,
      }));

      setMovies(parsedData);
      setTotal(result.total || 0);
      setPage(result.page || p);
      setPageSize(result.limit || ps);
    } catch (e: any) {
      message.error(e?.message || 'Lỗi tải danh sách phim');
    } finally {
      setLoading(false);
    }
  };

  const normalizeCopy = async (record: any) => {
    if (!record?.id) return;
    if (!spreadsheetId) {
      message.error('Chưa cấu hình Google Sheets ID');
      return;
    }

    const envBase = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
    const base = envBase || window.location.origin;

    const url = new URL(`${base}/api/movies`);
    url.searchParams.append('action', 'normalizeCopy');
    url.searchParams.append('spreadsheetId', spreadsheetId);
    if (serviceAccountKey) url.searchParams.append('serviceAccountKey', serviceAccountKey);

    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId: record.id, deleteCopy: false }),
      });
      const data = await res.json().catch(async () => ({ error: await res.text() }));
      if (!res.ok || data?.error) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

      message.success('Đã chuẩn hóa: đã ghi đè bản gốc và đặt update=NEW. Bạn có thể xóa bản copy nếu không cần.');

      const shouldDelete = window.confirm('Bạn có muốn xóa bản COPY này khỏi sheet không?');
      if (shouldDelete) {
        const res2 = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ copyId: record.id, deleteCopy: true }),
        });
        const data2 = await res2.json().catch(async () => ({ error: await res2.text() }));
        if (!res2.ok || data2?.error) throw new Error(data2?.error || data2?.message || `HTTP ${res2.status}`);
        message.success('Đã xóa bản COPY.');
      }

      loadMovies({ nextPage: 1 });
    } catch (e: any) {
      message.error(e?.message || 'Chuẩn hóa thất bại');
    }
  };

  useEffect(() => {
    if (!configReady || !spreadsheetId) return; // Wait for config
    const t = setTimeout(() => {
      loadMovies({ nextPage: 1 });
      setPage(1);
    }, 100);
    return () => clearTimeout(t);
  }, [category, search, configReady, spreadsheetId]);

  const filteredMovies = useMemo(() => movies, [movies]);

  const openInNewTab = (path: string) => {
    const url = `${window.location.origin}${path}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (id: string) => {
    if (!spreadsheetId) {
      message.error('Chưa cấu hình Google Sheets ID');
      return;
    }
    try {
      const envBase = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const base = envBase || window.location.origin;
      const url = new URL(`${base}/api/movies`);
      url.searchParams.append('action', 'delete');
      url.searchParams.append('id', id);
      url.searchParams.append('spreadsheetId', spreadsheetId);
      if (serviceAccountKey) url.searchParams.append('serviceAccountKey', serviceAccountKey);
      const res = await fetch(url.toString(), {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const result = await res.json();
      if (result.error) {
        throw new Error(result.error);
      }

      message.success('Đã xóa phim');
      loadMovies();
    } catch (e: any) {
      message.error(e?.message || 'Xóa phim thất bại');
    }
  };

  const columns = [
    {
      title: 'Poster',
      dataIndex: 'thumb_url',
      key: 'poster',
      width: 80,
      render: (url: string, record: Movie) => (
        <Image
          src={buildR2MovieImageUrl(record.id, 'poster') || '/images/default_poster.png'}
          alt={record.title}
          width={60}
          height={90}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          fallback="/images/default_poster.png"
        />
      ),
    },
    {
      title: 'Thông tin phim',
      key: 'info',
      render: (_: any, record: Movie) => (
        <Space direction="vertical" size={4}>
          <div style={{ fontWeight: 600 }}>{record.title}</div>
          <div style={{ color: '#666', fontSize: 12 }}>{record.origin_name}</div>
          <Space size={8} wrap>
            <Tag color="blue">{record.year}</Tag>
            <Tag color="green">{record.quality || 'HD'}</Tag>
            {record.status === 'ongoing' && (
              <Tag color="orange">
                {record.episode_current}/{record.episode_total} tập
              </Tag>
            )}
            {record.tmdb_id && (
              <Tag color="purple">TMDB: {record.tmdb_id}</Tag>
            )}
          </Space>
          <Space size={4} wrap>
            {record.genre?.map((g) => (
              <Tag key={g}>
                {g}
              </Tag>
            ))}
          </Space>
        </Space>
      ),
    },
    {
      title: 'Quốc gia',
      dataIndex: 'country',
      key: 'country',
      width: 120,
      render: (countries: string[]) =>
        countries?.map((c) => <Tag key={c}>{c}</Tag>),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 180,
      render: (_: any, record: Movie) => (
        <Space>
          <Tooltip title="Chỉnh sửa phim">
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="small"
              onClick={() =>
                openInNewTab(
                  `/movies/edit/${record.id}?type=${
                    category === 'unbuilt' || category === 'normalize' || category === 'duplicates'
                      ? (record.type || 'single')
                      : category
                  }${category === 'normalize' ? '&normalize=1' : ''}`
                )
              }
            >
              Sửa
            </Button>
          </Tooltip>
          <Tooltip title="Chỉnh sửa link phim">
            <Button
              icon={<LinkOutlined />}
              size="small"
              onClick={() =>
                openInNewTab(
                  `/movies/episodes/${record.id}?type=${
                    category === 'unbuilt' || category === 'normalize' || category === 'duplicates'
                      ? (record.type || 'single')
                      : category
                  }`
                )
              }
            >
              Link
            </Button>
          </Tooltip>
          {category === 'normalize' ? (
            <Tooltip title="Ghi đè bản gốc bằng bản COPY và đặt update=NEW">
              <Button size="small" onClick={() => normalizeCopy(record)}>
                Chuẩn hóa
              </Button>
            </Tooltip>
          ) : null}
          <Tooltip title="Xóa phim">
            <Button
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => handleDelete(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Quản lý {CATEGORY_MAP[category] || 'Phim'}
          </Title>
        </Col>
        <Col>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openInNewTab(`/movies/edit/new?type=${category}`)}
            >
              Thêm phim mới
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => loadMovies()} loading={loading}>
              Tải lại
            </Button>
          </Space>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Input
              prefix={<SearchOutlined />}
              placeholder="Tìm kiếm theo tên phim, ID, hoặc TMDB ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={category}
        onChange={(key) => navigate(`/movies/${key}`)}
        style={{ marginBottom: 16 }}
      >
        <TabPane tab="Phim lẻ" key="single" />
        <TabPane tab="Phim bộ" key="series" />
        <TabPane tab="Hoạt hình" key="hoathinh" />
        <TabPane tab="TV Show" key="tvshows" />
        <TabPane tab="Phim chưa build" key="unbuilt" />
        <TabPane tab="Cần chuẩn hóa" key="normalize" />
        <TabPane tab="Trùng lặp" key="duplicates" />
      </Tabs>

      <Table
        columns={columns}
        dataSource={filteredMovies}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showQuickJumper: true,
          showSizeChanger: true,
          showTotal: (t) => `Tổng ${t} phim`,
          onChange: (p, ps) => {
            const nextPage = Number(p) || 1;
            const nextPageSize = Number(ps) || pageSize;
            setPage(nextPage);
            setPageSize(nextPageSize);
            loadMovies({ nextPage, nextPageSize });
            try {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch {
              window.scrollTo(0, 0);
            }
          },
        }}
      />
    </div>
  );
}
