import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Chip, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { EmployeeModuleCard } from '@/components/employee/EmployeeModuleCard';
import { plural } from '@/utils/plural';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AppButton } from '@/components/ui/AppButton';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { EmployeeBottomNavigation } from '@/components/ui/AdminPage';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSignOutAction } from '@/features/auth/useSignOutAction';
import { hasAnyPermission, hasPermission } from '@/features/auth/permissions';
import { signInForPortal } from '@/features/auth/portalLogin';
import { resolveNotice } from '@/constants/notices';
import { usePortalLoginState } from '@/features/auth/portalLoginState';

export default function EmployeeEntry() {
  const portalLoginPending = usePortalLoginState(state => state.pending);
  const { session, membership, businesses, stores, isWorkspaceLoading } = useAuth();
  const { signOut } = useSignOutAction();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const compact = width < 600;
  const wide = width >= 980;
  const employeeName = String(session?.user.user_metadata?.full_name ?? session?.user.email ?? 'Employé');

  if (!session || portalLoginPending) return <EmployeeLogin />;
  // /employee is the one route exempt from RoleGuard (it doubles as the public
  // employee login form), so it must repeat RoleGuard's own temporary-password
  // check itself — otherwise a first-time employee lands straight on the full
  // dashboard instead of being forced to replace their temporary password.
  if (session.user.app_metadata?.must_change_password === true) return <Redirect href="/(auth)/change-temporary-password" />;
  if (!membership && isWorkspaceLoading) return <LoadingScreen label="Chargement de vos boutiques…" />;
  if (!membership && businesses.length) {
    if (stores.length > 1) return <Redirect href="/choose-store" />;
    return (
      <ErrorState
        title="Aucune boutique accessible"
        message="Aucune boutique ne vous est attribuée. Contactez votre administrateur."
        retryLabel="Se déconnecter"
        onRetry={() => void signOut()}
      />
    );
  }
  if (!membership) return <LoadingScreen label="Chargement de votre espace…" />;
  if (membership.role !== 'employee') return <ErrorState title="Espace employé non autorisé" message="Ce compte ne possède pas d’accès employé. Utilisez l’espace qui vous a été attribué." retryLabel="Retour à mon espace" onRetry={() => router.replace('/')} onCancel={() => void signOut()} />;

  const hasAny = (permissions: string[]) => hasAnyPermission(membership, permissions);
  const canCatalog = hasAny(['products.read', 'suppliers.read']);
  const canProducts = hasAny(['products.read', 'products.write']);
  const canSuppliers = hasAny(['suppliers.read', 'suppliers.write']);
  const canSales = hasAny(['sales.read', 'sales.write']);
  const canAccounting = hasAny(['purchases.read', 'payments.read', 'expenses.read']);
  const canReports = hasAny(['daily_reports.read', 'monthly_reports.read']);
  const canCash = hasAny(['cash_transactions.read', 'cash_transactions.write', 'expenses.read', 'expenses.write']);
  const canCreateSale = hasPermission(membership, 'sales.write');
  const modules = [
    canProducts && { title: 'Produits', description: hasPermission(membership, 'products.write') ? 'Consulter, ajouter et modifier' : 'Consulter les produits', icon: 'package-variant-closed', accent: '#084B50', route: '/employee/products' },
    canCash && { title: 'Caisse', description: hasAny(['cash_transactions.write', 'expenses.write']) ? 'Solde, entrées et sorties' : 'Consulter la caisse', icon: 'wallet-outline', accent: '#084B50', route: '/employee/cash' },
    canSales && { title: 'Ventes', description: 'Panier, encaissement et historique', icon: 'cart-outline', accent: '#084B50', route: '/employee/sales' },
  ].filter(Boolean) as { title: string; description: string; icon: string; accent: string; route: string }[];
  const advancedCount = [canSuppliers, canCatalog && !canProducts && !canSuppliers, canAccounting, canReports, true].filter(Boolean).length;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header elevated style={{ backgroundColor: '#084B50' }}>
        {/* Retour testeur du 25/09 : après un changement de boutique (Sonfonia → T6), l'accueil
            n'affichait plus que le nom de l'entreprise — le nom de la boutique active, en
            subtitle d'Appbar.Content, ne s'affiche pas de façon fiable (constaté en direct,
            déjà rencontré ailleurs dans la session). La boutique passe donc en title, seul
            emplacement fiable, comme sur tous les autres écrans employé (AdminPage) ; l'entreprise
            passe en subtitle, redondante mais moins critique pour éviter une opération dans la
            mauvaise boutique. */}
        <Appbar.Content title={membership.storeName ?? membership.companyName ?? 'Boutique'} titleStyle={{color:'#FFFFFF',fontWeight:'800'}} subtitle={membership.companyName} subtitleStyle={{color:'#D7EFF0'}} />
        {stores.length > 1 && <Appbar.Action color="#FFFFFF" icon="swap-horizontal" accessibilityLabel="Changer de boutique" onPress={() => router.push('/choose-store')} />}
        {/* Retour testeur du 25/09 : recherche à côté de la cloche, comme sur tous les
            autres écrans (AdminPage). */}
        <Appbar.Action color="#FFFFFF" icon="magnify" accessibilityLabel="Rechercher" onPress={() => router.push('/employee/search' as never)} />
        <NotificationBell color="#FFFFFF" />
        {/* Retour testeur du 25/09 : retiré d'ici — trop facile à toucher par erreur et se
            déconnecter sans le vouloir. Accessible depuis Plus désormais, plus délibéré. */}
      </Appbar.Header>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.page, compact && styles.pageCompact]}
        showsVerticalScrollIndicator={false}
      >
        {/* Retour testeur du 25/09 : cadre encore réduit à une simple bande — plus de
            phrase descriptive, juste le nom et le rôle. */}
        <View style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}>
          <Icon source="account-hard-hat-outline" size={18} color={theme.colors.onPrimaryContainer} />
          <Text variant="titleSmall" numberOfLines={1} style={[styles.heroText, { color: theme.colors.onPrimaryContainer }]}>
            Bonjour {employeeName}
          </Text>
          <Chip compact style={styles.heroChip}>{membership.roleName}</Chip>
        </View>

        <View style={styles.sectionHeading}>
          <View style={styles.sectionCopy}>
            <Text variant="titleLarge" style={styles.sectionTitle}>Outils quotidiens</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              Choisissez l’action à effectuer.
            </Text>
          </View>

        </View>

        {canCreateSale && (
          <Card mode="contained" onPress={() => router.push('/employee/sales/new' as never)} style={[styles.saleShortcut, { backgroundColor: '#084B50' }]}>
            <Card.Content style={styles.saleShortcutContent}>
              <View style={styles.saleShortcutCopy}>
                <Text variant="titleLarge" style={styles.saleShortcutTitle}>Nouvelle vente</Text>
                <Text style={styles.saleShortcutText}>Scanner, ajouter les articles et encaisser rapidement.</Text>
              </View>
              <Icon source="arrow-right-circle" size={38} color="#FFFFFF" />
            </Card.Content>
          </Card>
        )}

        <View style={styles.grid}>
          {modules.map((module) => (
            <EmployeeModuleCard
              key={module.title}
              {...module}
              compact={compact}
              onPress={() => router.push(module.route as never)}
              style={compact ? styles.cardSingle : wide ? styles.cardThird : styles.cardHalf}
            />
          ))}
        </View>

        <Card mode="outlined" onPress={() => router.push('/employee/more' as never)}><Card.Content style={styles.notice}><Icon source="dots-grid" size={30} color={theme.colors.primary}/><View style={styles.noticeCopy}><Text variant="titleMedium" style={styles.sectionTitle}>Autres outils</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>Fournisseurs, comptabilité, rapports et paramètres · {advancedCount} module{plural(advancedCount)}</Text></View><Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant}/></Card.Content></Card>

        {!canCatalog && !canSales && !canAccounting && !canReports && !canCash && (
          <Card mode="outlined" style={{ backgroundColor: theme.colors.surface }}>
            <Card.Content style={styles.notice}>
              <Icon source="information-outline" size={28} color={theme.colors.secondary} />
              <View style={styles.noticeCopy}>
                <Text variant="titleMedium">Aucun module métier attribué</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>Contactez votre administrateur pour obtenir des permissions.</Text>
              </View>
            </Card.Content>
          </Card>
        )}

      </ScrollView>
      {/* Retour testeur du 25/09 : la même barre d'icônes que sur les autres écrans employé
          (AdminPage), pour que l'Accueil ne soit pas la seule page sans elle — « Se
          déconnecter » n'est plus ici, il est désormais dans Plus, comme demandé. */}
      {compact && <EmployeeBottomNavigation />}
    </View>
  );
}

