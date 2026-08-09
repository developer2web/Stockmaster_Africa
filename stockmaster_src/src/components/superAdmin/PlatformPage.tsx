import { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, useTheme } from 'react-native-paper';
import { safeBack } from '@/utils/navigation';

export function PlatformPage({ title, back = true, action, children }: PropsWithChildren<{ title: string; back?: boolean; action?: ReactNode }>) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header elevated style={{ backgroundColor: theme.colors.surface }}>
        {back && <Appbar.BackAction onPress={() => safeBack('/(super-admin)')} />}
        <Appbar.Content title={title} subtitle="Administration StockMaster" />
        {action}
      </Appbar.Header>
      <ScrollView contentContainerStyle={[styles.page, compact && styles.compactPage]} showsVerticalScrollIndicator={false}>{children}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 20, paddingBottom: 44, gap: 18 },
  compactPage: { padding: 12, paddingBottom: 30, gap: 12 },
});
