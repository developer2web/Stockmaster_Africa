import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Icon, Text, useTheme } from 'react-native-paper';

// Style « liste divisée » façon Uber Driver (Menu / Paramètres) : une carte par
// section, des lignes icône + libellé + chevron séparées par un simple trait,
// plutôt que la grille de cartes indépendantes utilisée auparavant.
export function ListSection({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text variant="labelLarge" style={[styles.title, { color: theme.colors.onSurfaceVariant }]}>{title.toUpperCase()}</Text>
        {!!subtitle && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{subtitle}</Text>}
      </View>
      <Card mode="outlined" style={styles.card}>
        <Card.Content style={styles.content}>{children}</Card.Content>
      </Card>
    </View>
  );
}

export function ListRow({ icon, title, subtitle, onPress, last = false, danger = false }: { icon: string; title: string; subtitle?: string; onPress: () => void; last?: boolean; danger?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && { borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }, pressed && styles.pressed]}
    >
      <View style={[styles.icon, { backgroundColor: danger ? theme.colors.errorContainer : theme.colors.primaryContainer }]}>
        <Icon source={icon} size={20} color={danger ? theme.colors.error : theme.colors.primary} />
      </View>
      <View style={styles.grow}>
        <Text variant="titleSmall" style={[styles.bold, danger && { color: theme.colors.error }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text variant="bodySmall" numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant }}>{subtitle}</Text>}
      </View>
      <Icon source="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  header: { gap: 2 },
  title: { fontWeight: '800', letterSpacing: 0.6 },
  card: { borderRadius: 16, overflow: 'hidden' },
  content: { padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 44 },
  pressed: { opacity: 0.65 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '700' },
});
