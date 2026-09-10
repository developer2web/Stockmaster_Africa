import { useEffect, useState } from 'react';
import { isNotificationActive, NOTIFICATION_RETENTION_MS } from './retention';

/** Expire visible items and the unread badge even while the screen stays open. */
export function useActiveNotifications<T extends { created_at: string }>(items: T[] | undefined): T[] {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const current = Date.now();
    const next = (items ?? []).reduce((nearest, item) => {
      const expires = new Date(item.created_at).getTime() + NOTIFICATION_RETENTION_MS;
      return expires > current ? Math.min(nearest, expires) : nearest;
    }, Infinity);
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(next - current + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [items, now]);
  return (items ?? []).filter(item => isNotificationActive(item));
}
