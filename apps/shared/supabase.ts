import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const configured = Boolean(url && anonKey);
export const supabase = createClient(
  url || 'https://example.supabase.co',
  anonKey || 'missing-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export type UserContext = {
  membership_id: string | null;
  company_id: string | null;
  company_name: string;
  store_id: string | null;
  role: 'super_admin' | 'company_admin' | 'employee';
  role_name?: string;
  permissions: string[];
  subscription_status: string | null;
};

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function getContext(): Promise<UserContext | null> {
  const { data, error } = await supabase.rpc('get_my_context');
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as UserContext | null;
}
