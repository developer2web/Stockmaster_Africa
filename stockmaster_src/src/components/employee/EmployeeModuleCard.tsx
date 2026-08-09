import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Card, Icon, Text, useTheme } from 'react-native-paper';

type Props = {
  title: string;
  description: string;
  icon: string;
  accent: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function EmployeeModuleCard({ title, description, icon, accent, onPress, style, compact = false }: Props) {
  const theme = useTheme();
  return (
    <Card
      mode="contained"
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.dark ? '#17132E' : '#FFFFFF', borderColor: `${accent}55` }, style]}
      accessible
      accessibilityLabel={`${title}. ${description}`}
    >
      <Card.Content style={[styles.content, compact && styles.compactContent]}>
        <View style={[styles.icon, compact && styles.compactIcon, { backgroundColor: `${accent}1F` }]}>
          <Icon source={icon} size={compact ? 24 : 28} color={accent} />
        </View>
        <View style={styles.copy}>
          <Text variant="titleMedium" style={styles.title}>{title}</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{description}</Text>
        </View>
        <Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, overflow: 'hidden', borderWidth: 1.5, borderLeftWidth: 6 },
  content: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18 },
  icon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 4 },
  title: { fontWeight: '700' },
  compactContent: { minHeight: 86, paddingVertical: 12, gap: 10 },
  compactIcon: { width: 44, height: 44, borderRadius: 15 },
});
