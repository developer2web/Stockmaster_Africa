import NetInfo from '@react-native-community/netinfo';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUserOfflineQueue, synchronizeOfflineQueue } from './queue';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/services/observability/logger';

type OfflineContextValue = {
  isOnline: boolean;
  isSynchronizing: boolean;
  pendingCount: number;
  lastSyncedCount: number;
  refreshQueue: () => Promise<void>;
  synchronize: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [isOnline, setOnline] = useState(true);
  const [isSynchronizing, setSynchronizing] = useState(false);
  const synchronizingRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedCount,setLastSyncedCount]=useState(0);
  const refreshQueue = useCallback(async () => {
    setPendingCount((await getCurrentUserOfflineQueue()).length);
  }, []);
  const synchronize = useCallback(async () => {
    if (synchronizingRef.current) return;
    synchronizingRef.current = true;
    setSynchronizing(true);
    try {
      const result = await synchronizeOfflineQueue();
      if (result.synced) {
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
  }, [queryClient, refreshQueue]);

  useEffect(() => {
    void refreshQueue().catch((error) => logger.warning('offline_queue_boot_failed', error));
    return NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(online);
      if (online) void synchronize();
    });
  }, [refreshQueue, synchronize]);

  const value = useMemo(() => ({ isOnline, isSynchronizing, pendingCount,lastSyncedCount, refreshQueue, synchronize }), [isOnline, isSynchronizing, pendingCount,lastSyncedCount, refreshQueue, synchronize]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOffline doit être utilisé dans OfflineProvider');
  return value;
}
