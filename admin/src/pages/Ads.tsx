import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import Banners from './Banners';
import PrerollAds from './PrerollAds';
import AdOtherSettings from './AdOtherSettings';

type AdsTab = 'banners' | 'ad-other' | 'preroll';

function tabFromSearch(tab: string | null): AdsTab {
  if (tab === 'ad-other' || tab === 'preroll') return tab;
  return 'banners';
}

export default function Ads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeKey = tabFromSearch(searchParams.get('tab'));

  const onTabChange = (key: string) => {
    const k = key as AdsTab;
    if (k === 'banners') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: k });
    }
  };

  return (
    <>
      <h1>Quản lý quảng cáo</h1>
      <Tabs
        activeKey={activeKey}
        onChange={onTabChange}
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
