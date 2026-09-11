import { expect, it } from 'vitest';
import { canUseNotifications, notificationQueryKey, notificationRoute } from '@/features/notifications/access';
import type { MembershipContext } from '@/types/database';
const manager = { companyId: 'company', storeId: 'store-a', role: 'employee', permissions: ['notifications.read', 'stock_movements.read'] } as MembershipContext;
it('keeps the personal inbox visible for employees before business alerts are enabled', () => {
  expect(canUseNotifications(manager)).toBe(true);
  expect(canUseNotifications({ ...manager, permissions: ['stock_movements.read'] })).toBe(true);
  expect(canUseNotifications({ ...manager, permissions: [] })).toBe(true);
  expect(canUseNotifications({ ...manager, companyId: null })).toBe(false);
  expect(canUseNotifications(null)).toBe(false);
  expect(canUseNotifications({ ...manager, role: 'company_admin', permissions: [] })).toBe(true);
  expect(canUseNotifications({ ...manager, role: 'super_admin' })).toBe(false);
  expect(notificationRoute(manager)).toBe('/employee/notifications');
});
it('does not reuse notification caches between accounts, stores or permissions', () => {
  const key = notificationQueryKey(manager, 'manager-a');
  expect(notificationQueryKey(manager, 'manager-b')).not.toEqual(key);
  expect(notificationQueryKey({ ...manager, storeId: 'store-b' }, 'manager-a')).not.toEqual(key);
  expect(notificationQueryKey({ ...manager, permissions: [] }, 'manager-a')).not.toEqual(key);
});
