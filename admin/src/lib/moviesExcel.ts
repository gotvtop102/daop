import * as XLSX from 'xlsx';

/** Cột khớp bảng Supabase (export / import round-trip). */
export const MOVIES_EXCEL_COLUMNS = [
  'id',
  'slug',
  'title',
  'name',
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
  'content',
  'status',
  'chieurap',
  'showtimes',
  'is_exclusive',
  'tmdb_id',
  'modified',
  'update',
  'note',
  'director',
  'actor',
  'tmdb_type',
  'created_at',
  'updated_at',
] as const;

export const MOVIE_EPISODES_EXCEL_COLUMNS = [
  'id',
  'movie_id',
  'episode_code',
  'episode_name',
  'server_slug',
  'server_name',
  'link_m3u8',
  'link_embed',
  'link_backup',
  'link_vip1',
  'link_vip2',
  'link_vip3',
  'link_vip4',
  'link_vip5',
  'note',
  'sort_order',
  'created_at',
  'updated_at',
] as const;

function cellVal(v: unknown): string {
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

function rowToArray(row: Record<string, any>, cols: readonly string[]): string[] {
  return cols.map((c) => cellVal(row[c]));
}

function aoaSheet(header: readonly string[], rows: any[]): XLSX.WorkSheet {
  const aoa: string[][] = [header as unknown as string[], ...rows.map((r) => rowToArray(r, header))];
  return XLSX.utils.aoa_to_sheet(aoa);
}

export function buildMoviesEpisodesWorkbook(movies: any[], movieEpisodes: any[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaSheet(MOVIES_EXCEL_COLUMNS, movies), 'movies');
  XLSX.utils.book_append_sheet(wb, aoaSheet(MOVIE_EPISODES_EXCEL_COLUMNS, movieEpisodes), 'movie_episodes');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

function sheetToObjects(ws?: XLSX.WorkSheet): Record<string, unknown>[] {
  if (!ws) return [];
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
      const s = typeof raw === 'string' ? raw.trim() : cellVal(raw);
      if (s !== '') {
        obj[key] = typeof raw === 'number' && key !== 'sort_order' ? cellVal(raw) : s;
        has = true;
      }
    }
    if (has) out.push(obj);
  }
  return out;
}

function normalizeMovies(rows: Record<string, unknown>[]): any[] {
  return rows.map((r) => {
    const o: any = { ...r };
    if (o.tmdb_id != null && o.tmdb_id !== '') o.tmdb_id = String(o.tmdb_id).replace(/\.0$/, '');
    return o;
  });
}

function normalizeEpisodes(rows: Record<string, unknown>[]): any[] {
  return rows.map((r) => {
    const o: any = { ...r };
    if (!o.episode_name && o.name) o.episode_name = o.name;
    delete o.name;
    if ('sort_order' in o && o.sort_order !== '' && o.sort_order !== null && o.sort_order !== undefined) {
      const n = Number(o.sort_order);
      o.sort_order = Number.isFinite(n) ? n : 0;
    }
    if (o.movie_id != null) o.movie_id = String(o.movie_id).trim();
    if (o.id != null) o.id = String(o.id).trim();
    return o;
  });
}

export function parseMoviesEpisodesWorkbook(data: ArrayBuffer): { movies: any[]; movie_episodes: any[] } {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const moviesWs = wb.Sheets['movies'] || wb.Sheets[wb.SheetNames[0]];
  let epName = wb.SheetNames.find(
    (n) => n.toLowerCase() === 'movie_episodes' || n.toLowerCase() === 'episodes'
  );
  const epWs = epName ? wb.Sheets[epName] : undefined;
  return {
    movies: normalizeMovies(sheetToObjects(moviesWs)),
    movie_episodes: normalizeEpisodes(sheetToObjects(epWs)),
  };
}

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
