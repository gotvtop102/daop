/**
 * Chỉ chạy inject footer và nav (không cần Supabase/API).
 * Dùng khi cần cập nhật header/footer cho tất cả trang HTML.
 * Chạy: node scripts/inject-html-only.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import {
  injectFooterIntoHtml,
  injectNavIntoHtml,
  injectLoadingScreenIntoHtml,
} from './lib/html-injectors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

injectFooterIntoHtml({ rootDir: ROOT, publicDir: PUBLIC });
injectNavIntoHtml({ rootDir: ROOT, publicDir: PUBLIC });
injectLoadingScreenIntoHtml({ rootDir: ROOT, publicDir: PUBLIC });
console.log('Done.');
