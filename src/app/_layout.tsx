import 'react-native-url-polyfill/auto';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { darkTheme, lightTheme } from '@/constants/theme';
import { CurrencyProvider } from '@/features/currency/CurrencyProvider';
import { SubscriptionProvider } from '@/features/subscriptions/SubscriptionProvider';
import { OfflineProvider } from '@/features/offline/OfflineProvider';
import { OfflineStatus } from '@/features/offline/OfflineStatus';
import { logger } from '@/services/observability/logger';
import { sanitizeErrorInPlace } from '@/utils/errors';
import { usePortalLoginState } from '@/features/auth/portalLoginState';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync();
  SplashScreen.setOptions({ duration: 400, fade: true });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      void logger.error('query_failed', error, { queryKey: query.queryKey });
      sanitizeErrorInPlace(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      void logger.error('mutation_failed', error, { mutationKey: mutation.options.mutationKey });
      sanitizeErrorInPlace(error, 'Impossible de terminer cette action. Réessayez.');
    },
  }),
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootNavigator() {
  const { isLoading, membership, offlineAuthenticated, mfaRequired, session } = useAuth();
  const requestedPortal = usePortalLoginState(state => state.requestedPortal);
  const portalLoginPending = usePortalLoginState(state => state.pending);
  const pathname = usePathname().replace(/\/+$/, '') || '/';

  useEffect(() => {
    if (typeof document !== 'undefined') document.getElementById('web-boot-status')?.remove();
    if (!isLoading && Platform.OS !== 'web') void SplashScreen.hideAsync();
  }, [isLoading]);

  // Keep login forms mounted while SIGNED_IN is being checked, so a rejected
  // portal can display its message instead of losing local form state.
  const loginRoute = ['/login', '/employee', '/mfa', '/change-temporary-password'].includes(pathname);
  if (isLoading && !(loginRoute && portalLoginPending)) return <LoadingScreen label="Ouverture de StockMaster…" />;

  if (!portalLoginPending && !offlineAuthenticated && session && mfaRequired && pathname !== '/mfa') return <Redirect href={{ pathname: '/(auth)/mfa', params: requestedPortal ? { portal: requestedPortal } : {} }} />;
  if (!portalLoginPending && !offlineAuthenticated && session?.user.app_metadata?.must_change_password === true && pathname !== '/change-temporary-password' && pathname !== '/mfa') return <Redirect href="/(auth)/change-temporary-password" />;

  if (offlineAuthenticated) {
    const employee = membership?.role === 'employee';
    const salePath = employee ? '/employee/sales/new' : '/sales/new';
    const scannerPath = employee ? '/employee/scanner' : '/scanner';
    if (pathname !== salePath && pathname !== scannerPath) return <Redirect href={salePath as never} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineStatus />
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="choose-business" />
      <Stack.Screen name="choose-store" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="employee" />
      <Stack.Screen name="(subscription)" />
      <Stack.Screen name="(settings)" />
      <Stack.Screen name="legal" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const paperTheme = useMemo(() =>
    scheme === 'dark'
      ? { ...MD3DarkTheme, roundness: 3, colors: { ...MD3DarkTheme.colors, ...darkTheme.colors } }
      : { ...MD3LightTheme, roundness: 3, colors: { ...MD3LightTheme.colors, ...lightTheme.colors } },
    [scheme],
  );

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme}>
          <AuthProvider><OfflineProvider><SubscriptionProvider><CurrencyProvider><RootNavigator /></CurrencyProvider></SubscriptionProvider></OfflineProvider></AuthProvider>
        </PaperProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
