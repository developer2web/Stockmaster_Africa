import { isSubscriptionReadOnly } from '@/features/subscriptions/readOnlyAccess';
import { PropsWithChildren, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Icon, Text, useTheme } from 'react-native-paper';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSubscription } from '@/features/subscriptions/SubscriptionProvider';
import { AppButton } from './AppButton';
import { AppBackButton } from './AppBackButton';
import { withLeaveGuard } from './leaveGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { plural } from '@/utils/plural';
import { hasAnyPermission } from '@/features/auth/permissions';
import { PageIntro } from './PageIntro';
import { design } from '@/constants/design';
import { openAccountPortal } from '@/features/subscriptions/accountPortal';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { EmployeeSidebar } from '@/components/navigation/EmployeeSidebar';
import { EMPLOYEE_DESKTOP_MIN_WIDTH } from '@/components/navigation/employeeLinks';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

const scrollPositions = new Map<string, number>();

const descriptions:Record<string,string>={
  'Nouvelle vente':'Ajoutez les produits, choisissez le client puis encaissez.',
};

export function AdminPage({ title, description, onDescriptionPress, action, floatingAction, backToHome = false, backTo, hideBack = false, onBackPress, scrollResetKey, onContentWidthChange, wide = false, children }: PropsWithChildren<{ title: string; description?: string; onDescriptionPress?: () => void; action?: ReactNode; floatingAction?: ReactNode; backToHome?: boolean; backTo?: string; hideBack?: boolean; onBackPress?: (proceed: () => void) => void; scrollResetKey?: string; onContentWidthChange?: (width: number) => void; wide?: boolean }>) {
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
  // Le Tabs d'(admin) garde par défaut tous les écrans déjà visités montés
  // en arrière-plan (comportement normal d'un onglet, mais appliqué ici à
  // 22 écrans dont 16 secondaires jamais censés rester en mémoire) : le DOM
  // grossit sans fin au fil de la navigation, avec des titres/boutons en
  // double pour les lecteurs d'écran. Un écran non actif ne rend donc plus
  // rien du tout ici plutôt que de rester cousu, invisible, dans la page.
  const isFocused = useIsFocused();
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
  // Avant : rien ne rappelait qu'un compte était en essai gratuit avant les 7
  // derniers jours (seul l'écran de bienvenue, vu une fois, le mentionnait) —
  // repère continu discret en plus, pas à la place de l'alerte urgente ci-dessus.
  const showTrialBanner = !showRenewalWarning && subscription?.status === 'trialing' && remainingDays !== null && remainingDays >= 0;
  if (!isFocused) return null;
  // Les écrans employé sont plafonnés plus étroit que ceux du propriétaire (grille de
  // cartes du menu, pensée pour rester compacte). `wide` lève ce plafond pour un écran
  // employé précis qui a vraiment besoin de la largeur, comme un panneau catalogue +
  // panier côte à côte : sans lui, l'espace disponible sur un grand écran reste inutilisé
  // (retour testeur du 24/09, écran « Nouvelle vente »).
  const maxContentWidth = employee && !wide ? 1100 : design.contentMaxWidth;
  // Retour testeur du 26/09 : sur ordinateur, menu latéral comme côté administrateur ;
  // sur téléphone, barre d'icônes du bas (seul chemin de navigation, toujours affichée).
  const employeeDesktop = employee && !offlineAuthenticated && width >= EMPLOYEE_DESKTOP_MIN_WIDTH;
  const page = (
    <KeyboardAvoidingView
      onLayout={event => onContentWidthChange?.(Math.max(0, Math.min(event.nativeEvent.layout.width, maxContentWidth) - (compact ? 24 : 40)))}
      style={[styles.flex, { backgroundColor: pageBackground }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Appbar.Header elevated style={{ backgroundColor: employee ? employeeHeader : theme.colors.surface }}>
        {/* hideBack : pour un écran d'accueil, où la flèche ne mènerait qu'à lui-même (retour
            testeur du 24/09, « la flèche ne mène à rien »). */}
        {!offlineAuthenticated && !hideBack && <AppBackButton
          fallback={cameFromTools ? toolsFallback : backTo ?? (employee ? '/employee' : '/(admin)')}
          light={employee}
          // backTo : destination imposée. Sur le web, « précédent » (safeBack) passe par l'historique
          // des onglets d'(admin) et ramène à l'Accueil, pas à l'écran d'où l'on vient.
          forceFallback={backToHome || cameFromTools || !!backTo}
          guard={onBackPress}
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
        {/* Retour testeur du 25/09 : recherche accessible depuis l'en-tête, à côté de la
            cloche, sur tous les écrans (admin comme employé) plutôt que sur un seul écran. */}
        {!offlineAuthenticated && <Appbar.Action icon="magnify" color={employee ? '#FFFFFF' : undefined} accessibilityLabel="Rechercher" onPress={() => router.push((employee ? '/employee/search' : '/search') as never)} />}
        {!offlineAuthenticated && <NotificationBell color={employee ? '#FFFFFF' : undefined} />}
        {offlineAuthenticated && <Appbar.Action icon="lock-outline" color={employee ? '#FFFFFF' : undefined} accessibilityLabel="Verrouiller l’accès hors ligne" onPress={lockOfflineSession} />}
        {/* Retour testeur du 25/09 : retiré d'ici — trop facile à toucher par erreur. Se
            déconnecter reste accessible depuis Menu > Compte, comme côté employé. */}
      </Appbar.Header>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        nestedScrollEnabled
        contentContainerStyle={[styles.page, employee && styles.employeePage, employee && wide && { maxWidth: design.contentMaxWidth }, compact && styles.compactPage]}
        keyboardShouldPersistTaps="handled"
        // Web : 'on-drag' fermait le clavier (donc retirait le focus du champ en cours de saisie) à
        // chaque défilement, y compris celui déclenché seul quand la page raccourcit (un message
        // d'aide qui disparaît, une erreur qui s'efface) — la saisie s'interrompait toute seule.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : Platform.OS === 'android' ? 'on-drag' : 'none'}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={80}
        onScroll={(event) => scrollPositions.set(pathname, event.nativeEvent.contentOffset.y)}
        onContentSizeChange={() => {
          if (restoredFor.current === pathname) return;
          restoredFor.current = pathname;
          scrollRef.current?.scrollTo({ y: scrollPositions.get(pathname) ?? 0, animated: false });
        }}
      >
        <PageIntro title={title} description={description??descriptions[title]} onDescriptionPress={onDescriptionPress} action={action}/>
        {!offlineAuthenticated && showRenewalWarning && (
          <Card mode="contained" style={{ backgroundColor: theme.colors.errorContainer }}>
            <Card.Content style={styles.subscriptionWarning}>
              <View style={styles.grow}>
                <Text variant="titleMedium">Abonnement à renouveler</Text>
                <Text>
                  {readOnly
                    ? 'Lecture seule : consultez vos données. Renouvelez pour ajouter, modifier ou supprimer.'
                    : `Votre forfait expire dans ${remainingDays} jour${plural(remainingDays ?? 0)}.`}
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
        {!offlineAuthenticated && showTrialBanner && (
          <Card mode="contained" style={{ backgroundColor: theme.colors.secondaryContainer }}>
            <Card.Content style={styles.subscriptionWarning}>
              <View style={styles.grow}>
                <Text variant="titleMedium">Essai gratuit en cours</Text>
                <Text>{`${remainingDays} jour${plural(remainingDays ?? 0)} restant${plural(remainingDays ?? 0)} avant l’expiration${subscription?.expiresAt ? ` (${new Date(subscription.expiresAt).toLocaleDateString('fr-FR')})` : ''}.`}</Text>
              </View>
              {membership?.role === 'company_admin' && (
                <AppButton mode="text" loading={openingAccount} disabled={openingAccount} onPress={() => { setOpeningAccount(true); void openAccountPortal(membership?.companyId ?? '').catch((error) => Alert.alert('Portail Account', error.message)).finally(() => setOpeningAccount(false)); }}>
                  Voir les forfaits
                </AppButton>
              )}
            </Card.Content>
          </Card>
        )}
        {children}
      </ScrollView>
      {!!floatingAction && <View style={[styles.actionFooter, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant, paddingBottom: employee && !offlineAuthenticated ? 8 : Math.max(8, insets.bottom) }]}><View style={styles.footerContent}>{floatingAction}</View></View>}
      {/* Revue du 26/09 : réservée jadis aux écrans étroits (compact) — un employé
          ouvrant l'app dans un navigateur de bureau (constaté en direct : capture
          d'un MacBook) n'avait alors STRICTEMENT aucun moyen d'atteindre Plus,
          Vente, Produits ou Caisse. Toujours affichée désormais, quelle que soit
          la largeur : c'est le seul chemin de navigation de tout l'espace
          employé, il ne peut pas dépendre de la taille de l'écran. */}
      {employee && !offlineAuthenticated && !employeeDesktop && <EmployeeBottomNavigation />}
    </KeyboardAvoidingView>
  );
  return employeeDesktop ? <View style={styles.desktopRow}><EmployeeSidebar />{page}</View> : page;
}

export function EmployeeBottomNavigation() {
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
  return <View style={[styles.employeeBottom, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant, paddingBottom: Math.max(insets.bottom, 6) }]}>{links.map(({ label, icon, path }) => {const active=path==='/employee'?pathname==='/employee':pathname.startsWith(path);return <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:active}} onPress={() => withLeaveGuard(() => router.navigate(path as never))} style={({ pressed }) => [styles.employeeBottomItem,active&&{backgroundColor:theme.colors.primaryContainer}, pressed && styles.employeeBottomPressed]}><Icon source={icon} size={22} color={active?theme.colors.onPrimaryContainer:theme.colors.primary} /><Text variant="labelSmall" numberOfLines={1} style={active&&{color:theme.colors.onPrimaryContainer,fontWeight:'800'}}>{label}</Text></Pressable>})}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, minHeight: 0 },
  desktopRow: { flex: 1, flexDirection: 'row', minHeight: 0 },
  scroll: { flex: 1, minWidth: 0 },
  headerContent: { flex: 1, minWidth: 0 },
  // flexGrow:1 : sans lui, un écran dont le contenu tient en moins d'un
  // écran (peu d'activité pour une entreprise récente, par exemple) laisse
  // l'espace sous le contenu hors du fond du thème posé plus haut sur le
  // conteneur parent — visible en thème sombre comme une zone restée
  // blanche (audit externe, SM-10, sur le Journal d'activité).
  page: { flexGrow: 1, padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: design.contentMaxWidth, alignSelf: 'center' },
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
