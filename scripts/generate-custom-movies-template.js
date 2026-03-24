/**
 * Tạo file Excel mẫu custom_movies_template.xlsx (sheet movies + episodes)
 * Chạy: node scripts/generate-custom-movies-template.js
 * Cột theo parseSheetMovies trong build.js
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MOVIES_HEADERS = [
  'id',
  'title',
  'origin_name',
  'type',
  'year',
  'genre',
  'country',
  'language',
  'quality',
  'episode_current',
  'thumb_url',
  'poster_url',
  'description',
  'status',
  'chieurap',
  'showtimes',
  'is_exclusive',
  'tmdb_id',
];
const MOVIES_ROW = [
  1,
  'Ví dụ: Cùng Mẹ Đi Hẹn Hò',
  'Match to Marry',
  'tvshows',
  '2026',
  'Tình Cảm, Gia Đình',
  'Hàn Quốc',
  'Vietsub',
  'HD',
  '6',
  'https://example.com/thumb.jpg',
  'https://example.com/poster.jpg',
  'Mô tả ngắn...',
  'current',
  '0',
  '',
  '0',
  '',
];

const EPISODES_HEADERS = ['movie_id', 'name', 'sources'];
const EPISODES_ROW = [
  1,
  'Tập 1',
  '[{"name":"1","slug":"1","link_embed":"https://...","link_m3u8":"https://..."}]',
];

const wb = XLSX.utils.book_new();
const moviesSheet = XLSX.utils.aoa_to_sheet([MOVIES_HEADERS, MOVIES_ROW]);
const episodesSheet = XLSX.utils.aoa_to_sheet([EPISODES_HEADERS, EPISODES_ROW]);
XLSX.utils.book_append_sheet(wb, moviesSheet, 'movies');
XLSX.utils.book_append_sheet(wb, episodesSheet, 'episodes');

const outPath = path.join(ROOT, 'custom_movies_template.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Đã tạo:', outPath);
