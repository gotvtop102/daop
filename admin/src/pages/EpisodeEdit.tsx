import { useEffect, useState } from 'react';
import {
  Typography,
  Button,
  Form,
  Input,
  Table,
  Space,
  Card,
  Row,
  Col,
  message,
  Tabs,
  Tag,
  Tooltip,
  Divider,
  Select,
} from 'antd';
import {
  SaveOutlined,
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const { Title } = Typography;
const { TabPane } = Tabs;
const { TextArea } = Input;
const { Option } = Select;

interface Episode {
  episode_code: string;
  episode_name: string;
  server_slug: string;
  link_m3u8: string;
  link_embed: string;
  link_backup: string;
  link_vip1: string;
  link_vip2: string;
  link_vip3: string;
  link_vip4: string;
  link_vip5: string;
  server_name: string;
  note: string;
}

interface Server {
  server_slug: string;
  server_name: string;
  episodes: Episode[];
}

const SERVER_SLUG_PRESETS = [
  'vietsub-1',
  'vietsub-2',
  'thuyet-minh',
  'long-tieng',
];

export default function EpisodeEdit() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const typeFromQuery = searchParams.get('type') || 'single';
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMovieId, setImportMovieId] = useState('');
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState('0');
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [episodePages, setEpisodePages] = useState<Record<string, number>>({});
  const [movieTitle, setMovieTitle] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [serviceAccountKey, setServiceAccountKey] = useState<string>('');
  const [configReady, setConfigReady] = useState<boolean>(false);

  // Load spreadsheetId và serviceAccountKey từ Supabase hoặc localStorage
  useEffect(() => {
    const loadConfig = async () => {
      const { data: settings, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['google_sheets_id', 'google_service_account_key']);
      
      if (!error && settings) {
        const sheetId = settings.find(s => s.key === 'google_sheets_id')?.value;
        const svcKey = settings.find(s => s.key === 'google_service_account_key')?.value;
        if (sheetId) setSpreadsheetId(sheetId);
        if (svcKey) setServiceAccountKey(svcKey);
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

  const importEpisodesFromMovieId = async (sourceMovieId: string) => {
    const src = String(sourceMovieId || '').trim();
    if (!src) {
      message.warning('Vui lòng nhập movie_id nguồn');
      return;
    }
    if (!id) {
      message.error('Thiếu movie ID');
      return;
    }
    if (!spreadsheetId) {
      message.error('Chưa cấu hình Google Sheets ID');
      return;
    }

    setImporting(true);
    try {
      const envBase = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const base = envBase || window.location.origin;

      const res = await fetch(`${base}/api/movies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'episodes',
          movie_id: src,
          spreadsheetId,
          ...(serviceAccountKey ? { serviceAccountKey } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const result = await res.json();
      if (result?.error) throw new Error(result.error);
      const episodesPayload = Array.isArray(result) ? result : (result?.episodes || []);
      const episodes: Episode[] = episodesPayload || [];

      const serverMap = new Map<string, { server_name: string; episodes: Episode[] }>();
      episodes.forEach((ep: Episode) => {
        const serverSlug = String((ep as any).server_slug || 'vietsub-1');
        const serverName = String((ep as any).server_name || '');
        if (!serverMap.has(serverSlug)) {
          serverMap.set(serverSlug, { server_name: serverName, episodes: [] });
        }
        const g = serverMap.get(serverSlug)!;
        if (!g.server_name && serverName) g.server_name = serverName;
        g.episodes.push(ep);
      });

      const groupedServers: Server[] = Array.from(serverMap.entries()).map(([slug, g]) => ({
        server_slug: slug,
        server_name: g.server_name || slug,
        episodes: g.episodes,
      }));

      if (!groupedServers.length) {
        message.warning('movie_id nguồn không có tập nào');
        return;
      }

      setServers(groupedServers);
      setActiveServer('0');
      message.success(`Đã nạp ${episodes.length} tập từ movie_id nguồn. Bấm Lưu để ghi sang phim hiện tại.`);
    } catch (e: any) {
      message.error(e?.message || 'Không thể nạp tập từ movie_id nguồn');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (!configReady || !spreadsheetId) return; // Wait for config
    if (id && spreadsheetId) {
      setInitialLoadDone(false);
      loadEpisodes(id);
    }
  }, [id, spreadsheetId, configReady]);

  const loadEpisodes = async (movieId: string) => {
    if (!configReady) return; // Wait for config to load first
    if (!spreadsheetId) {
      message.error('Chưa cấu hình Google Sheets ID');
      return;
    }
    setLoading(true);
    try {
      const envBase = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const base = envBase || window.location.origin;

      // First get movie info
      const movieRes = await fetch(`${base}/api/movies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get',
          id: movieId,
          spreadsheetId,
          ...(serviceAccountKey ? { serviceAccountKey } : {}),
        }),
      });
      if (movieRes.ok) {
        const movieData = await movieRes.json();
        if (movieData && !movieData.error) {
          setMovieTitle(movieData.title || movieData.origin_name || movieId);
        }
      }

      // Get episodes
      const res = await fetch(`${base}/api/movies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'episodes',
          movie_id: movieId,
          debug: true,
          spreadsheetId,
          ...(serviceAccountKey ? { serviceAccountKey } : {}),
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

      const episodesPayload = Array.isArray(result) ? result : (result?.episodes || []);
      const debugInfo = Array.isArray(result) ? null : (result?.debug || null);
      if (debugInfo) {
        // eslint-disable-next-line no-console
        console.log('[EpisodeEdit] episodes debug:', debugInfo);
      }

      // Group episodes by server_slug
      const episodes: Episode[] = episodesPayload || [];
      const serverMap = new Map<string, { server_name: string; episodes: Episode[] }>();

      episodes.forEach((ep: Episode) => {
        const serverSlug = String((ep as any).server_slug || 'vietsub-1');
        const serverName = String((ep as any).server_name || '');
        if (!serverMap.has(serverSlug)) {
          serverMap.set(serverSlug, { server_name: serverName, episodes: [] });
        }
        const g = serverMap.get(serverSlug)!;
        if (!g.server_name && serverName) g.server_name = serverName;
        g.episodes.push(ep);
      });

      const groupedServers: Server[] = Array.from(serverMap.entries()).map(([slug, g]) => ({
        server_slug: slug,
        server_name: g.server_name || slug,
        episodes: g.episodes,
      }));

      if (groupedServers.length === 0) {
        // Default server
        setServers([{ server_slug: 'vietsub-1', server_name: 'Vietsub #1', episodes: [] }]);
        if (debugInfo) {
          message.warning(`Không tìm thấy tập theo movie_id. Kiểm tra console log để xem debug.`);
        }
      } else {
        setServers(groupedServers);
      }

      setActiveServer('0');
    } catch (e: any) {
      message.error(e?.message || 'Không thể tải danh sách tập phim');
      setServers([{ server_slug: 'vietsub-1', server_name: 'Vietsub #1', episodes: [] }]);
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  };

  const handleSave = async () => {
    if (!spreadsheetId) {
      message.error('Chưa cấu hình Google Sheets ID');
      return;
    }
    if (!id) {
      message.error('Thiếu movie ID');
      return;
    }
    setSaving(true);
    try {
      const envBase = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
      const base = envBase || window.location.origin;

      // Flatten all episodes from all servers
      const allEpisodes: Episode[] = [];
      servers.forEach((server) => {
        server.episodes.forEach((ep) => {
          allEpisodes.push({
            ...ep,
            server_slug: server.server_slug,
            server_name: server.server_name,
          });
        });
      });

      const res = await fetch(`${base}/api/movies?action=episodes&movie_id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId,
          ...(serviceAccountKey ? { serviceAccountKey } : {}),
          episodes: allEpisodes,
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

      message.success(`Đã lưu ${result.count || allEpisodes.length} tập phim`);
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const addServer = () => {
    const newServerSlug = `vietsub-${servers.length + 1}`;
    setServers([...servers, { server_slug: newServerSlug, server_name: newServerSlug, episodes: [] }]);
    setActiveServer(String(servers.length));
  };

  const removeServer = (index: number) => {
    const newServers = servers.filter((_, i) => i !== index);
    setServers(newServers);
    if (activeServer === String(index)) {
      setActiveServer('0');
    }
  };

  const addEpisode = (serverIndex: number) => {
    const newServers = [...servers];
    const episodeNumber = newServers[serverIndex].episodes.length + 1;
    newServers[serverIndex].episodes.push({
      episode_code: String(episodeNumber),
      episode_name: `Tập ${episodeNumber}`,
      server_slug: newServers[serverIndex].server_slug,
      link_m3u8: '',
      link_embed: '',
      link_backup: '',
      link_vip1: '',
      link_vip2: '',
      link_vip3: '',
      link_vip4: '',
      link_vip5: '',
      server_name: newServers[serverIndex].server_name,
      note: '',
    });
    setServers(newServers);
  };

  const removeEpisode = (serverIndex: number, episodeIndex: number) => {
    const newServers = [...servers];
    newServers[serverIndex].episodes.splice(episodeIndex, 1);
    setServers(newServers);
  };

  const updateEpisode = (serverIndex: number, episodeIndex: number, field: keyof Episode, value: string) => {
    const newServers = [...servers];
    newServers[serverIndex].episodes[episodeIndex][field] = value;
    setServers(newServers);
  };

  const updateServerSlug = (index: number, newSlug: string) => {
    const newServers = [...servers];
    newServers[index].server_slug = newSlug;
    if (!newServers[index].server_name || newServers[index].server_name === newServers[index].server_slug) {
      newServers[index].server_name = newSlug;
    }
    newServers[index].episodes = newServers[index].episodes.map((ep) => ({
      ...ep,
      server_slug: newSlug,
      server_name: newServers[index].server_name,
    }));
    setServers(newServers);
  };

  const updateServerName = (index: number, newName: string) => {
    const newServers = [...servers];
    newServers[index].server_name = newName;
    newServers[index].episodes = newServers[index].episodes.map((ep) => ({
      ...ep,
      server_name: newName,
    }));
    setServers(newServers);
  };

  const columns = (serverIndex: number) => [
    {
      title: 'Mã tập',
      dataIndex: 'episode_code',
      key: 'episode_code',
      width: 110,
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].episode_code}
          onChange={(e) => updateEpisode(serverIndex, idx, 'episode_code', e.target.value)}
          placeholder="1 / S01E01"
        />
      ),
    },
    {
      title: 'Tên tập',
      dataIndex: 'episode_name',
      key: 'episode_name',
      width: 160,
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].episode_name}
          onChange={(e) => updateEpisode(serverIndex, idx, 'episode_name', e.target.value)}
          placeholder="Tập 1"
        />
      ),
    },
    {
      title: 'Link M3U8',
      dataIndex: 'link_m3u8',
      key: 'link_m3u8',
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].link_m3u8}
          onChange={(e) => updateEpisode(serverIndex, idx, 'link_m3u8', e.target.value)}
          placeholder="https://.../index.m3u8"
        />
      ),
    },
    {
      title: 'Link Embed',
      dataIndex: 'link_embed',
      key: 'link_embed',
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].link_embed}
          onChange={(e) => updateEpisode(serverIndex, idx, 'link_embed', e.target.value)}
          placeholder="https://player..."
        />
      ),
    },
    {
      title: 'Backup',
      dataIndex: 'link_backup',
      key: 'link_backup',
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].link_backup}
          onChange={(e) => updateEpisode(serverIndex, idx, 'link_backup', e.target.value)}
          placeholder="https://..."
        />
      ),
    },
    {
      title: 'VIP 1',
      dataIndex: 'link_vip1',
      key: 'link_vip1',
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].link_vip1}
          onChange={(e) => updateEpisode(serverIndex, idx, 'link_vip1', e.target.value)}
          placeholder="https://..."
        />
      ),
    },
    {
      title: 'VIP 2',
      dataIndex: 'link_vip2',
      key: 'link_vip2',
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].link_vip2}
          onChange={(e) => updateEpisode(serverIndex, idx, 'link_vip2', e.target.value)}
          placeholder="https://..."
        />
      ),
    },
    {
      title: 'VIP 3',
      dataIndex: 'link_vip3',
      key: 'link_vip3',
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].link_vip3}
          onChange={(e) => updateEpisode(serverIndex, idx, 'link_vip3', e.target.value)}
          placeholder="https://..."
        />
      ),
    },
    {
      title: 'VIP 4',
      dataIndex: 'link_vip4',
      key: 'link_vip4',
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].link_vip4}
          onChange={(e) => updateEpisode(serverIndex, idx, 'link_vip4', e.target.value)}
          placeholder="https://..."
        />
      ),
    },
    {
      title: 'VIP 5',
      dataIndex: 'link_vip5',
      key: 'link_vip5',
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].link_vip5}
          onChange={(e) => updateEpisode(serverIndex, idx, 'link_vip5', e.target.value)}
          placeholder="https://..."
        />
      ),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      width: 160,
      render: (_: any, __: any, idx: number) => (
        <Input
          value={servers[serverIndex].episodes[idx].note}
          onChange={(e) => updateEpisode(serverIndex, idx, 'note', e.target.value)}
          placeholder="..."
        />
      ),
    },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: any, __: any, idx: number) => (
        <Button
          danger
          icon={<DeleteOutlined />}
          size="small"
          onClick={() => removeEpisode(serverIndex, idx)}
        />
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
              Quay lại
            </Button>
            <Title level={3} style={{ margin: 0 }}>
              Chỉnh sửa link phim
            </Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadEpisodes(id!)}
              loading={loading}
            >
              Tải lại
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              Lưu
            </Button>
          </Space>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical">
          <div>
            <strong>Phim:</strong> {movieTitle || id}
          </div>
          <div>
            <strong>ID:</strong> <Tag>{id}</Tag>
          </div>
          <div>
            <strong>Loại:</strong> <Tag>{typeFromQuery}</Tag>
          </div>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Button type="dashed" icon={<PlusOutlined />} onClick={addServer}>
            Thêm server mới
          </Button>
        </Col>
      </Row>

      {!initialLoadDone ? (
        <Card loading style={{ minHeight: 200 }} />
      ) : servers.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            <PlayCircleOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <p>Chưa có server nào. Hãy thêm server mới để bắt đầu.</p>
          </div>
        </Card>
      ) : (
        <Tabs
          activeKey={activeServer}
          onChange={setActiveServer}
          type="editable-card"
          onEdit={(targetKey, action) => {
            if (action === 'add') {
              addServer();
            } else if (action === 'remove') {
              const index = Number(targetKey);
              removeServer(index);
            }
          }}
        >
          {servers.map((server, serverIndex) => (
            <TabPane
              tab={
                <Space>
                  <LinkOutlined />
                  {server.server_name || server.server_slug}
                </Space>
              }
              key={String(serverIndex)}
              closable={servers.length > 1}
            >
              <Card
                title={
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Space>
                        <span>Server slug:</span>
                        <Select
                          value={server.server_slug}
                          onChange={(value) => updateServerSlug(serverIndex, value)}
                          style={{ width: 180 }}
                          showSearch
                        >
                          {SERVER_SLUG_PRESETS.map((slug) => (
                            <Option key={slug} value={slug}>
                              {slug}
                            </Option>
                          ))}
                        </Select>
                        <span>Tên hiển thị:</span>
                        <Input
                          value={server.server_name}
                          onChange={(e) => updateServerName(serverIndex, e.target.value)}
                          placeholder="Vietsub #1"
                          style={{ width: 160 }}
                        />
                      </Space>
                    </Col>
                    <Col>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => addEpisode(serverIndex)}
                      >
                        Thêm tập
                      </Button>
                    </Col>
                  </Row>
                }
              >
                {server.episodes.length === 0 ? (
                  <Card size="small" style={{ marginBottom: 12 }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div>
                        Nếu phim này chưa có tập do lệch <strong>movie_id</strong> trong sheet, bạn có thể nạp tập từ movie_id khác rồi bấm <strong>Lưu</strong> để ghi sang phim hiện tại.
                      </div>
                      <Space wrap>
                        <Input
                          value={importMovieId}
                          onChange={(e) => setImportMovieId(e.target.value)}
                          placeholder="Nhập movie_id nguồn (vd: 620f40e6...)"
                          style={{ width: 320 }}
                        />
                        <Button
                          icon={<ReloadOutlined />}
                          loading={importing}
                          onClick={() => importEpisodesFromMovieId(importMovieId)}
                        >
                          Nạp tập từ movie_id nguồn
                        </Button>
                      </Space>
                    </Space>
                  </Card>
                ) : null}
                <Table
                  columns={columns(serverIndex)}
                  dataSource={
                    typeFromQuery === 'series'
                      ? server.episodes.slice(
                          ((episodePages[String(serverIndex)] || 1) - 1) * 10,
                          ((episodePages[String(serverIndex)] || 1) - 1) * 10 + 10
                        )
                      : server.episodes
                  }
                  rowKey={(r: any, idx?: number) => `${serverIndex}-${idx ?? 0}-${r.episode_code || ''}`}
                  pagination={
                    typeFromQuery === 'series'
                      ? {
                          current: episodePages[String(serverIndex)] || 1,
                          pageSize: 10,
                          total: server.episodes.length,
                          showQuickJumper: true,
                          showSizeChanger: false,
                          onChange: (p) =>
                            setEpisodePages((prev) => ({
                              ...prev,
                              [String(serverIndex)]: p,
                            })),
                        }
                      : false
                  }
                  size="small"
                  scroll={{ x: 1800 }}
                  locale={{
                    emptyText: 'Chưa có tập nào. Hãy thêm tập mới.',
                  }}
                />
              </Card>
            </TabPane>
          ))}
        </Tabs>
      )}

      <Divider />

      <Card title="Hướng dẫn" size="small">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li><strong>Link M3U8:</strong> Link trực tiếp đến file .m3u8 để phát video</li>
          <li><strong>Link Embed:</strong> Link nhúng player (iframe) từ các nguồn khác</li>
          <li><strong>Backup / VIP 1..5:</strong> Link dự phòng hoặc máy chủ VIP (tùy cấu hình Player settings)</li>
          <li><strong>Note:</strong> Ghi chú nội bộ cho admin, build không dùng để hiển thị</li>
          <li>Có thể thêm nhiều server để người dùng có thể chọn nguồn phát</li>
          <li>Với phim lẻ, thường chỉ cần 1 tập duy nhất</li>
          <li>Với phim bộ, thêm từng tập theo thứ tự</li>
        </ul>
      </Card>
    </div>
  );
}
