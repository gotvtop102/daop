import { useEffect, useState, useRef } from 'react';
import {
  Card,
  Form,
  Select,
  Switch,
  Button,
  message,
  Collapse,
  Input,
  InputNumber,
  Space,
  Tabs,
  Typography,
  Tag,
  Table,
  Modal,
  Radio,
  Slider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { supabase } from '../lib/supabase';

const { Text, Title } = Typography;
const { Panel } = Collapse;

type PlayerType = 'plyr' | 'videojs' | 'jwplayer' | 'fluidplayer';

type PlayerConfig = {
  // Common settings
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  loop?: boolean;
  poster?: string;

  // Playback controls
  playback_speed_enabled?: boolean;
  playback_speed_default?: number;
  playback_speed_options?: number[];
  seek_step_seconds?: number;

  // Plyr specific
  plyr_hideControls?: boolean;
  plyr_clickToPlay?: boolean;
  plyr_disableContextMenu?: boolean;
  plyr_resetOnEnd?: boolean;
  plyr_tooltips?: 'controls' | 'seek' | 'none';

  // Video.js specific
  vjs_fluid?: boolean;
  vjs_responsive?: boolean;
  vjs_aspectRatio?: string;
  vjs_bigPlayButton?: boolean;
  vjs_controlBar?: boolean;

  // Fluidplayer specific
  fluid_layoutControls?: boolean;
  fluid_controlBar?: boolean;
  fluid_miniProgressBar?: boolean;
  fluid_speed?: boolean;
  fluid_theatreMode?: boolean;
  fluid_quality?: boolean;
  fluid_logo?: string;
  fluid_logoPosition?: 'top right' | 'top left' | 'bottom right' | 'bottom left';

  // JWPlayer specific
  jwplayer_license_key?: string;

  // Ads settings
  preroll_enabled?: boolean;
  preroll_vast?: string;
  midroll_enabled?: boolean;
  postroll_enabled?: boolean;
  preroll_source?: 'video' | 'vast';
  midroll_source?: 'video' | 'vast';
  postroll_source?: 'video' | 'vast';
  midroll_vast?: string;
  postroll_vast?: string;
  midroll_interval_seconds?: number;
  midroll_min_watch_seconds?: number;
  midroll_max_per_video?: number;
};

const AVAILABLE_PLAYERS: { value: PlayerType; label: string; description: string }[] = [
  { value: 'plyr', label: 'Plyr', description: 'Player nhẹ, đẹp, dễ tùy chỉnh' },
  { value: 'videojs', label: 'Video.js', description: 'Player mạnh mẽ, hỗ trợ nhiều format' },
  { value: 'jwplayer', label: 'JWPlayer', description: 'Player chuyên nghiệp (cần license)' },
  { value: 'fluidplayer', label: 'FluidPlayer', description: 'Player HTML5 mạnh mẽ, hỗ trợ VAST/VPAID' },
];

type PrerollRow = {
  id: string;
  name: string | null;
  video_url: string | null;
  image_url: string | null;
  duration: number | null;
  skip_after: number | null;
  weight: number | null;
  is_active: boolean;
  roll?: 'pre' | 'mid' | 'post' | null;
};

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

const defaultPlayerConfig: PlayerConfig = {
  autoplay: false,
  muted: false,
  controls: true,
  preload: 'metadata',
  loop: false,

  // Playback controls
  playback_speed_enabled: true,
  playback_speed_default: 1,
  playback_speed_options: [0.5, 0.75, 1, 1.25, 1.5, 2],
  seek_step_seconds: 10,

  // Plyr
  plyr_hideControls: false,
  plyr_clickToPlay: true,
  plyr_disableContextMenu: true,
  plyr_resetOnEnd: false,
  plyr_tooltips: 'controls',

  // Video.js
  vjs_fluid: true,
  vjs_responsive: true,
  vjs_aspectRatio: '16:9',
  vjs_bigPlayButton: true,
  vjs_controlBar: true,

  // Fluidplayer
  fluid_layoutControls: true,
  fluid_controlBar: true,
  fluid_miniProgressBar: true,
  fluid_speed: true,
  fluid_theatreMode: true,
  fluid_quality: true,
  fluid_logo: '',
  fluid_logoPosition: 'top right',

  // Ads
  preroll_enabled: true,
  preroll_vast: '',
  midroll_enabled: false,
  postroll_enabled: false,
  preroll_source: 'video',
  midroll_source: 'video',
  postroll_source: 'video',
  midroll_vast: '',
  postroll_vast: '',
  midroll_interval_seconds: 600,
  midroll_min_watch_seconds: 120,
  midroll_max_per_video: 2,
};

export default function PlayerSettings() {
  const [form] = Form.useForm();
  const [configForm] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerType>('videojs');
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig>(defaultPlayerConfig);
  const [linkTypeLabels, setLinkTypeLabels] = useState<Record<string, string>>({
    m3u8: 'M3U8',
    embed: 'Embed',
    backup: 'Backup',
    vip1: 'VIP 1',
    vip2: 'VIP 2',
    vip3: 'VIP 3',
    vip4: 'VIP 4',
    vip5: 'VIP 5',
  });

  // Preroll ads state
  const [prerollData, setPrerollData] = useState<PrerollRow[]>([]);
  const [prerollLoading, setPrerollLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rollFilter, setRollFilter] = useState<'all' | 'pre' | 'mid' | 'post'>('all');
  const [prerollForm] = Form.useForm();
  const prerollImageInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState('player');

  // Load player settings
  useEffect(() => {
    loadSettings();
    loadPrerollData();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from('player_settings').select('key, value');
    const rows = data ?? [];
    const settings: Record<string, any> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    const defaultPlayerRaw = settings.default_player ?? 'videojs';
    const defaultPlayer = String(defaultPlayerRaw).toLowerCase();
    const allowed = new Set(AVAILABLE_PLAYERS.map((p) => p.value));
    setSelectedPlayer((allowed.has(defaultPlayer as PlayerType) ? defaultPlayer : 'videojs') as PlayerType);

    const config = parseJsonSafe<PlayerConfig>(settings.player_config, defaultPlayerConfig);
    setPlayerConfig({ ...defaultPlayerConfig, ...config });

    const labels = parseJsonSafe<Record<string, string>>(settings.link_type_labels, {
      m3u8: 'M3U8',
      embed: 'Embed',
      backup: 'Backup',
      vip1: 'VIP 1',
      vip2: 'VIP 2',
      vip3: 'VIP 3',
      vip4: 'VIP 4',
      vip5: 'VIP 5',
    });
    setLinkTypeLabels(labels);

    form.setFieldsValue({
      default_player: defaultPlayer,
      link_type_labels_json: JSON.stringify(labels, null, 2),
    });

    configForm.setFieldsValue({
      ...defaultPlayerConfig,
      ...config,
    });

    setLoading(false);
  };

  const loadPrerollData = async () => {
    setPrerollLoading(true);
    const { data } = await supabase.from('ad_preroll').select('*').order('weight', { ascending: false });
    setPrerollData((data as PrerollRow[]) ?? []);
    setPrerollLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      const configValues = configForm.getFieldsValue();

      // Parse link type labels
      let linkTypeLabelsData: Record<string, string> = {};
      try {
        linkTypeLabelsData = JSON.parse(values.link_type_labels_json || '{}');
      } catch {
        message.error('link_type_labels phải là JSON hợp lệ');
        setSaving(false);
        return;
      }

      // Save all settings
      const rows = [
        { key: 'default_player', value: values.default_player },
        { key: 'player_config', value: configValues },
        { key: 'link_type_labels', value: linkTypeLabelsData },
      ];

      for (const row of rows) {
        const { error } = await supabase.from('player_settings').upsert(
          { ...row, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        if (error) throw error;
      }

      message.success('Đã lưu cài đặt player. Chạy Build website để áp dụng.');
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
    setSaving(false);
  };

  // Preroll handlers
  const openAddPreroll = () => {
    setEditingId(null);
    prerollForm.resetFields();
    prerollForm.setFieldsValue({ is_active: true, weight: 0, roll: 'pre' });
    setModalVisible(true);
  };

  const openEditPreroll = (row: PrerollRow) => {
    setEditingId(row.id);
    prerollForm.setFieldsValue(row);
    setModalVisible(true);
  };

  const handleDeletePreroll = async (id: string) => {
    if (!confirm('Xóa quảng cáo pre-roll này?')) return;
    try {
      const { error } = await supabase.from('ad_preroll').delete().eq('id', id);
      if (error) throw error;
      message.success('Đã xóa');
      await loadPrerollData();
    } catch (e: any) {
      message.error(e?.message || 'Xóa thất bại');
    }
  };

  const togglePrerollActive = async (row: PrerollRow) => {
    try {
      const { error } = await supabase.from('ad_preroll').update({ is_active: !row.is_active }).eq('id', row.id);
      if (error) throw error;
      await loadPrerollData();
    } catch (e: any) {
      message.error(e?.message || 'Cập nhật thất bại');
    }
  };

  const handleSubmitPreroll = async (values: any) => {
    try {
      const payload = {
        name: values.name || null,
        video_url: values.video_url || null,
        image_url: values.image_url || null,
        duration: values.duration != null ? Number(values.duration) : null,
        skip_after: values.skip_after != null ? Number(values.skip_after) : null,
        weight: values.weight != null ? Number(values.weight) : 0,
        is_active: !!values.is_active,
        roll: values.roll || 'pre',
      };
      if (editingId) {
        const { error } = await supabase.from('ad_preroll').update(payload).eq('id', editingId);
        if (error) throw error;
        message.success('Đã cập nhật');
      } else {
        const { error } = await supabase.from('ad_preroll').insert(payload);
        if (error) throw error;
        message.success('Đã thêm');
      }
      setModalVisible(false);
      await loadPrerollData();
    } catch (e: any) {
      message.error(e?.message || 'Lưu thất bại');
    }
  };

  const renderPlayerSpecificConfig = () => {
    const player = selectedPlayer;

    switch (player) {
      case 'plyr':
        return (
          <>
            <Title level={5}>Cài đặt Plyr</Title>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Form.Item name="plyr_hideControls" valuePropName="checked" label="Ẩn controls">
                <Switch />
              </Form.Item>
              <Form.Item name="plyr_clickToPlay" valuePropName="checked" label="Click để phát">
                <Switch />
              </Form.Item>
              <Form.Item name="plyr_disableContextMenu" valuePropName="checked" label="Vô hiệu hóa menu chuột phải">
                <Switch />
              </Form.Item>
              <Form.Item name="plyr_resetOnEnd" valuePropName="checked" label="Reset khi kết thúc">
                <Switch />
              </Form.Item>
              <Form.Item name="plyr_tooltips" label="Tooltips">
                <Radio.Group optionType="button" buttonStyle="solid">
                  <Radio.Button value="controls">Controls</Radio.Button>
                  <Radio.Button value="seek">Seek</Radio.Button>
                  <Radio.Button value="none">Không</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Space>
          </>
        );

      case 'videojs':
        return (
          <>
            <Title level={5}>Cài đặt Video.js</Title>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Form.Item name="vjs_fluid" valuePropName="checked" label="Fluid layout">
                <Switch />
              </Form.Item>
              <Form.Item name="vjs_responsive" valuePropName="checked" label="Responsive">
                <Switch />
              </Form.Item>
              <Form.Item name="vjs_aspectRatio" label="Tỷ lệ khung hình">
                <Select
                  options={[
                    { value: '16:9', label: '16:9' },
                    { value: '4:3', label: '4:3' },
                    { value: '21:9', label: '21:9' },
                    { value: '1:1', label: '1:1' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="vjs_bigPlayButton" valuePropName="checked" label="Nút Play lớn">
                <Switch />
              </Form.Item>
              <Form.Item name="vjs_controlBar" valuePropName="checked" label="Hiển thị control bar">
                <Switch />
              </Form.Item>
            </Space>
          </>
        );

      case 'fluidplayer':
        return (
          <>
            <Title level={5}>Cài đặt FluidPlayer</Title>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Form.Item name="fluid_layoutControls" valuePropName="checked" label="Layout controls">
                <Switch />
              </Form.Item>
              <Form.Item name="fluid_controlBar" valuePropName="checked" label="Control bar">
                <Switch />
              </Form.Item>
              <Form.Item name="fluid_miniProgressBar" valuePropName="checked" label="Mini progress bar">
                <Switch />
              </Form.Item>
              <Form.Item name="fluid_speed" valuePropName="checked" label="Chỉnh tốc độ phát">
                <Switch />
              </Form.Item>
              <Form.Item name="fluid_theatreMode" valuePropName="checked" label="Chế độ theatre">
                <Switch />
              </Form.Item>
              <Form.Item name="fluid_quality" valuePropName="checked" label="Chọn chất lượng">
                <Switch />
              </Form.Item>
              <Form.Item name="fluid_logo" label="URL Logo">
                <Input placeholder="https://..." />
              </Form.Item>
              <Form.Item name="fluid_logoPosition" label="Vị trí Logo">
                <Radio.Group optionType="button" buttonStyle="solid">
                  <Radio.Button value="top right">Top Right</Radio.Button>
                  <Radio.Button value="top left">Top Left</Radio.Button>
                  <Radio.Button value="bottom right">Bottom Right</Radio.Button>
                  <Radio.Button value="bottom left">Bottom Left</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Space>
          </>
        );

      case 'jwplayer':
        return (
          <>
            <Title level={5}>Cài đặt JWPlayer</Title>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Form.Item 
                name="jwplayer_license_key" 
                label="License Key"
                rules={[{ required: true, message: 'Vui lòng nhập license key' }]}
              >
                <Input.Password placeholder="Nhập JWPlayer license key..." />
              </Form.Item>
              <Text type="secondary">
                JWPlayer yêu cầu license key để hoạt động. Bạn có thể đăng ký tại{' '}
                <a href="https://www.jwplayer.com/" target="_blank" rel="noopener noreferrer">jwplayer.com</a>
              </Text>
            </Space>
          </>
        );

      default:
        return null;
    }
  };

  const tabItems = [
    {
      key: 'player',
      label: 'Player & Cấu hình',
      children: (
        <>
          <Card title="Chọn Player" style={{ marginBottom: 16 }}>
            <Form form={form} layout="vertical" onFinish={handleSave}>
              <Form.Item
                name="default_player"
                label="Player mặc định"
                rules={[{ required: true, message: 'Vui lòng chọn player' }]}
              >
                <Select
                  placeholder="Chọn player"
                  onChange={(value) => setSelectedPlayer(value as PlayerType)}
                  options={AVAILABLE_PLAYERS.map((p) => ({
                    value: p.value,
                    label: p.label,
                  }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item
                name="link_type_labels_json"
                label="Tên Máy chủ (JSON: key -> nhãn hiển thị)"
              >
                <Input.TextArea
                  rows={5}
                  placeholder='{"m3u8":"M3U8","embed":"Embed","backup":"Backup","vip1":"VIP 1"}'
                />
              </Form.Item>
            </Form>
          </Card>

          <Collapse defaultActiveKey={['common', 'player-specific', 'ads']}>
            <Panel header="Cài đặt chung" key="common">
              <Form form={configForm} layout="vertical">
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Form.Item name="autoplay" valuePropName="checked" label="Tự động phát">
                    <Switch />
                  </Form.Item>
                  <Form.Item name="muted" valuePropName="checked" label="Tắt tiếng mặc định">
                    <Switch />
                  </Form.Item>
                  <Form.Item name="controls" valuePropName="checked" label="Hiển thị controls">
                    <Switch defaultChecked />
                  </Form.Item>
                  <Form.Item name="loop" valuePropName="checked" label="Lặp lại">
                    <Switch />
                  </Form.Item>
                  <Form.Item name="preload" label="Preload">
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio.Button value="auto">Auto</Radio.Button>
                      <Radio.Button value="metadata">Metadata</Radio.Button>
                      <Radio.Button value="none">None</Radio.Button>
                    </Radio.Group>
                  </Form.Item>

                  {String(selectedPlayer).toLowerCase() !== 'fluidplayer' && (
                    <>
                      <Title level={5} style={{ marginTop: 8 }}>Tốc độ & Tua</Title>
                      <Form.Item name="playback_speed_enabled" valuePropName="checked" label="Hiển thị điều khiển tốc độ / tua">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="seek_step_seconds" label="Bước tua (giây)">
                        <InputNumber min={1} step={1} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="playback_speed_default" label="Tốc độ mặc định">
                        <InputNumber min={0.25} step={0.25} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item
                        name="playback_speed_options"
                        label="Danh sách tốc độ (ngăn cách bằng dấu phẩy)"
                        getValueProps={(v: any) => ({ value: Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v)) })}
                        getValueFromEvent={(e: any) => {
                          const raw = String(e?.target?.value || '').trim();
                          if (!raw) return [];
                          const list = raw
                            .split(',')
                            .map((x) => Number(String(x || '').trim()))
                            .filter((n) => Number.isFinite(n) && n > 0);
                          const uniq = Array.from(new Set(list));
                          uniq.sort((a, b) => a - b);
                          return uniq;
                        }}
                      >
                        <Input placeholder="0.5, 0.75, 1, 1.25, 1.5, 2" />
                      </Form.Item>
                    </>
                  )}
                </Space>
              </Form>
            </Panel>

            <Panel header={`Cài đặt ${AVAILABLE_PLAYERS.find(p => p.value === selectedPlayer)?.label || 'Player'}`} key="player-specific">
              <Form form={configForm} layout="vertical">
                {renderPlayerSpecificConfig()}
              </Form>
            </Panel>

            <Panel header="Cài đặt Quảng cáo" key="ads">
              <Form form={configForm} layout="vertical">
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Form.Item name="preroll_enabled" valuePropName="checked" label="Bật Pre-roll">
                    <Switch />
                  </Form.Item>
                  <Form.Item name="preroll_source" label="Nguồn Pre-roll">
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio.Button value="video">Video (ad_preroll)</Radio.Button>
                      <Radio.Button value="vast">VAST/VPAID</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item name="preroll_vast" label="VAST/VPAID URL (tùy chọn)">
                    <Input placeholder="https://.../vast.xml" />
                  </Form.Item>
                  <Text type="secondary">
                    Gợi ý: VAST chạy tốt nhất trên <Text strong>Video.js</Text>, <Text strong>JWPlayer</Text>, <Text strong>FluidPlayer</Text>.
                    Với các player khác, hệ thống sẽ cố gắng parse MediaFile từ VAST để phát như video (có thể không hỗ trợ VPAID).
                  </Text>

                  <Form.Item shouldUpdate noStyle>
                    {({ getFieldValue }: any) => {
                      const pre = getFieldValue('preroll_source');
                      const mid = getFieldValue('midroll_source');
                      const post = getFieldValue('postroll_source');
                      const anyVast = pre === 'vast' || mid === 'vast' || post === 'vast';
                      const supported = ['videojs', 'jwplayer', 'fluidplayer'].includes(String(selectedPlayer || '').toLowerCase());
                      if (!anyVast || supported) return null;
                      return (
                        <Text type="warning">
                          Lưu ý: Player <Text strong>{String(selectedPlayer)}</Text> không hỗ trợ VAST/VPAID đầy đủ. Khi chọn VAST,
                          website sẽ cố gắng lấy link video từ VAST để phát như video quảng cáo (không đảm bảo VPAID).
                        </Text>
                      );
                    }}
                  </Form.Item>

                  <Form.Item name="midroll_enabled" valuePropName="checked" label="Bật Mid-roll">
                    <Switch />
                  </Form.Item>
                  <Form.Item name="midroll_source" label="Nguồn Mid-roll">
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio.Button value="video">Video (ad_preroll)</Radio.Button>
                      <Radio.Button value="vast">VAST/VPAID</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item name="midroll_vast" label="Mid-roll VAST URL (tùy chọn)">
                    <Input placeholder="https://.../vast.xml" />
                  </Form.Item>
                  <Form.Item name="midroll_interval_seconds" label="Mid-roll mỗi (giây)">
                    <InputNumber min={30} step={30} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="midroll_min_watch_seconds" label="Chỉ chạy Mid-roll sau khi xem tối thiểu (giây)">
                    <InputNumber min={0} step={30} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="midroll_max_per_video" label="Giới hạn số Mid-roll tối đa / 1 video">
                    <InputNumber min={0} step={1} style={{ width: '100%' }} />
                  </Form.Item>

                  <Form.Item name="postroll_enabled" valuePropName="checked" label="Bật Post-roll">
                    <Switch />
                  </Form.Item>
                  <Form.Item name="postroll_source" label="Nguồn Post-roll">
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio.Button value="video">Video (ad_preroll)</Radio.Button>
                      <Radio.Button value="vast">VAST/VPAID</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item name="postroll_vast" label="Post-roll VAST URL (tùy chọn)">
                    <Input placeholder="https://.../vast.xml" />
                  </Form.Item>
                </Space>
              </Form>
            </Panel>
          </Collapse>

          <Button
            type="primary"
            onClick={handleSave}
            loading={saving}
            style={{ marginTop: 16 }}
            icon={<SettingOutlined />}
          >
            Lưu tất cả cài đặt
          </Button>
        </>
      ),
    },
    {
      key: 'preroll',
      label: 'Quảng cáo Video (Pre/Mid/Post-roll)',
      children: (
        <>
          <Card
            title="Quảng cáo Video (Pre/Mid/Post-roll)"
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={openAddPreroll}>
                  Thêm quảng cáo
                </Button>
                <Select
                  value={rollFilter}
                  style={{ width: 180 }}
                  onChange={(v) => setRollFilter(v)}
                  options={[
                    { value: 'all', label: 'Tất cả vị trí' },
                    { value: 'pre', label: 'Pre-roll' },
                    { value: 'mid', label: 'Mid-roll' },
                    { value: 'post', label: 'Post-roll' },
                  ]}
                />
                <Button onClick={loadPrerollData} loading={prerollLoading}>
                  Refresh
                </Button>
              </Space>
            }
          >
            <Table
              loading={prerollLoading}
              dataSource={prerollData.filter((row) => {
                if (rollFilter === 'all') return true;
                const r = (row.roll || 'pre') as any;
                return r === rollFilter;
              })}
              rowKey="id"
              size="small"
              columns={[
                {
                  title: 'Vị trí',
                  dataIndex: 'roll',
                  key: 'roll',
                  width: 90,
                  render: (v: any) => {
                    const roll = (v || 'pre') as 'pre' | 'mid' | 'post';
                    const label = roll === 'mid' ? 'Mid' : roll === 'post' ? 'Post' : 'Pre';
                    const color = roll === 'mid' ? 'blue' : roll === 'post' ? 'gold' : 'green';
                    return <Tag color={color}>{label}</Tag>;
                  },
                },
                { title: 'Tên', dataIndex: 'name', key: 'name' },
                { title: 'Video URL', dataIndex: 'video_url', key: 'video_url', ellipsis: true },
                { title: 'Thời lượng (s)', dataIndex: 'duration', key: 'duration', width: 90 },
                { title: 'Bỏ qua sau (s)', dataIndex: 'skip_after', key: 'skip_after', width: 110 },
                { title: 'Trọng số', dataIndex: 'weight', key: 'weight', width: 90 },
                {
                  title: 'Trạng thái',
                  dataIndex: 'is_active',
                  key: 'is_active',
                  width: 90,
                  render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Bật' : 'Tắt'}</Tag>,
                },
                {
                  title: '',
                  key: 'action',
                  width: 200,
                  render: (_: any, row: PrerollRow) => (
                    <Space size="small">
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEditPreroll(row)}>Sửa</Button>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeletePreroll(row.id)}>Xóa</Button>
                      <Button size="small" onClick={() => togglePrerollActive(row)}>{row.is_active ? 'Tắt' : 'Bật'}</Button>
                    </Space>
                  ),
                },
              ]}
            />
          </Card>

          <Modal
            title={editingId ? 'Sửa quảng cáo' : 'Thêm quảng cáo'}
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
            onOk={() => prerollForm.submit()}
            destroyOnClose
          >
            <Form form={prerollForm} layout="vertical" onFinish={handleSubmitPreroll}>
              <Form.Item name="roll" label="Vị trí" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'pre', label: 'Pre-roll' },
                    { value: 'mid', label: 'Mid-roll' },
                    { value: 'post', label: 'Post-roll' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="name" label="Tên">
                <Input placeholder="Mô tả ngắn" />
              </Form.Item>
              <Form.Item name="video_url" label="URL video" rules={[{ required: true }]}>
                <Input placeholder="https://..." />
              </Form.Item>
              <Form.Item name="image_url" label="URL ảnh (poster/thumbnail)">
                <Input
                  placeholder="https://... hoặc bấm nút bên cạnh"
                  addonAfter={
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <input
                        ref={prerollImageInputRef}
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
                              const apiBase = ((import.meta as any).env?.VITE_API_URL || window.location.origin).replace(/\/$/, '');
                              const r = await fetch(apiBase + '/api/upload-image', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  image: base64,
                                  contentType: file.type || 'image/jpeg',
                                  filename: file.name,
                                  folder: 'preroll',
                                }),
                              });
                              const data = await r.json();
                              if (data.url) {
                                prerollForm.setFieldValue('image_url', data.url);
                                message.success('Đã upload ảnh');
                              } else {
                                message.error(data.error || 'Upload thất bại');
                              }
                            } catch {
                              message.error('Lỗi kết nối API upload');
                            }
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                      <Button type="link" size="small" onClick={() => prerollImageInputRef.current?.click()}>
                        Chọn ảnh
                      </Button>
                    </span>
                  }
                />
              </Form.Item>
              <Form.Item name="duration" label="Thời lượng (giây)">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="skip_after" label="Cho phép bỏ qua sau (giây)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="weight" label="Trọng số (cao = ưu tiên)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="is_active" label="Bật" valuePropName="checked" initialValue={true}>
                <Switch />
              </Form.Item>
            </Form>
          </Modal>
        </>
      ),
    },
  ];

  if (loading) {
    return (
      <>
        <h1>Cài đặt Player</h1>
        <Card loading />
      </>
    );
  }

  return (
    <>
      <h1>Cài đặt Player</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Chọn và cấu hình trình phát video. Player mặc định áp dụng cho mọi lượt xem. Build website để áp dụng thay đổi.
      </p>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        style={{ marginTop: 16 }}
      />
    </>
  );
}

