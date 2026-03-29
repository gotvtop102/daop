import { Tabs } from 'antd';
import Banners from './Banners';
import PrerollAds from './PrerollAds';
import AdOtherSettings from './AdOtherSettings';

export default function Ads() {
  return (
    <>
      <h1>Quản lý quảng cáo</h1>
      <Tabs
        defaultActiveKey="banners"
        destroyInactiveTabPane
        items={[
          {
            key: 'banners',
            label: 'Banner',
            children: <Banners />,
          },
          {
            key: 'ad-other',
            label: 'Quảng cáo khác',
            children: <AdOtherSettings />,
          },
          {
            key: 'preroll',
            label: 'Video Ads (Pre/Mid/Post)',
            children: <PrerollAds />,
          },
        ]}
      />
    </>
  );
}
