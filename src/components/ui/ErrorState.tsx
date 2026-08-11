import { StyleSheet, View } from 'react-native';
import { Card, Icon, Text } from 'react-native-paper';
import { AppButton } from './AppButton';

export function ErrorState({
  title = 'Une erreur est survenue',
  message,
  retryLabel = 'Réessayer',
  onRetry,
  onCancel,
}: {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  return (
    <View style={styles.page} accessibilityRole="alert">
      <Card mode="outlined" style={styles.card}>
        <Card.Content style={styles.content}>
          <View style={styles.icon}><Icon source="alert-circle-outline" size={36} color="#C92A2A" /></View>
          <Text variant="titleLarge">{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {onRetry && <AppButton icon="refresh" onPress={onRetry}>{retryLabel}</AppButton>}
          {onCancel && <AppButton mode="text" onPress={onCancel}>Se déconnecter</AppButton>}
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 480 },
  content: { alignItems: 'center', gap: 14, paddingVertical: 12 },
  icon: { width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(201,42,42,0.10)', alignItems: 'center', justifyContent: 'center' },
  message: { textAlign: 'center' },
});
