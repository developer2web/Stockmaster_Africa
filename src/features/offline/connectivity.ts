import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/services/supabase/client';

export type BackendReachability = {
  reachable: boolean;
  authenticated: boolean;
  checkedAt: number;
};

const PROBE_CACHE_MS = 8_000;
const PROBE_TIMEOUT_MS = 5_000;
let cachedProbe: BackendReachability | null = null;
let activeProbe: Promise<BackendReachability> | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('backend_probe_timeout')), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function isBackendUnavailable(error: unknown) {
  const value = error as { status?: number; message?: string } | null;
  const message = `${value?.message ?? error ?? ''}`;
  return message === 'backend_probe_timeout'
    || /network request failed|failed to fetch|fetch failed|networkerror|load failed|timeout|timed out|socket|connection/i.test(message)
    || (typeof value?.status === 'number' && value.status >= 500);
}

export async function probeBackendAccess(force = false): Promise<BackendReachability> {
  const now = Date.now();
  if (!force && cachedProbe && now - cachedProbe.checkedAt < PROBE_CACHE_MS) return cachedProbe;
  if (!force && activeProbe) return activeProbe;

  activeProbe = (async () => {
    const state = await NetInfo.fetch();
    if (state.isConnected === false || state.isInternetReachable === false) {
      return { reachable: false, authenticated: false, checkedAt: Date.now() };
    }
    try {
      const { data, error } = await withTimeout(supabase.auth.getUser(), PROBE_TIMEOUT_MS);
      if (error) {
        return {
          reachable: !isBackendUnavailable(error),
          authenticated: false,
          checkedAt: Date.now(),
        };
      }
      return { reachable: true, authenticated: !!data.user, checkedAt: Date.now() };
    } catch (error) {
      return {
        reachable: !isBackendUnavailable(error),
        authenticated: false,
        checkedAt: Date.now(),
      };
    }
  })();

  try {
    cachedProbe = await activeProbe;
    return cachedProbe;
  } finally {
    activeProbe = null;
  }
}

export function clearBackendProbeCache() {
  cachedProbe = null;
}

export async function isDeviceOffline(force = false) {
  const state = await NetInfo.fetch();
  if (state.isConnected === false || state.isInternetReachable === false) return true;
  return !(await probeBackendAccess(force)).reachable;
}
