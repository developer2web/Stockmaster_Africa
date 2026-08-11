import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';
import { useAuth } from '@/features/auth/AuthProvider';

export function ProductThumbnail({ url, size = 52 }: { url?: string | null; size?: number }) {
  const { session } = useAuth();
  const theme = useTheme();
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.25) };
  if (!url) return <View style={[styles.placeholder, style, { backgroundColor: theme.colors.surfaceVariant }]}><Icon source="image-outline" size={size * 0.45} color={theme.colors.onSurfaceVariant} /></View>;
  return <Image source={{ uri: url, headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined }} style={style} contentFit="cover" transition={180} cachePolicy="memory-disk" />;
}

const styles = StyleSheet.create({ placeholder: { alignItems: 'center', justifyContent: 'center' } });
