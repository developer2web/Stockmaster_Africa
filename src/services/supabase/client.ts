import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { sessionStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const projectRef = (() => {
  try { return url ? new URL(url).hostname.split('.')[0] : 'missing'; }
  catch { return 'missing'; }
})();
const authStorageKey = `sb-${projectRef}-auth-token`;

if (!url || !anonKey) console.warn('Variables Supabase absentes. Copiez .env.example vers .env.');

export const supabase = createClient(url ?? 'https://example.supabase.co', anonKey ?? 'missing-anon-key', {
  auth: { storage: sessionStorage, storageKey: authStorageKey, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' },
});

export async function clearCachedSession() {
  await Promise.allSettled([
    sessionStorage.removeItem(authStorageKey),
    sessionStorage.removeItem(`${authStorageKey}-code-verifier`),
  ]);
}

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
