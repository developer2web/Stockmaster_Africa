import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Chip, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { EmployeeModuleCard } from '@/components/employee/EmployeeModuleCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { hasAnyPermission, hasPermission } from '@/features/auth/permissions';
import { signInForPortal } from '@/features/auth/portalLogin';
import { usePortalLoginState } from '@/features/auth/portalLoginState';

export default function EmployeeEntry() {
  const portalLoginPending = usePortalLoginState(state => state.pending);
  const { session, membership, businesses, stores, isWorkspaceLoading, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const compact = width < 600;
  const wide = width >= 980;
  const employeeName = String(session?.user.user_metadata?.full_name ?? session?.user.email ?? 'Employé');

  if (!session || portalLoginPending) return <EmployeeLogin />;
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
  const canCatalog = hasAny(['products.read', 'categories.read', 'suppliers.read']);
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
        <Appbar.Content title={employeeName} titleStyle={{color:'#FFFFFF',fontWeight:'800'}} subtitle={`${membership.companyName} • ${membership.storeName ?? 'Boutique'}`} subtitleStyle={{color:'#D7EFF0'}} />
        {stores.length > 1 && <Appbar.Action color="#FFFFFF" icon="swap-horizontal" accessibilityLabel="Changer de boutique" onPress={() => router.push('/choose-store')} />}
        <Appbar.Action color="#FFFFFF" icon="logout" accessibilityLabel="Se déconnecter" onPress={signOut} />
      </Appbar.Header>
      <ScrollView
        contentContainerStyle={[styles.page, compact && styles.pageCompact]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }, compact && styles.heroCompact]}>
          <View style={[styles.heroIcon, { backgroundColor: '#084B50' }]}>
            <Icon source="account-hard-hat-outline" size={compact ? 28 : 34} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text variant={compact ? 'headlineSmall' : 'headlineMedium'} style={{ color: theme.colors.onPrimaryContainer, fontWeight: '800' }}>
              Bonjour {employeeName} 👋
            </Text>
            <Text variant="bodyLarge" style={{ color: theme.colors.onPrimaryContainer }}>
              Retrouvez rapidement les outils utiles à votre travail.
            </Text>
          </View>
          <Chip icon="account-key-outline" compact={compact}>{membership.roleName}</Chip>
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

        <Card mode="outlined" onPress={() => router.push('/employee/more' as never)}><Card.Content style={styles.notice}><Icon source="dots-grid" size={30} color={theme.colors.primary}/><View style={styles.noticeCopy}><Text variant="titleMedium" style={styles.sectionTitle}>Autres outils</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>Fournisseurs, comptabilité, rapports et paramètres · {advancedCount} module(s)</Text></View><Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant}/></Card.Content></Card>

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

        <AppButton mode="outlined" icon="logout" onPress={signOut}>Se déconnecter</AppButton>
      </ScrollView>
    </View>
  );
}

function EmployeeLogin() {
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
    await refreshMembership();
    router.replace('/');
  };

  return (
    <AuthScreen title="Espace employé" subtitle="Accédez à votre espace de travail.">
      <View style={[styles.loginIcon, { backgroundColor: theme.colors.primaryContainer }]}>
        <Icon source="account-lock-outline" size={40} color={theme.colors.primary} />
      </View>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>
        Utilisez l’email et le mot de passe fournis par votre administrateur.
      </Text>
      <TextInput
        mode="outlined"
        label="Email professionnel"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextInput
        mode="outlined"
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={passwordHidden}
        textContentType="password"
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
  page: { padding: 24, paddingBottom: 44, gap: 22, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  pageCompact: { padding: 16, paddingBottom: 32, gap: 18 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: 24, borderRadius: 28 },
  heroCompact: { padding: 16, borderRadius: 22, alignItems: 'flex-start' },
  heroIcon: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  heroCopy: { flexGrow: 1, flexBasis: 210, minWidth: 0, gap: 4 },
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
