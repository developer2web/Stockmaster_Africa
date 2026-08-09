import 'react-native-url-polyfill/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { darkTheme, lightTheme } from '@/constants/theme';
import { CurrencyProvider } from '@/features/currency/CurrencyProvider';
import { SubscriptionProvider } from '@/features/subscriptions/SubscriptionProvider';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 400, fade: true });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootNavigator() {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) SplashScreen.hide();
  }, [isLoading]);

  if (isLoading) return <LoadingScreen label="Ouverture de StockMaster…" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="choose-business" />
      <Stack.Screen name="choose-store" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="employee" />
      <Stack.Screen name="(super-admin)" />
      <Stack.Screen name="(subscription)" />
      <Stack.Screen name="(settings)" />
      <Stack.Screen name="legal" />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const paperTheme = useMemo(() =>
    scheme === 'dark'
      ? { ...MD3DarkTheme, roundness: 5, colors: { ...MD3DarkTheme.colors, ...darkTheme.colors } }
      : { ...MD3LightTheme, roundness: 5, colors: { ...MD3LightTheme.colors, ...lightTheme.colors } },
    [scheme],
  );

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme}>
          <AuthProvider><SubscriptionProvider><CurrencyProvider><RootNavigator /></CurrencyProvider></SubscriptionProvider></AuthProvider>
        </PaperProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
