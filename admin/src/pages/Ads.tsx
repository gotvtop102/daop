import { Tabs } from 'antd';
import Banners from './Banners';
import PrerollAds from './PrerollAds';

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
            key: 'preroll',
            label: 'Pre-roll',
            children: <PrerollAds />,
          },
        ]}
      />
    </>
  );
}
