import { ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export function PageIntro({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  const theme = useTheme();
  const [availableWidth, setAvailableWidth] = useState(0);
  const compact = availableWidth < 620;
  return <View onLayout={event => setAvailableWidth(event.nativeEvent.layout.width)} style={[styles.row, compact && styles.compactRow]}>
    <View style={[styles.copy, compact && styles.compactCopy]}>
      <Text variant="headlineSmall" style={[styles.title, compact && styles.compactTitle]}>{title}</Text>
      {!!description && <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>{description}</Text>}
    </View>
    {!!action && <View style={[styles.action, compact && styles.compactAction]}>{action}</View>}
  </View>;
}
const styles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  compactRow: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  copy: { flexGrow: 1, flexBasis: 240, minWidth: 0, gap: 3 },
  compactCopy: { flexBasis: 'auto' },
  title: { fontWeight: '900' },
  compactTitle: { fontSize: 23, lineHeight: 29 },
  description: { fontSize: 14, lineHeight: 20 },
  action: { flexShrink: 1, minWidth: 0, maxWidth: '100%' },
  compactAction: { width: '100%', alignItems: 'stretch' },
});
