import { useQueryClient } from '@tanstack/react-query';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { getCurrentUserOfflineQueue, synchronizeOfflineQueue } from './queue';

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
  const [isOnline, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [isSynchronizing, setSynchronizing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedCount, setLastSyncedCount] = useState(0);
  const synchronizingRef = useRef(false);

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
        window.setTimeout(() => setLastSyncedCount(0), 5000);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['sales'] }),
          queryClient.invalidateQueries({ queryKey: ['stock-levels'] }),
          queryClient.invalidateQueries({ queryKey: ['expenses'] }),
          queryClient.invalidateQueries({ queryKey: ['cash-transactions'] }),
          queryClient.invalidateQueries({ queryKey: ['cash-summary'] }),
        ]);
      }
    } finally {
      synchronizingRef.current = false;
      setSynchronizing(false);
      await refreshQueue();
    }
  }, [queryClient, refreshQueue]);

  useEffect(() => {
    void refreshQueue();
    const online = () => { setOnline(true); void synchronize(); };
    const offline = () => setOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [refreshQueue, synchronize]);

  const value = useMemo(() => ({ isOnline, isSynchronizing, pendingCount, lastSyncedCount, refreshQueue, synchronize }), [isOnline, isSynchronizing, pendingCount, lastSyncedCount, refreshQueue, synchronize]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOffline doit être utilisé dans OfflineProvider');
  return value;
}

