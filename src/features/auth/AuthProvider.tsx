import type { Session } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { supabase } from '@/services/supabase/client';
import { createRealtimeTopic } from '@/services/supabase/realtime';
import { getAccessibleBusinesses, getAccessibleStores, getWorkspaceContext } from '@/features/workspace/api';
import { useWorkspaceStore } from '@/stores/workspace';
import type { BusinessAccess, MembershipContext, StoreAccess } from '@/types/database';
import { logger } from '@/services/observability/logger';

type AuthValue = {
  session: Session | null;
  membership: MembershipContext | null;
  businesses: BusinessAccess[];
  stores: StoreAccess[];
  membershipError: string | null;
  isAccessBlocked: boolean;
  needsOnboarding: boolean;
  isLoading: boolean;
  isWorkspaceLoading: boolean;
  isSwitchingWorkspace: boolean;
  refreshMembership: () => Promise<void>;
  selectBusiness: (companyId: string) => Promise<void>;
  selectStore: (storeId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<MembershipContext | null>(null);
  const [businesses, setBusinesses] = useState<BusinessAccess[]>([]);
  const [stores, setStores] = useState<StoreAccess[]>([]);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [isAccessBlocked, setAccessBlocked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [isWorkspaceLoading, setWorkspaceLoading] = useState(true);
  const [isSwitchingWorkspace, setSwitchingWorkspace] = useState(false);
  const refreshSequence = useRef(0);
  const selectedCompanyId = useWorkspaceStore((state) => state.companyId);
  const selectedStoreId = useWorkspaceStore((state) => state.storeId);
  const setSelectedBusiness = useWorkspaceStore((state) => state.selectBusiness);
  const setSelectedStore = useWorkspaceStore((state) => state.selectStore);
  const clearWorkspace = useWorkspaceStore((state) => state.clear);

  const refreshMembership = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setWorkspaceLoading(true);
    setMembershipError(null);
    setNeedsOnboarding(false);
    try {
      const { data, error } = await supabase.rpc('get_my_context');
      if (sequence !== refreshSequence.current) return;
      if (error) {
        setAccessBlocked(false);
        setMembershipError('Impossible de charger votre entreprise. Vérifiez votre connexion internet puis réessayez.');
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.role === 'super_admin') {
        setAccessBlocked(false);
        setMembership({
          membershipId: row.membership_id,
          companyId: row.company_id,
          companyName: row.company_name,
          storeId: row.store_id,
          role: row.role,
          roleName: row.role_name ?? row.role,
          permissions: row.permissions ?? [],
          subscriptionStatus: row.subscription_status,
          countryCode: row.country_code ?? 'CA',
          countryName: row.country_name ?? 'Canada',
          defaultCurrencyCode: row.default_currency_code ?? 'CAD',
          secondaryCurrencyCode: row.secondary_currency_code ?? null,
          currencyLockedAt: row.currency_locked_at ?? null,
        });
        setBusinesses([]);
        setStores([]);
        return;
      }

      const availableBusinesses = await getAccessibleBusinesses();
      if (sequence !== refreshSequence.current) return;
      setBusinesses(availableBusinesses);
      if (!availableBusinesses.length) {
        setMembership(null);
        setStores([]);
        if (selectedCompanyId) clearWorkspace();
        const { data: accessStatus, error: statusError } = await supabase.rpc('get_account_access_status');
        if (sequence !== refreshSequence.current) return;
        if (statusError) {
          setMembershipError('Impossible de vérifier votre entreprise. Réessayez dans quelques instants.');
        } else if (accessStatus === 'no_membership') {
          setNeedsOnboarding(true);
        } else if (accessStatus === 'membership_disabled') {
          setAccessBlocked(true);
          setMembershipError('Votre accès a été désactivé par un administrateur.');
        } else if (accessStatus === 'company_disabled') {
          setAccessBlocked(true);
          setMembershipError('Cette entreprise a été désactivée par le Super Administrateur.');
        } else {
          setMembershipError('Votre entreprise existe, mais ses accès ne sont pas encore disponibles. Réessayez.');
        }
        return;
      }
      const business = availableBusinesses.find((item) => item.companyId === selectedCompanyId);
      if (!business) {
        const assignedBusiness = availableBusinesses.length === 1 ? availableBusinesses[0] : null;
        if (assignedBusiness) {
          setSelectedBusiness(assignedBusiness.companyId);
          const assignedStores = await getAccessibleStores(assignedBusiness.companyId);
          if (sequence !== refreshSequence.current) return;
          setStores(assignedStores);
          if (assignedStores.length === 1) {
            setSelectedStore(assignedStores[0].storeId);
            const assignedContext = await getWorkspaceContext(
              assignedBusiness.companyId,
              assignedStores[0].storeId,
            );
            if (sequence !== refreshSequence.current) return;
            setMembership(assignedContext);
          } else {
            setMembership(null);
          }
          return;
        }
        setMembership(null);
        setStores([]);
        if (selectedCompanyId) clearWorkspace();
        return;
      }
      const availableStores = await getAccessibleStores(business.companyId);
      if (sequence !== refreshSequence.current) return;
      setStores(availableStores);
      const store = availableStores.find((item) => item.storeId === selectedStoreId);
      if (!store) {
        setMembership(null);
        if (selectedStoreId) setSelectedStore(null);
        return;
      }
      const context = await getWorkspaceContext(business.companyId, store.storeId);
      if (sequence !== refreshSequence.current) return;
      if (context) {
        setAccessBlocked(false);
        setMembership(context);
        return;
      }

      setMembership(null);
      const { data: accessStatus, error: statusError } = await supabase.rpc('get_account_access_status');
      if (sequence !== refreshSequence.current) return;
      if (statusError) {
        setAccessBlocked(false);
        setMembershipError('Impossible de vérifier votre autorisation. Réessayez dans quelques instants.');
      } else if (accessStatus === 'membership_disabled') {
        setAccessBlocked(true);
        setMembershipError('Votre accès employé a été désactivé par un administrateur. Vous ne pouvez plus utiliser cet espace.');
      } else if (accessStatus === 'company_disabled') {
        setAccessBlocked(true);
        setMembershipError('Cette entreprise a été désactivée par le Super Administrateur. Tous ses accès sont suspendus.');
      } else if (accessStatus === 'access_disabled') {
        setAccessBlocked(true);
        setMembershipError('Votre accès à StockMaster est actuellement suspendu.');
      } else {
        setAccessBlocked(false);
      }
    } catch {
      if (sequence === refreshSequence.current) {
        setMembershipError('Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.');
      }
    } finally {
      if (sequence === refreshSequence.current) setWorkspaceLoading(false);
    }
  }, [clearWorkspace, selectedCompanyId, selectedStoreId, setSelectedBusiness, setSelectedStore]);

  const selectBusiness = useCallback(async (companyId: string) => {
    setWorkspaceLoading(true);
    setSelectedBusiness(companyId);
    setMembership(null);
    try {
      const availableStores = await getAccessibleStores(companyId);
      setStores(availableStores);
      if (availableStores.length === 1) setSelectedStore(availableStores[0].storeId);
    } finally {
      setWorkspaceLoading(false);
    }
  }, [setSelectedBusiness, setSelectedStore]);

  const selectStore = useCallback(async (storeId: string) => {
    if (!selectedCompanyId) return;
    if (storeId === selectedStoreId && membership?.storeId === storeId) return;
    setSwitchingWorkspace(true);
    setMembership(null);
    try {
      const context = await getWorkspaceContext(selectedCompanyId, storeId);
      if (!context) throw new Error('Boutique inaccessible');
      setSelectedStore(storeId);
      setMembership(context);
    } finally {
      setSwitchingWorkspace(false);
    }
  }, [membership?.storeId, selectedCompanyId, selectedStoreId, setSelectedStore]);

  const handleAuthUrl = async (url: string | null) => {
    if (!url || Platform.OS === 'web') return;
    try {
      const parsed = new URL(url);
      const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      const query = parsed.searchParams;
      const code = query.get('code');
      const accessToken = fragment.get('access_token') ?? query.get('access_token');
      const refreshToken = fragment.get('refresh_token') ?? query.get('refresh_token');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
      }
    } catch (error) {
      setMembershipError('Le lien de connexion ou de récupération est invalide ou a expiré.');
      void logger.warning('auth_callback_failed', error, { urlScheme: url.split(':')[0] });
    }
  };

  useEffect(() => {
    void Linking.getInitialURL().then(handleAuthUrl);
    const linkSubscription = Linking.addEventListener('url', ({ url }) => { void handleAuthUrl(url); });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void supabase.auth.getSession().then(({ data }) => {
          if (data.session) void refreshMembership();
        });
      }
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { error: userError } = await supabase.auth.getUser();
        if (userError && [401, 403].includes(userError.status ?? 0)) {
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setMembership(null);
          setMembershipError(null);
          setAccessBlocked(false);
          setNeedsOnboarding(false);
        } else if (userError) {
          setSession(data.session);
          setMembershipError('La session existe, mais le serveur est momentanément indisponible.');
        } else {
          setSession(data.session);
          await refreshMembership();
        }
      } else {
        setSession(null);
      }
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION') return;
      setSession(next);
      if (!next) {
        setMembership(null);
        setBusinesses([]);
        setStores([]);
        setMembershipError(null);
        setAccessBlocked(false);
        setNeedsOnboarding(false);
        setLoading(false);
      } else {
        if (event === 'SIGNED_IN') {
          setMembership(null);
          setLoading(true);
        }
        setTimeout(async () => {
          await refreshMembership();
          if (event === 'SIGNED_IN') setLoading(false);
        }, 0);
      }
      if (event === 'PASSWORD_RECOVERY') setTimeout(() => router.replace('/reset-password'), 0);
    });

    const accessCheck = setInterval(() => {
      void supabase.auth.getSession().then(({ data: current }) => {
        if (current.session) void refreshMembership();
      });
    }, 60_000);

    return () => {
      clearInterval(accessCheck);
      data.subscription.unsubscribe();
      linkSubscription.remove();
      appStateSubscription.remove();
    };
  }, [refreshMembership]);

  useEffect(() => {
    if (!session?.user.id) return;
    const channel = supabase.channel(createRealtimeTopic(`access-membership-${session.user.id}`))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'memberships',
        filter: `user_id=eq.${session.user.id}`,
      }, () => { void refreshMembership(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user.id, refreshMembership]);

  useEffect(() => {
    if (!session?.user.id || !membership?.companyId || membership.role === 'super_admin') return;
    const channel = supabase.channel(createRealtimeTopic(`access-company-${membership.companyId}`))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'companies',
        filter: `id=eq.${membership.companyId}`,
      }, () => { void refreshMembership(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user.id, membership?.companyId, membership?.role, refreshMembership]);

  const value = useMemo(() => ({
    session,
    membership,
    businesses,
    stores,
    membershipError,
    isAccessBlocked,
    needsOnboarding,
    isLoading,
    isWorkspaceLoading,
    isSwitchingWorkspace,
    refreshMembership,
    selectBusiness,
    selectStore,
    signOut: async () => {
      setLoading(true);
      try {
        await supabase.auth.signOut();
      } finally {
        setSession(null);
        setMembership(null);
        setBusinesses([]);
        setStores([]);
        clearWorkspace();
        setMembershipError(null);
        setAccessBlocked(false);
        setNeedsOnboarding(false);
        setLoading(false);
        router.replace('/(auth)/login');
      }
    },
  }), [session, membership, businesses, stores, membershipError, isAccessBlocked, needsOnboarding, isLoading, isWorkspaceLoading, isSwitchingWorkspace, refreshMembership, selectBusiness, selectStore, clearWorkspace]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return value;
}
