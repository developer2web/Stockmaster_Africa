import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Chip, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AppButton } from '@/components/ui/AppButton';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { EmployeeBottomNavigation } from '@/components/ui/AdminPage';
import { EmployeeSidebar } from '@/components/navigation/EmployeeSidebar';
import { EMPLOYEE_DESKTOP_MIN_WIDTH } from '@/components/navigation/employeeLinks';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSignOutAction } from '@/features/auth/useSignOutAction';
import { hasAnyPermission, hasPermission } from '@/features/auth/permissions';
import { signInForPortal } from '@/features/auth/portalLogin';
import { resolveNotice } from '@/constants/notices';
import { usePortalLoginState } from '@/features/auth/portalLoginState';
import { getCashSummary } from '@/features/cash/api';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { supabase } from '@/services/supabase/client';

export default function EmployeeEntry() {
  const portalLoginPending = usePortalLoginState(state => state.pending);
  const { session, membership, businesses, stores, isWorkspaceLoading } = useAuth();
  const { signOut } = useSignOutAction();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const { formatMoney } = useCurrency();
  const compact = width < 600;
  const desktop = width >= EMPLOYEE_DESKTOP_MIN_WIDTH;
  const employeeName = String(session?.user.user_metadata?.full_name ?? session?.user.email ?? 'Employé');
  // Hooks appelés avant tout retour anticipé ci-dessous (règle de React) : hasAnyPermission/
  // hasPermission tolèrent un membership encore nul, les requêtes restent désactivées tant
  // qu'il ne l'est pas (enabled).
  const hasAny = (permissions: string[]) => hasAnyPermission(membership, permissions);
  const canCatalog = hasAny(['products.read', 'suppliers.read']);
  const canSales = hasAny(['sales.read', 'sales.write']);
  const canAccounting = hasAny(['purchases.read', 'payments.read', 'expenses.read']);
  const canReports = hasAny(['daily_reports.read', 'monthly_reports.read']);
  const canCash = hasAny(['cash_transactions.read', 'cash_transactions.write', 'expenses.read', 'expenses.write']);
  const canCreateSale = hasPermission(membership, 'sales.write');
  const companyId = membership?.companyId ?? '';
  const storeId = membership?.storeId ?? '';
  const userId = session?.user.id ?? '';
  // Retour testeur du 25/09 : l'écran ne peut pas rester vide sous « Nouvelle vente »
  // une fois les raccourcis en double retirés — de vraies infos du jour à la place,
  // comme sur l'accueil admin (Solde de caisse), pas des liens. « Mes ventes », elle,
  // est volontairement personnelle (created_by = cet employé) — sur demande explicite,
  // donc différente de « Ventes du jour » du tableau de bord admin (toute la boutique) :
  // le libellé le précise pour ne pas laisser croire au même chiffre.
  const cash = useQuery({ queryKey: ['employee-home-cash', storeId], queryFn: () => getCashSummary(storeId), enabled: canCash && !!storeId });
  const mySales = useQuery({
    queryKey: ['employee-home-my-sales-today', companyId, storeId, userId],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const { data, error } = await supabase.from('sales').select('total').eq('company_id', companyId).eq('store_id', storeId).eq('created_by', userId).gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
      if (error) throw new Error(error.message);
      return (data ?? []).reduce((sum, row) => sum + Number(row.total), 0);
    },
    enabled: canSales && !!companyId && !!storeId && !!userId,
  });

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

  const content = (
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

        {/* Retour testeur du 25/09 : la grille Produits/Caisse/Ventes et « Autres outils »
            retirées d'ici — doublons exacts de la barre d'icônes (Produits/Caisse/Plus)
            juste en dessous, désormais présente sur cet écran aussi. « Nouvelle vente »
            reste : une action (démarrer une vente), pas juste un raccourci vers un onglet. */}
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

        {(canSales || canCash) && (
          <View style={styles.statsRow}>
            {canSales && (
              <Card mode="contained" onPress={() => router.push('/employee/sales' as never)} style={[styles.statCard, { backgroundColor: theme.colors.surface }]}>
                <Card.Content style={styles.statContent}>
                  <View style={[styles.statIcon, { backgroundColor: '#084B501F' }]}>
                    <Icon source="cart-check" size={20} color="#084B50" />
                  </View>
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>Mes ventes du jour</Text>
                  {/* Retour testeur du 25/09 : adjustsFontSizeToFit n'a aucun effet sur le web
                      (déjà rencontré) — texte petit fixe à la place. */}
                  <Text numberOfLines={1} style={styles.statValue}>{mySales.error ? 'Indisponible' : mySales.data !== undefined ? formatMoney(mySales.data) : '…'}</Text>
                </Card.Content>
              </Card>
            )}
            {canCash && (
              <Card mode="contained" onPress={() => router.push('/employee/cash' as never)} style={[styles.statCard, { backgroundColor: theme.colors.surface }]}>
                <Card.Content style={styles.statContent}>
                  <View style={[styles.statIcon, { backgroundColor: '#E677001F' }]}>
                    <Icon source="wallet-outline" size={20} color="#E67700" />
                  </View>
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>Solde de caisse</Text>
                  <Text numberOfLines={1} style={[styles.statValue, cash.data && cash.data.balance < 0 && { color: theme.colors.error }]}>{cash.error ? 'Indisponible' : cash.data ? formatMoney(cash.data.balance) : '…'}</Text>
                </Card.Content>
              </Card>
            )}
          </View>
        )}

        {/* Retour testeur du 25/09 : cette carte ne s'affichait que si l'employé n'avait
            STRICTEMENT aucune permission — mais le contenu réel de cet écran (vente,
            statistiques) ne dépend que de sales/cash. Un employé avec uniquement
            catalogue, comptabilité ou rapports (ex. suppliers.read seul) avait donc un
            écran d'accueil vide, sans carte ET sans ce message, aucun repère vers
            l'onglet Plus où ses outils se trouvent réellement. */}
        {!canCreateSale && !canSales && !canCash && (
          <Card mode="outlined" style={{ backgroundColor: theme.colors.surface }}>
            <Card.Content style={styles.notice}>
              <Icon source="information-outline" size={28} color={theme.colors.secondary} />
              <View style={styles.noticeCopy}>
                {canCatalog || canAccounting || canReports ? (
                  <>
                    <Text variant="titleMedium">Vos outils sont dans l’onglet Plus</Text>
                    <Text style={{ color: theme.colors.onSurfaceVariant }}>Aucun raccourci de vente ou de caisse ne vous est attribué ici, mais vos accès restent disponibles depuis Plus.</Text>
                    <AppButton mode="text" onPress={() => router.push('/employee/more' as never)}>Ouvrir Plus</AppButton>
                  </>
                ) : (
                  <>
                    <Text variant="titleMedium">Aucun module métier attribué</Text>
                    <Text style={{ color: theme.colors.onSurfaceVariant }}>Contactez votre administrateur pour obtenir des permissions.</Text>
                  </>
                )}
              </View>
            </Card.Content>
          </Card>
        )}

      </ScrollView>
      {/* Retour testeur du 25/09 : la même barre d'icônes que sur les autres écrans employé
          (AdminPage), pour que l'Accueil ne soit pas la seule page sans elle — « Se
          déconnecter » n'est plus ici, il est désormais dans Plus, comme demandé.
          Revue du 26/09 : affichée quelle que soit la largeur (plus seulement en
          compact) — sur un navigateur de bureau, c'était le seul chemin vers Plus/
          Outils, et il manquait entièrement (capture d'écran MacBook à l'appui). */}
      {!desktop && <EmployeeBottomNavigation />}
    </View>
  );
  // Retour testeur du 26/09 : sur ordinateur, menu latéral comme côté administrateur.
  return desktop ? <View style={styles.desktopRow}><EmployeeSidebar />{content}</View> : content;
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
  screen: { flex: 1, minWidth: 0 },
  desktopRow: { flex: 1, flexDirection: 'row' },
  scroll: { flex: 1, minWidth: 0 },
  page: { padding: 24, paddingBottom: 44, gap: 22, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  pageCompact: { padding: 16, paddingBottom: 32, gap: 18 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  heroText: { flex: 1, minWidth: 0, fontWeight: '700' },
  heroChip: { height: 28 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { flexGrow: 1, flexBasis: 160, minWidth: 0, borderRadius: 18 },
  statContent: { gap: 6, paddingVertical: 16 },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statValue: { fontWeight: '800', fontSize: 18 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  noticeCopy: { flex: 1, gap: 3 },
  loginIcon: { width: 72, height: 72, borderRadius: 24, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  saleShortcut: { borderRadius: 22 },
  saleShortcutContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  saleShortcutCopy: { flex: 1, gap: 3 },
  saleShortcutTitle: { color: '#FFFFFF', fontWeight: '800' },
  saleShortcutText: { color: 'rgba(255,255,255,0.82)' },
});
