import 'react-native-url-polyfill/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
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

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync();
  SplashScreen.setOptions({ duration: 400, fade: true });
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootNavigator() {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (typeof document !== 'undefined') document.getElementById('web-boot-status')?.remove();
    if (!isLoading && Platform.OS !== 'web') void SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return <LoadingScreen label="Ouverture de StockMaster…" />;

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
