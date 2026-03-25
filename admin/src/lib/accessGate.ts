import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

const _urlB64 = 'aHR0cHM6Ly9sYWt1cXNwZWlidmpwaGZtdWxocC5zdXBhYmFzZS5jbw==';
const _anonB64 =
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW14aGEzVnhjM0JsYVdKMmFuQm9abTExYkdod0lpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzTnpRek5qVTJOVEVzSW1WNGNDSTZNakE0T1RrME1UWTFNWDAudUpWd3Z6WXdKRk9iMmNLYTJNRlNPTVlYUTc4dG8xYUdGTjNoNVNyTDhyVQ==';

const _tableB64 = 'dmlwX2tleQ==';
const _colCodeB64 = 'a2V5';
const _colMarkB64 = 'Y2hlY2s=';
const _colIdB64 = 'aWQ=';
const _stateTableB64 = 'YWRtaW5fYWNjZXNzX3N0YXRl';
const _stateUserB64 = 'dXNlcl9pZA==';
const _stateEnabledB64 = 'ZW5hYmxlZA==';
const _colEntitleB64 = 'dmlw';
const _stateTokenIdB64 = 'dmlwX2tleV9pZA==';

function _d(b64: string): string {
  try {
    if (typeof atob === 'function') return atob(b64);
  } catch {
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = _d(_urlB64);
    const anon = _d(_anonB64);
    _client = createClient(url, anon);
  }
  return _client;
}

const ACCESS_FLAG_STORAGE = 'daop_admin_access_1';

export function isAccessEnabled(): boolean {
  try {
    return localStorage.getItem(ACCESS_FLAG_STORAGE) === '1';
  } catch {
    return false;
  }
}

export function setAccessEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(ACCESS_FLAG_STORAGE, '1');
    else localStorage.removeItem(ACCESS_FLAG_STORAGE);
  } catch {
  }
}

export function primeAccessSubsystem(): boolean {
  void getClient;
  return true;
}

export type ActivationOutcome =
  | { ok: true }
  | { ok: false; message: string };

export async function activateAccessWithCode(input: string): Promise<ActivationOutcome> {
  const code = String(input || '').trim();
  if (!code) return { ok: false, message: 'Vui lòng nhập mã.' };

  const sb = getClient();
  const tableName = _d(_tableB64);
  const colCode = _d(_colCodeB64);
  const colMark = _d(_colMarkB64);
  const colId = _d(_colIdB64);
  const colEntitle = _d(_colEntitleB64);

  const { data: row, error: selErr } = await sb
    .from(tableName)
    .select([colId, colMark, colEntitle].join(','))
    .eq(colCode, code)
    .maybeSingle();

  if (selErr) {
    return { ok: false, message: selErr.message || 'Không kiểm tra được.' };
  }
  if (!row) {
    return { ok: false, message: 'Mã sai hoặc đã được dùng.' };
  }

  const anyRow = row as any;

  const entitleOk = String(anyRow[colEntitle] ?? '')
    .trim()
    .toUpperCase() === 'OK';

  if (!entitleOk) {
    setAccessEnabled(false);
    void persistAccessForCurrentUser(false, null);
    return { ok: false, message: 'Mã sai hoặc đã được dùng.' };
  }

  const used = String(anyRow[colMark] ?? '')
    .trim()
    .toUpperCase() === 'OK';

  if (used) return { ok: false, message: 'Mã sai hoặc đã được dùng.' };

  const idVal = anyRow[colId];
  const { error: updErr } = await sb
    .from(tableName)
    .update({ [colMark]: 'OK' })
    .eq(colId, idVal);

  if (updErr) {
    return { ok: false, message: updErr.message || 'Không cập nhật được trạng thái.' };
  }

  setAccessEnabled(true);
  await persistAccessForCurrentUser(true, idVal);
  return { ok: true };
}

export async function persistAccessForCurrentUser(on: boolean, vipKeyId: string | null): Promise<void> {
  const { data } = await supabase.auth.getSession();
  let userId = data.session?.user?.id;
  if (!userId) {
    const u = await supabase.auth.getUser().catch(() => null);
    userId = (u as any)?.data?.user?.id;
  }
  if (!userId) {
    console.error('[access] persist: missing userId (session/auth error?)');
    return;
  }

  const sbState = supabase;
  const tableName = _d(_stateTableB64);
  const userCol = _d(_stateUserB64);
  const enabledCol = _d(_stateEnabledB64);
  const vipKeyIdCol = _d(_stateTokenIdB64);

  const now = new Date().toISOString();
  try {
    const { data: existing } = await sbState
      .from(tableName)
      .select([userCol, enabledCol, vipKeyIdCol].join(','))
      .eq(userCol, userId)
      .maybeSingle();

    if (existing) {
      await sbState
        .from(tableName)
        .update({
          [enabledCol]: on,
          [vipKeyIdCol]: on ? vipKeyId : null,
          updated_at: now,
        })
        .eq(userCol, userId);
      return;
    }

    await sbState.from(tableName).insert({
      [userCol]: userId,
      [enabledCol]: on,
      [vipKeyIdCol]: on ? vipKeyId : null,
      updated_at: now,
    });
  } catch (e) {
    console.error('[access] persistAccessForCurrentUser failed', e);
  }
}

export async function syncAccessForCurrentUser(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  let userId = data.session?.user?.id;
  if (!userId) {
    const u = await supabase.auth.getUser().catch(() => null);
    userId = (u as any)?.data?.user?.id;
  }
  if (!userId) return false;

  const sbState = supabase;
  const tableName = _d(_stateTableB64);
  const userCol = _d(_stateUserB64);
  const enabledCol = _d(_stateEnabledB64);
  const vipKeyIdCol = _d(_stateTokenIdB64);

  const sbVip = getClient();
  const vipTableName = _d(_tableB64);
  const vipColId = _d(_colIdB64);
  const vipColVip = _d(_colEntitleB64);

  const { data: row, error } = await sbState
    .from(tableName)
    .select([enabledCol, vipKeyIdCol].join(','))
    .eq(userCol, userId)
    .maybeSingle();

  if (error || !row) return false;

  const enabled = Boolean((row as any)[enabledCol]);
  const vipKeyId = (row as any)[vipKeyIdCol] as string | null | undefined;
  if (!enabled || !vipKeyId) {
    setAccessEnabled(false);
    return false;
  }

  const { data: vipRow, error: vipErr } = await sbVip
    .from(vipTableName)
    .select(vipColVip)
    .eq(vipColId, vipKeyId)
    .maybeSingle();

  if (vipErr || !vipRow) {
    setAccessEnabled(false);
    void persistAccessForCurrentUser(false, null);
    return false;
  }

  const vipOk = String((vipRow as any)[vipColVip] ?? '')
    .trim()
    .toUpperCase() === 'OK';

  if (!vipOk) {
    setAccessEnabled(false);
    void persistAccessForCurrentUser(false, null);
    return false;
  }

  setAccessEnabled(true);
  return true;
}
