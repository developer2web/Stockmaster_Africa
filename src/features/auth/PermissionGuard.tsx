import { Redirect } from 'expo-router';
import { PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import { ErrorState } from '@/components/ui/ErrorState';
import { hasAnyPermission } from './permissions';

export function PermissionGuard({ permission, children }: PropsWithChildren<{ permission: string | string[] }>) {
  const { membership, membershipError, isAccessBlocked, refreshMembership, signOut } = useAuth();
  if (membershipError) {
    return (
      <ErrorState
        title="Permissions indisponibles"
        message={membershipError}
        retryLabel={isAccessBlocked ? 'Se connecter' : 'Réessayer'}
        onRetry={() => void (isAccessBlocked ? signOut() : refreshMembership())}
        onCancel={isAccessBlocked ? undefined : () => void signOut()}
      />
    );
  }
  if (!membership) return <Redirect href="/" />;
  const required = Array.isArray(permission) ? permission : [permission];
  if (!hasAnyPermission(membership, required)) {
    return <Redirect href={'/employee' as never} />;
  }
  return children;
}
