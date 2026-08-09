import { PropsWithChildren, ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Menu, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { AppButton } from './AppButton';
import { safeBack } from '@/utils/navigation';

export function AdminPage({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  const theme = useTheme();
  const { membership, stores, selectStore } = useAuth();
  const { subscription } = useSubscription();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const employee = membership?.role === 'employee';
  const employeeHeader = theme.dark ? '#201A4D' : '#352B78';
  const pageBackground = employee
    ? (theme.dark ? '#0E0B20' : '#F5F3FF')
    : theme.colors.background;
  const remainingDays = subscription?.expiresAt
    ? Math.ceil((new Date(subscription.expiresAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const showRenewalWarning =
    subscription?.status === 'past_due' ||
    (remainingDays !== null && remainingDays >= 0 && remainingDays <= 7);
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: pageBackground }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Appbar.Header elevated style={{ backgroundColor: employee ? employeeHeader : theme.colors.surface }}>
        <Appbar.BackAction
          color={employee ? '#FFFFFF' : undefined}
          accessibilityLabel="Revenir à l’écran précédent"
          onPress={() => safeBack(employee ? '/employee' : '/(admin)')}
        />
        <Appbar.Content
          style={styles.headerContent}
          title={title}
          titleStyle={[compact && styles.compactTitle, employee && styles.employeeTitle]}
          subtitle={
            employee
              ? `ESPACE EMPLOYÉ • ${membership?.storeName ?? 'Boutique'}`
              : `Boutique active : ${membership?.storeName ?? 'Non sélectionnée'}`
          }
          subtitleStyle={employee ? styles.employeeSubtitle : styles.storeSubtitle}
        />
        {membership?.role !== 'super_admin' && stores.length > 1 && (
          <Menu
            visible={storeMenuOpen}
            onDismiss={() => setStoreMenuOpen(false)}
            anchor={
              <Appbar.Action
                icon="store-cog-outline"
                color={employee ? '#FFFFFF' : undefined}
                accessibilityLabel="Changer de boutique"
                onPress={() => setStoreMenuOpen(true)}
              />
            }
          >
            {stores.map((store) => (
              <Menu.Item
                key={store.storeId}
                title={store.storeName}
                leadingIcon={store.storeId === membership?.storeId ? 'check-circle' : 'store-outline'}
                onPress={() => {
                  setStoreMenuOpen(false);
                  void selectStore(store.storeId);
                }}
              />
            ))}
          </Menu>
        )}
        {action}
      </Appbar.Header>
      {employee && (
        <View style={styles.employeeRibbon}>
          <View style={styles.employeeRibbonDot} />
          <Text variant="labelMedium" style={styles.employeeRibbonText}>
            {membership?.companyName} • {membership?.storeName ?? 'Boutique'}
          </Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={[styles.page, employee && styles.employeePage, compact && styles.compactPage]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        {showRenewalWarning && (
          <Card mode="contained" style={{ backgroundColor: theme.colors.errorContainer }}>
            <Card.Content style={styles.subscriptionWarning}>
              <View style={styles.grow}>
                <Text variant="titleMedium">Abonnement à renouveler</Text>
                <Text>
                  {subscription?.status === 'past_due'
                    ? 'La période de grâce est en cours. Vos données restent conservées.'
                    : `Votre forfait expire dans ${remainingDays} jour(s).`}
                </Text>
              </View>
              {membership?.role === 'company_admin' && (
                <AppButton onPress={() => router.push('/(subscription)' as never)}>
                  Renouveler
                </AppButton>
              )}
            </Card.Content>
          </Card>
        )}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerContent: { flex: 1, minWidth: 0 },
  page: { padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: 900, alignSelf: 'center' },
  compactPage: { padding: 12, paddingBottom: 28, gap: 12 },
  compactTitle: { fontSize: 18 },
  employeeTitle: { color: '#FFFFFF', fontWeight: '800' },
  employeeSubtitle: { color: '#D9D4FF', fontWeight: '700', letterSpacing: 1.2 },
  storeSubtitle: { fontWeight: '700' },
  employeeRibbon: { minHeight: 38, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6C5CE7' },
  employeeRibbonDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFD166' },
  employeeRibbonText: { color: '#FFFFFF', fontWeight: '700' },
  employeePage: { maxWidth: 980 },
  subscriptionWarning: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 220 },
});
