import { isSubscriptionReadOnly } from '@/features/subscriptions/readOnlyAccess';
import { PropsWithChildren, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Icon, Text, useTheme } from 'react-native-paper';
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
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useFocusEffect } from '@react-navigation/native';

const scrollPositions = new Map<string, number>();

const descriptions:Record<string,string>={
  'Nouvelle vente':'Ajoutez les produits, choisissez le client puis encaissez.',
};

export function AdminPage({ title, description, action, floatingAction, backToHome = false, scrollResetKey, onContentWidthChange, children }: PropsWithChildren<{ title: string; description?: string; action?: ReactNode; floatingAction?: ReactNode; backToHome?: boolean; scrollResetKey?: string; onContentWidthChange?: (width: number) => void }>) {
  const theme = useTheme();
  const { session, membership, offlineAuthenticated, lockOfflineSession } = useAuth();
  const employeeName = String(session?.user.user_metadata?.full_name ?? session?.user.email ?? 'Employé');
  const { subscription } = useSubscription();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 600;
  const [openingAccount, setOpeningAccount] = useState(false);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const employee = membership?.role === 'employee';
  const pathname = usePathname();
  const scrollRef = useRef<ScrollView>(null);
  const restoredFor = useRef('');
  useEffect(() => {
    if (scrollResetKey !== undefined) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollResetKey]);
  useFocusEffect(useCallback(() => {
    restoredFor.current = '';
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: scrollPositions.get(pathname) ?? 0, animated: false }));
  }, [pathname]));
  const toolsFallback = employee ? '/employee/more' : '/more';
  const cameFromTools = returnTo === toolsFallback;
  const employeeHeader = '#084B50';
  const pageBackground = theme.colors.background;
  const remainingDays = subscription?.expiresAt
    ? Math.ceil((new Date(subscription.expiresAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const readOnly = isSubscriptionReadOnly(subscription);
  const showRenewalWarning = readOnly ||
    subscription?.status === 'past_due' ||
    (remainingDays !== null && remainingDays >= 0 && remainingDays <= 7);
  return (
    <KeyboardAvoidingView
      onLayout={event => onContentWidthChange?.(Math.max(0, Math.min(event.nativeEvent.layout.width, employee ? 1100 : design.contentMaxWidth) - (compact ? 24 : 40)))}
      style={[styles.flex, { backgroundColor: pageBackground }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Appbar.Header elevated style={{ backgroundColor: employee ? employeeHeader : theme.colors.surface }}>
        {!offlineAuthenticated && <AppBackButton
          fallback={cameFromTools ? toolsFallback : employee ? '/employee' : '/(admin)'}
          light={employee}
          forceFallback={backToHome || cameFromTools}
        />}
        <Appbar.Content
          style={styles.headerContent}
          title={membership?.storeName || membership?.companyName || 'StockMaster'}
          titleStyle={[compact && styles.compactTitle, employee && styles.employeeTitle]}
          subtitle={
            employee
              ? `${employeeName} — Employé`
              : membership?.companyName
          }
          subtitleStyle={employee ? styles.employeeSubtitle : styles.storeSubtitle}
        />
        {!offlineAuthenticated && <NotificationBell color={employee ? '#FFFFFF' : undefined} />}
        {offlineAuthenticated && <Appbar.Action icon="lock-outline" color={employee ? '#FFFFFF' : undefined} accessibilityLabel="Verrouiller l’accès hors ligne" onPress={lockOfflineSession} />}
      </Appbar.Header>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        nestedScrollEnabled
        contentContainerStyle={[styles.page, employee && styles.employeePage, compact && styles.compactPage]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={80}
        onScroll={(event) => scrollPositions.set(pathname, event.nativeEvent.contentOffset.y)}
        onContentSizeChange={() => {
          if (restoredFor.current === pathname) return;
          restoredFor.current = pathname;
          scrollRef.current?.scrollTo({ y: scrollPositions.get(pathname) ?? 0, animated: false });
        }}
      >
        <PageIntro title={title} description={description??descriptions[title]} action={action}/>
        {!offlineAuthenticated && showRenewalWarning && (
          <Card mode="contained" style={{ backgroundColor: theme.colors.errorContainer }}>
            <Card.Content style={styles.subscriptionWarning}>
              <View style={styles.grow}>
                <Text variant="titleMedium">Abonnement à renouveler</Text>
                <Text>
                  {readOnly
                    ? 'Lecture seule : consultez vos données. Renouvelez pour ajouter, modifier ou supprimer.'
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
      {!!floatingAction && <View style={[styles.actionFooter, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant, paddingBottom: employee && compact && !offlineAuthenticated ? 8 : Math.max(8, insets.bottom) }]}><View style={styles.footerContent}>{floatingAction}</View></View>}
      {employee && compact && !offlineAuthenticated && <EmployeeBottomNavigation />}
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
  flex: { flex: 1, minWidth: 0, minHeight: 0 },
  scroll: { flex: 1, minWidth: 0 },
  headerContent: { flex: 1, minWidth: 0 },
  page: { padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: design.contentMaxWidth, alignSelf: 'center' },
  compactPage: { padding: 12, paddingBottom: 28, gap: 12 },
  compactTitle: { fontSize: 18 },
  employeeTitle: { color: '#FFFFFF', fontWeight: '800' },
  employeeSubtitle: { color: '#D7EFF0', fontWeight: '700' },
  storeSubtitle: { fontWeight: '700' },
  employeePage: { maxWidth: 1100 },
  subscriptionWarning: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  grow: { flexGrow: 1, flexBasis: 220, minWidth: 0 },
  employeeBottom: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 5, paddingHorizontal: 4 },
  employeeBottomItem: { flex: 1, minWidth: 0, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 12 },
  employeeBottomPressed: { opacity: 0.65 },
  actionFooter: { flexShrink: 0, borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8 },
  footerContent: { width: '100%', maxWidth: design.contentMaxWidth, alignSelf: 'center', alignItems: 'stretch' },
});
