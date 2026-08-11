import { Pressable, StyleSheet } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';
import { safeBack } from '@/utils/navigation';

export function AppBackButton({ fallback, light = false }: { fallback: string; light?: boolean }) {
  const theme = useTheme();
  const color = light ? '#FFFFFF' : theme.colors.onSurface;
  return <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={10} onPress={() => safeBack(fallback)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
    <Icon source="arrow-left" size={30} color={color} />
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  pressed: { opacity: 0.55, transform: [{ scale: 0.96 }] },
});
