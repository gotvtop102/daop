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
import { getApiBaseUrl } from '../lib/api';
import { getAdminApiAuthHeaders } from '../lib/adminAuth';
import { buildCdnMovieImageUrlBySlug, buildOphimUploadsImageUrlByStem } from '../lib/movie-image-urls';

const { Title } = Typography;
const { TabPane } = Tabs;

interface Movie {
  id: string;
  slug?: string;
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
  const [r2ImgDomain, setR2ImgDomain] = useState<string>('');
  const [ophimImgDomain, setOphimImgDomain] = useState<string>('');
  const [configReady, setConfigReady] = useState<boolean>(false);

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
          const base = getApiBaseUrl();
          const fallbackRes = await fetch(`${base}/api/admin-readonly?action=site-config`, {
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
          // Keep empty domains; render fallback URLs from movie data below.
        }
      }
      setConfigReady(true);
    };
    loadConfig();
  }, []);

  const listMoviePosterSrc = (record: Movie) => {
    const directPoster = String(record.poster_url || '').trim();
    const directThumb = String(record.thumb_url || '').trim();
    const slug = String(record.slug || '').trim();
    const stem = slug || String(record.id || '').trim();
    const generated = stem
      ? (
      buildCdnMovieImageUrlBySlug(r2ImgDomain, stem, 'poster') ||
      buildOphimUploadsImageUrlByStem(ophimImgDomain, stem, 'poster')
      )
      : '';
    return generated || directPoster || directThumb || '';
  };

  const loadMovies = async (opts?: { nextPage?: number; nextPageSize?: number }) => {
    if (!configReady) return;
    setLoading(true);
    try {
      const base = getApiBaseUrl();
      const p = opts?.nextPage ?? page;
      const ps = opts?.nextPageSize ?? pageSize;

      const url = new URL(`${base}/api/movies`);
      url.searchParams.append('action', 'list');
      const isUnbuiltTab = category === 'unbuilt';
      const isDuplicatesTab = category === 'duplicates';
      url.searchParams.append('type', isUnbuiltTab || isDuplicatesTab ? 'all' : TYPE_MAP[category]);
      if (isUnbuiltTab) {
        url.searchParams.append('unbuilt', '1');
      }
      if (isDuplicatesTab) {
        url.searchParams.append('duplicates', '1');
      }
      url.searchParams.append('page', String(p));
      url.searchParams.append('limit', String(ps));
      if (search.trim()) {
        url.searchParams.append('search', search.trim());
      }

      const res = await fetch(url.toString(), {
        headers: {
          ...(await getAdminApiAuthHeaders()),
        },
      });
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

  useEffect(() => {
    if (!configReady) return;
    const t = setTimeout(() => {
      loadMovies({ nextPage: 1 });
      setPage(1);
    }, 100);
    return () => clearTimeout(t);
  }, [category, search, configReady]);

  const filteredMovies = useMemo(() => movies, [movies]);

  const openInNewTab = (path: string) => {
    const url = `${window.location.origin}${path}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (id: string) => {
    try {
      const base = getApiBaseUrl();
      const url = new URL(`${base}/api/movies`);
      url.searchParams.append('action', 'delete');
      url.searchParams.append('id', id);
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAdminApiAuthHeaders()) },
        body: JSON.stringify({ action: 'delete', id }),
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
          src={listMoviePosterSrc(record) || '/images/default_poster.png'}
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
                    category === 'unbuilt' || category === 'duplicates'
                      ? (record.type || 'single')
                      : category
                  }`
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
                    category === 'unbuilt' || category === 'duplicates'
                      ? (record.type || 'single')
                      : category
                  }`
                )
              }
            >
              Link
            </Button>
          </Tooltip>
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
