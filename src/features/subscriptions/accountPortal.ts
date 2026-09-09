import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { siteUrl } from '@/constants/siteLinks';
import { supabase } from '@/services/supabase/client';

function accountPortalBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_ACCOUNT_WEB_URL?.trim();
  if (configured) return configured;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return siteUrl('account', undefined, window.location);
  }
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  return siteUrl('account', undefined, host ? { hostname: host, protocol: 'http:' } : undefined);
}

async function edgeMessage(error: unknown) {
  const response = (error as { context?: Response } | null)?.context;
  if (response) {
    try {
      const payload = await response.clone().json() as { error?: string };
      if (payload.error) return payload.error;
    } catch { /* Le message générique ci-dessous reste utilisable. */ }
  }
  return error instanceof Error ? error.message : 'Impossible d’ouvrir le portail Account.';
}

export async function openAccountPortal(companyId: string) {
  if (!companyId) throw new Error('Entreprise indisponible.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Votre session a expiré. Reconnectez-vous.');
  const result = await supabase.functions.invoke('account-portal-link', {
    body: { companyId, portalUrl: accountPortalBaseUrl() },
  });
  if (result.error) throw new Error(await edgeMessage(result.error));
  const url = typeof result.data?.url === 'string' ? result.data.url : '';
  if (!url) throw new Error('Lien Account indisponible.');
  if (new URL(url).origin !== new URL(accountPortalBaseUrl()).origin) throw new Error('Le lien reçu ne correspond pas au portail propriétaire configuré. Vérifiez les adresses des portails.');
  if (Platform.OS === 'web') await Linking.openURL(url);
  else await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
}
