import { supabase } from './supabase';

export async function getAdminApiAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token ? String(data.session.access_token) : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