function EmployeeLogin() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const noticeText = resolveNotice(notice);
  const { refreshMembership } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const login = async () => {
    setLoading(true);
    setError('');
    const result = await signInForPortal(email, password, 'employee');
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? 'Connexion employé impossible.');
      return;
    }
    if (result.mfaRequired) { router.replace({ pathname: '/(auth)/mfa', params: { portal: 'employee' } }); return; }
    await refreshMembership();
    router.replace('/');
  };

  return (
    <AuthScreen title="Espace employé" subtitle="Accédez à votre espace de travail.">
      {!!noticeText && <HelperText type="info" visible>{noticeText}</HelperText>}
      <View style={[styles.loginIcon, { backgroundColor: theme.colors.primaryContainer }]}>
        <Icon source="account-lock-outline" size={40} color={theme.colors.primary} />
      </View>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>
        Utilisez l’email et le mot de passe fournis par votre administrateur.
      </Text>
      {/* Audit externe (SM-06) : avec autoComplete="username" ici, un
          gestionnaire de mots de passe ne distingue pas ce formulaire de
          celui de l'administrateur (même origine) — sur une tablette de
          caisse partagée, les identifiants admin se proposaient tout seuls
          à l'employé. Volontairement désactivé plutôt que mal distingué :
          un appareil partagé entre plusieurs employés (et potentiellement
          l'administrateur) ne devrait de toute façon mémoriser le mot de
          passe de personne ici. */}
      <TextInput
        mode="outlined"
        label="Email professionnel"
        accessibilityLabel="Email professionnel"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="none"
        autoComplete="off"
      />
      <TextInput
        mode="outlined"
        label="Mot de passe"
        accessibilityLabel="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={passwordHidden}
        textContentType="none"
        autoComplete="off"
        right={<TextInput.Icon icon={passwordHidden ? 'eye' : 'eye-off'} onPress={() => setPasswordHidden((value) => !value)} />}
        onSubmitEditing={login}
      />
      {!!error && <HelperText type="error" visible>{error}</HelperText>}
      <AppButton loading={loading} disabled={loading || !email.trim() || password.length < 8} onPress={login}>Se connecter</AppButton>
      <AppButton mode="text" icon="lock-question" onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { returnTo: '/employee' } })}>Mot de passe oublié ?</AppButton>
      <AppBackButton fallback="/(auth)/login" />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1, minWidth: 0 },
  page: { padding: 24, paddingBottom: 44, gap: 22, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  pageCompact: { padding: 16, paddingBottom: 32, gap: 18 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  heroText: { flex: 1, minWidth: 0, fontWeight: '700' },
  heroChip: { height: 28 },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionCopy: { flexGrow: 1, flexBasis: 230, minWidth: 0, gap: 3 },
  sectionTitle: { fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cardSingle: { width: '100%' },
  cardHalf: { flexGrow: 1, flexBasis: '46%', minWidth: 0 },
  cardThird: { flexGrow: 1, flexBasis: '30%', minWidth: 0 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  noticeCopy: { flex: 1, gap: 3 },
  loginIcon: { width: 72, height: 72, borderRadius: 24, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  saleShortcut: { borderRadius: 22 },
  saleShortcutContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  saleShortcutCopy: { flex: 1, gap: 3 },
  saleShortcutTitle: { color: '#FFFFFF', fontWeight: '800' },
  saleShortcutText: { color: 'rgba(255,255,255,0.82)' },
});
