import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { supabase } from '@/services/supabase/client';
import { withRequestTimeout } from '@/services/supabase/requestTimeout';
import { readableError } from '@/utils/errors';

export default function Index() {
  const { session, membership, businesses, stores, membershipError, isAccessBlocked, needsOnboarding, isWorkspaceLoading, offlineUnlockRequired, offlineAuthenticated, refreshMembership, signOut } = useAuth();
  const billingOnboarding=useQuery({queryKey:['billing-onboarding',membership?.companyId],queryFn:async()=>{const{data,error}=await withRequestTimeout(signal=>supabase.rpc('billing_onboarding_required',{p_company_id:membership!.companyId}).abortSignal(signal));if(error)throw error;return!!data},retry:false,enabled:!!session&&!offlineAuthenticated&&membership?.role==='company_admin'&&!!membership.companyId});
  if (offlineUnlockRequired) return <Redirect href="/(auth)/offline-login" />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (session.user.user_metadata?.must_change_password === true) return <Redirect href="/(auth)/change-temporary-password" />;
  if (!membership && isWorkspaceLoading) return <LoadingScreen label="Chargement de vos boutiques…" />;
  if (membershipError) {
    return (
      <ErrorState
        title="Espace indisponible"
        message={membershipError}
        retryLabel={isAccessBlocked ? 'Se connecter' : 'Réessayer'}
        onRetry={() => void (isAccessBlocked ? signOut() : refreshMembership())}
        onCancel={isAccessBlocked ? undefined : () => void signOut()}
      />
    );
  }
  if (!membership && businesses.length) {
    const employeeOnly = businesses.every((business) => business.role === 'employee');
    if (employeeOnly) {
      if (stores.length) return <Redirect href="/choose-store" />;
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
  if (membership.role === 'super_admin') {
    return <ErrorState title="Portail Super Admin séparé" message="Le Super Administrateur ne peut pas utiliser l’application principale. Connectez-vous depuis le portail web Super Administration." retryLabel="Se déconnecter" onRetry={() => void signOut()} />;
  }
  if(membership.role==='company_admin'&&billingOnboarding.isLoading)return <LoadingScreen label="Préparation de votre abonnement…"/>;
  if(membership.role==='company_admin'&&billingOnboarding.error)return <ErrorState title="Vérification de l’abonnement interrompue" message={readableError(billingOnboarding.error)} onRetry={()=>void billingOnboarding.refetch()} onCancel={()=>void signOut()}/>;
  if(membership.role==='company_admin'&&billingOnboarding.data)return <Redirect href="/(subscription)/welcome"/>;
  if (['pending', 'expired', 'canceled', 'cancelled', 'suspended'].includes(membership.subscriptionStatus ?? '')) {
    return <Redirect href="/(subscription)" />;
  }
  if (membership.role === 'company_admin') return <Redirect href="/(admin)" />;
  return <Redirect href={'/employee' as never} />;
}
