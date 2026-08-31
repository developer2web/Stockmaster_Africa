import { PropsWithChildren, ReactNode, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Icon, Menu, Text, useTheme } from 'react-native-paper';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { AppButton } from './AppButton';
import { AppBackButton } from './AppBackButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasAnyPermission } from '@/features/auth/permissions';
import { PageIntro } from './PageIntro';
import { design } from '@/constants/design';
import { openAccountPortal } from '@/features/subscriptions/accountPortal';

const descriptions:Record<string,string>={
  Produits:'Consultez, recherchez et gérez le catalogue de la boutique.',Stock:'Suivez les quantités disponibles dans la boutique sélectionnée.',Ventes:'Consultez les ventes et ouvrez leur détail.','Nouvelle vente':'Ajoutez les produits, choisissez le client puis encaissez.',Clients:'Gérez les clients, leurs achats et leurs crédits.',Caisse:'Suivez le solde, les mouvements et les clôtures.',Rapports:'Analysez les ventes, les dépenses et la performance.',Fournisseurs:'Gérez les fournisseurs, achats, dettes et règlements.',Employés:'Gérez les comptes, rôles et accès aux boutiques.',Boutiques:'Gérez les points de vente de l’entreprise.',Support:'Créez et suivez les demandes d’assistance.',Notifications:'Consultez les informations qui nécessitent votre attention.',
};

export function AdminPage({ title, description, action, backToHome = false, children }: PropsWithChildren<{ title: string; description?: string; action?: ReactNode; backToHome?: boolean }>) {
  const theme = useTheme();
  const { session, membership, stores, selectStore } = useAuth();
  const employeeName = String(session?.user.user_metadata?.full_name ?? session?.user.email ?? 'Employé');
  const { subscription } = useSubscription();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 600;
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [openingAccount, setOpeningAccount] = useState(false);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const employee = membership?.role === 'employee';
  const toolsFallback = employee ? '/employee/more' : '/more';
  const cameFromTools = returnTo === toolsFallback;
  const employeeHeader = '#084B50';
  const pageBackground = theme.colors.background;
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
        <AppBackButton
          fallback={cameFromTools ? toolsFallback : employee ? '/employee' : '/(admin)'}
          light={employee}
          forceFallback={backToHome || cameFromTools}
        />
        <Appbar.Content
          style={styles.headerContent}
          title={membership?.companyName ?? 'StockMaster'}
          titleStyle={[compact && styles.compactTitle, employee && styles.employeeTitle]}
          subtitle={
            employee
              ? `${employeeName} — Employé · ${membership?.storeName ?? 'Boutique'}`
              : `${employeeName} — Administrateur · ${membership?.storeName ?? 'Boutique non sélectionnée'}`
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
      </Appbar.Header>
      <ScrollView
        nestedScrollEnabled
        contentContainerStyle={[styles.page, employee && styles.employeePage, compact && styles.compactPage, employee && compact && { paddingBottom: 92 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <PageIntro title={title} description={description??descriptions[title]??'Gérez cette partie de StockMaster.'} action={action}/>
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
                <AppButton loading={openingAccount} disabled={openingAccount} onPress={() => { setOpeningAccount(true); void openAccountPortal(membership?.companyId ?? '').catch((error) => Alert.alert('Portail Account', error.message)).finally(() => setOpeningAccount(false)); }}>
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
  const pathname = usePathname();
  const { membership } = useAuth();
  const links = [
    { label: 'Accueil', icon: 'home-outline', path: '/employee', visible: true },
    { label: 'Vente', icon: 'cart-plus', path: '/employee/sales/new', visible: hasAnyPermission(membership, ['sales.write']) },
    { label: 'Produits', icon: 'package-variant-closed', path: '/employee/products', visible: hasAnyPermission(membership, ['products.read', 'products.write']) },
    { label: 'Caisse', icon: 'wallet-outline', path: '/employee/cash', visible: hasAnyPermission(membership, ['cash.open', 'cash.reopen', 'cash_transactions.read', 'cash_transactions.write', 'expenses.read']) },
    { label: 'Plus', icon: 'dots-grid', path: '/employee/more', visible: true },
  ].filter((link) => link.visible);
  return <View style={[styles.employeeBottom, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant, paddingBottom: Math.max(insets.bottom, 6) }]}>{links.map(({ label, icon, path }) => {const active=path==='/employee'?pathname==='/employee':pathname.startsWith(path);return <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:active}} onPress={() => router.navigate(path as never)} style={({ pressed }) => [styles.employeeBottomItem,active&&{backgroundColor:theme.colors.primaryContainer}, pressed && styles.employeeBottomPressed]}><Icon source={icon} size={22} color={active?theme.colors.onPrimaryContainer:theme.colors.primary} /><Text variant="labelSmall" numberOfLines={1} style={active&&{color:theme.colors.onPrimaryContainer,fontWeight:'800'}}>{label}</Text></Pressable>})}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerContent: { flex: 1, minWidth: 0 },
  page: { padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: design.contentMaxWidth, alignSelf: 'center' },
  compactPage: { padding: 12, paddingBottom: 28, gap: 12 },
  compactTitle: { fontSize: 18 },
  employeeTitle: { color: '#FFFFFF', fontWeight: '800' },
  employeeSubtitle: { color: '#D7EFF0', fontWeight: '700' },
  storeSubtitle: { fontWeight: '700' },
  employeePage: { maxWidth: 1100 },
  subscriptionWarning: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 220 },
  employeeBottom: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 5, paddingHorizontal: 4 },
  employeeBottomItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 12 },
  employeeBottomPressed: { opacity: 0.65 },
});
