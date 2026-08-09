import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Text, useTheme } from 'react-native-paper';
import { safeBack } from '@/utils/navigation';

export function LegalPage({ title, updatedAt, children }: PropsWithChildren<{ title: string; updatedAt: string }>) {
  const theme = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => safeBack('/(auth)/login')} />
        <Appbar.Content title={title} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>Dernière mise à jour : {updatedAt}</Text>
        {children}
      </ScrollView>
    </View>
  );
}

export const legalStyles = StyleSheet.create({
  heading: { fontWeight: '800', marginTop: 12 },
  paragraph: { lineHeight: 23 },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 12 },
});
