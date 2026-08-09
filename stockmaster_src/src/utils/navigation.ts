import { router } from 'expo-router';

export function safeBack(fallback: string) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback as never);
}
