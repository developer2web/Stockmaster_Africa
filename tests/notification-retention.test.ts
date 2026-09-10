import { describe, expect, it, vi, afterEach } from 'vitest';
import { isNotificationActive, notificationCutoff, NOTIFICATION_RETENTION_MS } from '@/features/notifications/retention';

const from = vi.hoisted(() => vi.fn());
vi.mock('@/services/supabase/client', () => ({ supabase: { from } }));
import { getPersistentNotifications } from '@/features/notifications/api';
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('48-hour notification retention', () => {
  const now = Date.parse('2026-09-09T12:00:00Z');
  it('expires at exactly 48 elapsed hours, whether read or unread', () => {
    for (const read_at of [null, '2026-09-08T12:00:00Z']) {
      const item = { created_at: new Date(now - NOTIFICATION_RETENTION_MS).toISOString(), read_at };
      expect(isNotificationActive(item, now - 1)).toBe(true);
      expect(isNotificationActive(item, now)).toBe(false);
      expect(isNotificationActive(item, now + 1)).toBe(false);
    }
    expect(notificationCutoff(now)).toBe('2026-09-07T12:00:00.000Z');
    expect(isNotificationActive({ created_at: 'invalid' }, now)).toBe(false);
  });
  it('filters expiration before the server row limit and preserves company/recipient scope', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const calls: unknown[][] = [];
    const builder = {
      select: () => builder,
      gt: (...args: unknown[]) => { calls.push(['gt', ...args]); return builder; },
      order: () => builder,
      limit: (value: number) => { calls.push(['limit', value]); return builder; },
      eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return builder; },
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
    };
    from.mockReturnValue(builder);
    await expect(getPersistentNotifications('company-a', 'user-a')).resolves.toEqual([]);
    expect(from).toHaveBeenCalledWith('notifications');
    expect(calls).toEqual([
      ['gt', 'created_at', '2026-09-07T12:00:00.000Z'], ['limit', 100],
      ['eq', 'company_id', 'company-a'], ['eq', 'user_id', 'user-a'],
    ]);
  });
});
