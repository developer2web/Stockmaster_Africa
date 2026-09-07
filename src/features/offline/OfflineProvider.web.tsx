import { useQueryClient } from '@tanstack/react-query';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { getCurrentUserOfflineQueue, synchronizeOfflineQueue } from './queue';
import { logger } from '@/services/observability/logger';

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
  const [isOnline, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [isSynchronizing, setSynchronizing] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedCount, setLastSyncedCount] = useState(0);
  const [lastSynchronizedAt, setLastSynchronizedAt] = useState<string | null>(null);
  const synchronizingRef = useRef(false);

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
      const result = await synchronizeOfflineQueue();
      if (result.synced) {
        setLastSynchronizedAt(new Date().toISOString());
        setLastSyncedCount(result.synced);
        window.setTimeout(() => setLastSyncedCount(0), 5000);
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
  }, [queryClient, refreshQueue]);

  useEffect(() => {
    void refreshQueue().catch((error) => logger.warning('offline_queue_boot_failed', error));
    const online = () => { setOnline(true); void synchronize(); };
    const offline = () => setOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [refreshQueue, synchronize]);

  const value = useMemo(() => ({ isOnline, isSynchronizing, pendingCount, queueError, lastSyncedCount, lastSynchronizedAt, refreshQueue, synchronize }), [isOnline, isSynchronizing, pendingCount, queueError, lastSyncedCount, lastSynchronizedAt, refreshQueue, synchronize]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOffline doit être utilisé dans OfflineProvider');
  return value;
}
