import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function Index() {
  const { session, membership, businesses, stores, membershipError, isAccessBlocked, needsOnboarding, isWorkspaceLoading, refreshMembership, signOut } = useAuth();
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!membership && isWorkspaceLoading) return <LoadingScreen label="Chargement de vos boutiques…" />;
  if (membershipError) {
    return (
      <ErrorState
        title="Espace indisponible"
        message={membershipError}
        retryLabel={isAccessBlocked ? 'Retour à la connexion' : 'Réessayer'}
        onRetry={() => void (isAccessBlocked ? signOut() : refreshMembership())}
        onCancel={isAccessBlocked ? undefined : () => void signOut()}
      />
    );
  }
  if (!membership && businesses.length) {
    const employeeOnly = businesses.every((business) => business.role === 'employee');
    if (employeeOnly) {
      if (stores.length > 1) return <Redirect href="/choose-store" />;
      return (
        <ErrorState
          title="Aucune boutique accessible"
          message="Aucune boutique ne vous est attribuée. Contactez votre administrateur."
          retryLabel="Se déconnecter"
          onRetry={() => void signOut()}
        />
      );
    }
    if (stores.length) return <Redirect href="/choose-store" />;
    return <Redirect href="/choose-business" />;
  }
  if (!membership && needsOnboarding) return <Redirect href="/(auth)/complete-profile" />;
  if (!membership) {
    return <ErrorState title="Entreprise indisponible" message="Impossible de confirmer votre entreprise pour le moment." onRetry={() => void refreshMembership()} onCancel={() => void signOut()} />;
  }
  if (membership.role === 'super_admin') return <Redirect href="/(super-admin)" />;
  if (['pending', 'expired', 'canceled', 'cancelled', 'suspended'].includes(membership.subscriptionStatus ?? '')) {
    return <Redirect href="/(subscription)" />;
  }
  if (membership.role === 'company_admin') return <Redirect href="/(admin)" />;
  return <Redirect href={'/employee' as never} />;
}
