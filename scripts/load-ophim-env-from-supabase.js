// Đọc cài đặt OPhim (tự động) từ Supabase Admin và ghi vào GITHUB_ENV
// Ưu tiên các key auto: ophim_auto_*, fallback sang ophim_*

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.SUPABASE_ADMIN_URL;
  const key = process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY;
  const envFile = process.env.GITHUB_ENV;

  if (!url || !key) {
    console.log('SUPABASE_ADMIN_URL hoặc SUPABASE_ADMIN_SERVICE_ROLE_KEY chưa có, bỏ qua load-ophim-env.');
    return;
  }
  if (!envFile) {
    console.log('GITHUB_ENV không có trong env, bỏ qua load-ophim-env.');
    return;
  }

  const supabase = createClient(url, key);
  const wantedKeys = [
    'ophim_auto_start_page',
    'ophim_auto_end_page',
    'ophim_start_page',
    'ophim_end_page',
    'update_data_two_phase',
    'upload_images_after_build',
  ];

  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', wantedKeys);

  if (error) {
    console.log('Không đọc được site_settings từ Supabase:', error.message || error);
    return;
  }

  const map = {};
  (data || []).forEach((r) => {
    if (r && r.key != null) map[r.key] = r.value;
  });

  const numOr = (v, def) => {
    const n = Number(v);
    return Number.isNaN(n) ? def : n;
  };

  const startPage = numOr(map.ophim_auto_start_page ?? map.ophim_start_page, 1);
  const endPage = numOr(map.ophim_auto_end_page ?? map.ophim_end_page, 1);
  const twoPhase = String(map.update_data_two_phase || '').trim();
  const twoPhaseOn = (twoPhase === '1' || twoPhase.toLowerCase() === 'true');
  const uploadImages = String(map.upload_images_after_build || '').trim();
  const uploadImagesOn = (uploadImages === '1' || uploadImages.toLowerCase() === 'true');

  const lines = [
    `OPHIM_START_PAGE=${startPage}`,
    `OPHIM_END_PAGE=${endPage}`,
    `UPDATE_DATA_TWO_PHASE=${twoPhaseOn ? 1 : 0}`,
    `UPLOAD_IMAGES_AFTER_BUILD=${uploadImagesOn ? 1 : 0}`,
  ];

  fs.appendFileSync(envFile, lines.join('\n') + '\n', 'utf8');
  console.log('Đã ghi OPHIM_* vào GITHUB_ENV từ Supabase (auto settings).');
}

main().catch((e) => {
  console.error('load-ophim-env-from-supabase failed:', e?.message || e);
  process.exit(0); // không làm fail build nếu lỗi
});

