import * as XLSX from 'xlsx';

/** Sheet meta (JSON ô A1) — không import như bảng dữ liệu. */
export const EXPORT_META_SHEET = '_export_meta';

export function downloadWorkbook(filename: string, buf: Uint8Array) {
  const copy = new Uint8Array(buf.length);
  copy.set(buf);
  const blob = new Blob([copy], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = String(v);
    if (/^\d+\.0$/.test(s)) return s.replace(/\.0$/, '');
    return s;
  }
  return String(v).trim();
}

function parseCellValue(raw: unknown): unknown {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return undefined;
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s);
    } catch {
      /* keep string */
    }
  }
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  return s;
}

/** Tên sheet Excel: tối đa 31 ký tự, không chứa : \ / ? * [ ] */
export function safeExcelSheetName(name: string): string {
  const s = String(name || '')
    .replace(/[:\\/?*[\]]/g, '_')
    .trim()
    .slice(0, 31);
  return s || 'sheet';
}

function uniqueSheetName(base: string, used: Set<string>): string {
  let name = safeExcelSheetName(base);
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suf = `_${n++}`;
    name = safeExcelSheetName(base.slice(0, Math.max(1, 31 - suf.length)) + suf);
  }
  used.add(name.toLowerCase());
  return name;
}

function collectHeaderKeys(rows: any[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      Object.keys(r).forEach((k) => keys.add(k));
    }
  }
  return [...keys].sort();
}

function buildSheetFromRows(rows: any[]): XLSX.WorkSheet {
  const list = Array.isArray(rows) ? rows : [];
  const header = list.length ? collectHeaderKeys(list) : [];
  const aoa: string[][] = [];
  aoa.push(header);
  for (const r of list) {
    aoa.push(header.map((h) => stringifyCell(r?.[h])));
  }
  return XLSX.utils.aoa_to_sheet(aoa);
}

/**
 * Mỗi key → một sheet (bỏ qua key bắt đầu bằng __).
 * meta ghi vào sheet EXPORT_META_SHEET dạng JSON (một ô).
 */
export function buildMultiTableWorkbook(
  tables: Record<string, any[]>,
  meta?: Record<string, unknown>
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const keys = Object.keys(tables)
    .filter((k) => !k.startsWith('__'))
    .sort();

  for (const key of keys) {
    const rows = tables[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const sheet = uniqueSheetName(key, used);
    const ws = buildSheetFromRows(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet);
  }

  if (meta && Object.keys(meta).length) {
    const metaWs = XLSX.utils.aoa_to_sheet([[safeStringifyMeta(meta)]]);
    const metaName = uniqueSheetName(EXPORT_META_SHEET, used);
    XLSX.utils.book_append_sheet(wb, metaWs, metaName);
  }

  if (!wb.SheetNames?.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['(no rows)']]), uniqueSheetName('empty', used));
  }

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

function safeStringifyMeta(o: Record<string, unknown>): string {
  try {
    return JSON.stringify(o);
  } catch {
    return '{}';
  }
}

function sheetToRowObjects(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
  if (!rows.length) return [];
  const headerRow = rows[0] as unknown[];
  const headers = headerRow.map((h) =>
    String(h ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
  );
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const obj: Record<string, unknown> = {};
    let has = false;
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue;
      const raw = row[j];
      if (raw === null || raw === undefined || raw === '') continue;
      const val = parseCellValue(raw);
      if (val !== undefined && val !== '') {
        obj[key] = val;
        has = true;
      }
    }
    if (has) out.push(obj);
  }
  return out;
}

/** Sheet name → tên bảng (chuẩn hóa alias, ký tự thường). */
export function normalizeImportSheetName(name: string, context: 'admin' | 'user' | 'd1'): string {
  const n = String(name || '').trim();
  const lower = n.toLowerCase();
  if (context === 'admin' && (lower === 'episodes' || lower === 'movie_episodes')) {
    return 'movie_episodes';
  }
  if (context === 'd1') {
    if (lower === 'comments' || lower === 'comment') return 'comments';
    if (lower === 'comment_reactions' || lower === 'reactions') return 'comment_reactions';
  }
  return lower;
}

export function parseMultiTableWorkbook(buf: ArrayBuffer, context: 'admin' | 'user' | 'd1'): Record<string, any[]> {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const out: Record<string, any[]> = {};
  const metaLower = EXPORT_META_SHEET.toLowerCase();

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase() === metaLower) continue;
    const logical = normalizeImportSheetName(sheetName, context);
    const rows = sheetToRowObjects(wb.Sheets[sheetName]).map((r) => normalizeImportedRow(logical, r, context));
    if (!out[logical]) out[logical] = [];
    out[logical].push(...rows);
  }
  return out;
}

function normalizeImportedRow(table: string, row: Record<string, unknown>, context: string): any {
  const o: any = { ...row };
  if (table === 'movies' && context === 'admin') {
    if (o.tmdb_id != null && o.tmdb_id !== '') o.tmdb_id = String(o.tmdb_id).replace(/\.0$/, '');
  }
  if (table === 'movie_episodes' && context === 'admin') {
    if (!o.episode_name && o.name) o.episode_name = o.name;
    delete o.name;
    if ('sort_order' in o && o.sort_order !== '' && o.sort_order !== null && o.sort_order !== undefined) {
      const n = Number(o.sort_order);
      o.sort_order = Number.isFinite(n) ? n : 0;
    }
    if (o.movie_id != null) o.movie_id = String(o.movie_id).trim();
    if (o.id != null) o.id = String(o.id).trim();
  }
  if (context === 'd1') {
    if (o.id != null && (typeof o.id === 'number' || /^-?\d+$/.test(String(o.id)))) {
      o.id = Number(o.id);
    }
    if (o.comment_id != null && (typeof o.comment_id === 'number' || /^-?\d+$/.test(String(o.comment_id)))) {
      o.comment_id = Number(o.comment_id);
    }
    if (o.parent_id != null && String(o.parent_id).trim() !== '' && /^-?\d+$/.test(String(o.parent_id))) {
      o.parent_id = Number(o.parent_id);
    }
  }
  return o;
}
