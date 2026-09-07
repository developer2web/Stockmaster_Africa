import NetInfo from '@react-native-community/netinfo';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUserOfflineQueue, synchronizeOfflineQueue } from './queue';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/services/observability/logger';
import { useAuth } from '@/features/auth/AuthProvider';
import { getOfflineAccessSummary, markOfflineAccessSynchronized } from '@/features/auth/offlineAccess';
import { probeBackendAccess } from './connectivity';

type OfflineContextValue = {
  isOnline: boolean;
  isSynchronizing: boolean;
  pendingCount: number;
  queueError: string | null;
  lastSyncedCount: number;
  lastSynchronizedAt: string | null;
  refreshQueue: () => Promise<void>;
  synchronize: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { revalidateBeforeSynchronization } = useAuth();
  const [isOnline, setOnline] = useState(true);
  const [isSynchronizing, setSynchronizing] = useState(false);
  const synchronizingRef = useRef(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedCount,setLastSyncedCount]=useState(0);
  const [lastSynchronizedAt,setLastSynchronizedAt]=useState<string|null>(null);
  const refreshQueue = useCallback(async () => {
    try {
      setPendingCount((await getCurrentUserOfflineQueue()).length);
      setQueueError(null);
    } catch (error) {
      setQueueError('Le suivi des opérations locales est indisponible. Les données sont conservées.');
      throw error;
    }
  }, []);
  const synchronize = useCallback(async () => {
    if (synchronizingRef.current) return;
    synchronizingRef.current = true;
    setSynchronizing(true);
    try {
      if (!await revalidateBeforeSynchronization()) return;
      const result = await synchronizeOfflineQueue();
      if (result.synced) {
        const synchronizedAt = new Date().toISOString();
        setLastSynchronizedAt(synchronizedAt);
        await markOfflineAccessSynchronized(synchronizedAt).catch(() => undefined);
        setLastSyncedCount(result.synced);
        setTimeout(()=>setLastSyncedCount(0),5000);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['sales'] }),
          queryClient.invalidateQueries({ queryKey: ['sale-stock'] }),
          queryClient.invalidateQueries({ queryKey: ['stock-levels'] }),
          queryClient.invalidateQueries({ queryKey: ['expenses'] }),
          queryClient.invalidateQueries({ queryKey: ['cash-transactions'] }),
          queryClient.invalidateQueries({ queryKey: ['cash-summary'] }),
          queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard-trends'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard-report'] }),
          queryClient.invalidateQueries({ queryKey: ['business-report'] }),
        ]);
      }
    } catch (error) {
      await logger.warning('offline_sync_failed', error);
    } finally {
      synchronizingRef.current = false;
      setSynchronizing(false);
      try {
        await refreshQueue();
      } catch (error) {
        await logger.warning('offline_queue_refresh_failed', error);
      }
    }
  }, [queryClient, refreshQueue, revalidateBeforeSynchronization]);

  useEffect(() => {
    void refreshQueue().catch((error) => logger.warning('offline_queue_boot_failed', error));
    void getOfflineAccessSummary().then((summary) => setLastSynchronizedAt(summary?.lastSynchronizedAt ?? null));
    const checkBackend = async () => {
      const probe = await probeBackendAccess(true);
      setOnline(probe.reachable);
      let queued;
      try {
        queued = await getCurrentUserOfflineQueue();
        setPendingCount(queued.length);
        setQueueError(null);
      } catch {
        setQueueError('Le suivi des opérations locales est indisponible. Les données sont conservées.');
        return;
      }
      if (probe.reachable && probe.authenticated && queued.length>0) await synchronize();
    };
    void checkBackend();
    const unsubscribe = NetInfo.addEventListener((state) => {
      const networkAvailable = state.isConnected !== false && state.isInternetReachable !== false;
      if (!networkAvailable) {
        setOnline(false);
        return;
      }
      void checkBackend();
    });
    const interval = setInterval(() => { void checkBackend(); }, 30_000);
    return () => { unsubscribe(); clearInterval(interval); };
  }, [refreshQueue, synchronize]);

  const value = useMemo(() => ({ isOnline, isSynchronizing, pendingCount, queueError,lastSyncedCount,lastSynchronizedAt, refreshQueue, synchronize }), [isOnline, isSynchronizing, pendingCount, queueError,lastSyncedCount,lastSynchronizedAt, refreshQueue, synchronize]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOffline doit être utilisé dans OfflineProvider');
  return value;
}
