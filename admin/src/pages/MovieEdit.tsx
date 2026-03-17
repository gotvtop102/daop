import { useEffect, useState } from 'react';
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
  { value: 'OK', label: 'OK' },
  { value: 'COPY', label: 'COPY' },
];

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
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const isNew = id === 'new';

  // Load spreadsheetId from Supabase or localStorage
  useEffect(() => {
    const loadSheetId = async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'google_sheets_id')
        .maybeSingle();
      if (!error && data?.value) {
        setSpreadsheetId(data.value);
        return;
      }
      try {
        const saved = JSON.parse(localStorage.getItem('daop_google_sheets_config') || '{}');
        if (saved?.google_sheets_id) {
          setSpreadsheetId(saved.google_sheets_id);
        }
      } catch {
        // ignore
      }
    };
    loadSheetId();
  }, []);

  // Load movie data
  useEffect(() => {
    if (!isNew && id && spreadsheetId) {
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
  }, [id, typeFromQuery, spreadsheetId]);

  const loadMovie = async (movieId: string) => {
    if (!spreadsheetId) {
      message.error('Chưa cấu hình Google Sheets ID');
      return;
    }
    setLoading(true);
    try {
      const base = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const apiBase = base || window.location.origin;
      const res = await fetch(`${apiBase}/api/movies?action=get&id=${movieId}&spreadsheetId=${encodeURIComponent(spreadsheetId)}`);

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
      const movieData = {
        ...result,
        genre: typeof result.genre === 'string' ? result.genre.split(',').filter(Boolean) : result.genre || [],
        country: typeof result.country === 'string' ? result.country.split(',').filter(Boolean) : result.country || [],
        director: typeof result.director === 'string' ? result.director.split(',').filter(Boolean) : result.director || [],
        actor: typeof result.actor === 'string' ? result.actor.split(',').filter(Boolean) : result.actor || [],
        year: result.year ? parseInt(result.year) : new Date().getFullYear(),
      };

      form.setFieldsValue(movieData);
      setPosterPreview(movieData.poster_url || '');
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
      // Call TMDB API
      const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}&language=vi-VN`);

      if (!res.ok) {
        throw new Error('Không tìm thấy phim trên TMDB');
      }

      const data = await res.json();

      // Also fetch credits for director and cast
      const creditsRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${tmdbApiKey}`);
      const credits = creditsRes.ok ? await creditsRes.json() : { crew: [], cast: [] };

      const directors = credits.crew?.filter((c: any) => c.job === 'Director').map((c: any) => c.name) || [];
      const actors = credits.cast?.slice(0, 10).map((c: any) => c.name) || [];

      const tmdbData = {
        title: data.title || data.original_title,
        origin_name: data.original_title,
        poster_url: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
        thumb_url: data.backdrop_path ? `https://image.tmdb.org/t/p/w300${data.backdrop_path}` : '',
        year: data.release_date ? parseInt(data.release_date.split('-')[0]) : new Date().getFullYear(),
        genre: data.genres?.map((g: any) => g.name) || [],
        country: data.production_countries?.map((c: any) => c.name) || [],
        description: data.overview,
        time: data.runtime ? `${data.runtime} phút` : '',
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
    setSaving(true);
    try {
      const base = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const apiBase = base || window.location.origin;

      // Convert arrays to comma-separated strings
      const payload = {
        ...values,
        id: isNew ? undefined : id,
        spreadsheetId,
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

  const handlePosterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPosterPreview(e.target.value);
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
                  onClick={() => navigate(`/movies/episodes/${id}?type=${form.getFieldValue('type')}`)}
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

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          autoComplete="off"
        >
          <Row gutter={24}>
            <Col xs={24} lg={16}>
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
