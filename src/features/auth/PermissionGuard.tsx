import { Redirect, router } from 'expo-router';
import { PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import { ErrorState } from '@/components/ui/ErrorState';
import { companyIsReadOnly, READ_ONLY_MESSAGE } from '@/features/subscriptions/readOnlyAccess';
import { usePermissions } from './usePermissions';

export function PermissionGuard({ permission, children }: PropsWithChildren<{ permission: string | string[] }>) {
  const can = usePermissions();
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
  if (!required.some(can)) {
    if (required.every(value => !value.endsWith('.read')) && companyIsReadOnly(membership.companyId)) {
      return <ErrorState title="Abonnement en lecture seule" message={READ_ONLY_MESSAGE} retryLabel="Retour à mes données" onRetry={() => router.replace('/')} />;
    }
    return <ErrorState title="Accès non attribué" message="Votre rôle ne permet pas de consulter cet écran. Demandez l’accès au propriétaire de l’entreprise." retryLabel="Retour à mon espace" onRetry={() => router.replace('/')} />;
  }
  return children;
}
