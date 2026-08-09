import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { sessionStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) console.warn('Variables Supabase absentes. Copiez .env.example vers .env.');

export const supabase = createClient(url ?? 'https://example.supabase.co', anonKey ?? 'missing-anon-key', {
  auth: { storage: sessionStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
