import { Redirect, router } from 'expo-router';
import { PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import type { AppRole } from '@/types/database';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export function RoleGuard({ roles, children, requireActiveSubscription = true }: PropsWithChildren<{ roles: AppRole[]; requireActiveSubscription?: boolean }>) {
  const { session, membership, businesses, stores, membershipError, isAccessBlocked, isWorkspaceLoading, isSwitchingWorkspace, offlineUnlockRequired, refreshMembership, signOut } = useAuth();
  if (offlineUnlockRequired) return <Redirect href="/(auth)/offline-login" />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (session.user.app_metadata?.must_change_password === true) return <Redirect href="/(auth)/change-temporary-password" />;
  if (isSwitchingWorkspace || (!membership && isWorkspaceLoading)) return <LoadingScreen label={isSwitchingWorkspace ? 'Changement de boutique…' : 'Chargement de vos boutiques…'} />;
  if (membershipError) {
    return (
      <ErrorState
        title="Accès indisponible"
        message={membershipError}
        retryLabel={isAccessBlocked ? 'Se connecter' : 'Réessayer'}
        onRetry={() => void (isAccessBlocked ? signOut() : refreshMembership())}
        onCancel={isAccessBlocked ? undefined : () => void signOut()}
      />
    );
  }
  if (!membership) {
    const employeeOnly = businesses.length > 0 && businesses.every((business) => business.role === 'employee');
    if (employeeOnly) return <Redirect href={stores.length > 1 ? '/choose-store' : '/'} />;
    return <Redirect href="/(auth)/complete-profile" />;
  }
  if (!roles.includes(membership.role)) return <ErrorState
    title="Espace non autorisé"
    message={`Votre compte ${membership.role === 'employee' ? 'employé' : membership.role === 'company_admin' ? 'propriétaire' : 'Super Administrateur'} n’est pas autorisé à utiliser cet espace.`}
    retryLabel="Retour à mon espace" onRetry={() => router.replace('/')} onCancel={() => void signOut()}
  />;
  if (
    requireActiveSubscription &&
    membership.role !== 'super_admin' &&
    ['pending', 'expired', 'canceled', 'cancelled', 'suspended'].includes(membership.subscriptionStatus ?? '')
  ) {
    return <Redirect href="/(subscription)" />;
  }
  return children;
}
