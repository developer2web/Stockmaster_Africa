import { sharedPublicValue } from '../../src/constants/publicConfig';
import { createClient } from '@supabase/supabase-js';

const url = sharedPublicValue(import.meta.env, 'SUPABASE_URL');
const anonKey = sharedPublicValue(import.meta.env, 'SUPABASE_ANON_KEY');
const projectRef = (() => {
  try { return url ? new URL(url).hostname.split('.')[0] : 'missing'; }
  catch { return 'missing'; }
})();
const authStorageKey = `sb-${projectRef}-auth-token`;

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isJwtIssuedInFuture = (error: unknown) =>
  /jwt issued at future|issued in the future/i.test(
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : String(error ?? ''),
  );

async function retryJwtClockSkew<T extends { error: unknown }>(
  operation: () => PromiseLike<T>,
  attempts = 5,
): Promise<T> {
  let result = await operation();
  for (let attempt = 1; result.error && isJwtIssuedInFuture(result.error) && attempt < attempts; attempt += 1) {
    await wait(Math.min(8_000, 1_000 * 2 ** (attempt - 1)));
    result = await operation();
  }
  return result;
}

export function clearCachedWebSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(authStorageKey);
  window.localStorage.removeItem(`${authStorageKey}-code-verifier`);
}

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

export type BusinessAccess = {
  company_id: string;
  company_name: string;
  membership_id: string;
  role: UserContext['role'];
  role_name: string;
  subscription_status: string | null;
};

export async function signIn(email: string, password: string) {
  clearCachedWebSession();
  const { error } = await retryJwtClockSkew(() => supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  }));
  if (error) throw error;
}

export async function getContext(): Promise<UserContext | null> {
  const { data, error } = await retryJwtClockSkew(() => supabase.rpc('get_my_context'));
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as UserContext | null;
}

export async function getAccessibleBusinesses(): Promise<BusinessAccess[]> {
  const { data, error } = await retryJwtClockSkew(() => supabase.rpc('get_accessible_businesses'));
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as BusinessAccess[];
}

export function businessContext(business: BusinessAccess): UserContext {
  return {
    membership_id: business.membership_id,
    company_id: business.company_id,
    company_name: business.company_name,
    store_id: null,
    role: business.role,
    role_name: business.role_name,
    permissions: [],
    subscription_status: business.subscription_status,
  };
}
