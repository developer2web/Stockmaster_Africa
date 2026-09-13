import { useAuth } from './AuthProvider';
import { hasPermission } from './permissions';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { isSubscriptionReadOnly } from '@/features/subscriptions/readOnlyAccess';

// Subscribe to plan updates so action buttons react to expiration and renewal.
export function usePermissions() {
  const { membership } = useAuth();
  const { subscription } = useSubscription();
  return (permission: string) => hasPermission(membership, permission,
    subscription ? isSubscriptionReadOnly(subscription) : undefined);
}
