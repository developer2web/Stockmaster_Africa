import { PropsWithChildren, ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Icon, Menu, Text, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { AppButton } from './AppButton';
import { AppBackButton } from './AppBackButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasAnyPermission } from '@/features/auth/permissions';

export function AdminPage({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  const theme = useTheme();
  const { session, membership, stores, selectStore } = useAuth();
  const employeeName = String(session?.user.user_metadata?.full_name ?? session?.user.email ?? 'Employé');
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
        <AppBackButton fallback={employee ? '/employee' : '/(admin)'} light={employee} />
        <Appbar.Content
          style={styles.headerContent}
          title={title}
          titleStyle={[compact && styles.compactTitle, employee && styles.employeeTitle]}
          subtitle={
            employee
              ? `${employeeName} • ${membership?.storeName ?? 'Boutique'}`
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
      {employee && compact && <EmployeeBottomNavigation />}
    </KeyboardAvoidingView>
  );
}

function EmployeeBottomNavigation() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { membership } = useAuth();
  const links = [
    { label: 'Accueil', icon: 'home-outline', path: '/employee', visible: true },
    { label: 'Vente', icon: 'cart-plus', path: '/employee/sales/new', visible: hasAnyPermission(membership, ['sales.write']) },
    { label: 'Produits', icon: 'package-variant-closed', path: '/employee/products', visible: hasAnyPermission(membership, ['products.read', 'products.write']) },
    { label: 'Caisse', icon: 'wallet-outline', path: '/employee/cash', visible: hasAnyPermission(membership, ['cash_transactions.read', 'cash_transactions.write', 'expenses.read']) },
  ].filter((link) => link.visible);
  return <View style={[styles.employeeBottom, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant, paddingBottom: Math.max(insets.bottom, 6) }]}>{links.map(({ label, icon, path }) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(path as never)} style={({ pressed }) => [styles.employeeBottomItem, pressed && styles.employeeBottomPressed]}><Icon source={icon} size={22} color={theme.colors.primary} /><Text variant="labelSmall" numberOfLines={1}>{label}</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerContent: { flex: 1, minWidth: 0 },
  page: { padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: 1180, alignSelf: 'center' },
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
  employeeBottom: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 5, paddingHorizontal: 4 },
  employeeBottomItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 12 },
  employeeBottomPressed: { opacity: 0.65 },
});
