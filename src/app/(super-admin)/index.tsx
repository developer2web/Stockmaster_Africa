import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Chip, Icon, Text, useTheme } from 'react-native-paper';

import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { getPlatformStats } from '@/features/superAdmin/api';

const links = [
  ['Entreprises', 'Gérer les comptes clients', 'office-building-cog-outline', '/(super-admin)/companies'],
  ['Magasins', 'Voir tous les points de vente', 'store-cog-outline', '/(super-admin)/stores'],
  ['Utilisateurs', 'Contrôler les accès', 'account-cog-outline', '/(super-admin)/users'],
  ['Journal d’activité', 'Consulter les opérations sensibles', 'history', '/(super-admin)/audit'],
  ['Paiements', 'Valider Orange Money et suivre Stripe', 'credit-card-check-outline', '/(super-admin)/payments'],
  ['Promotions', 'Codes promo, essais et configuration', 'ticket-percent-outline', '/(super-admin)/promotions'],
  ['Demandes Admin', 'Valider les employés qui deviennent administrateurs', 'account-convert-outline', '/(super-admin)/admin-requests'],
] as const;

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'code',
  }).format(Number(value));
}

export default function SuperAdminDashboard() {
  const { signOut } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const query = useQuery({ queryKey: ['platform-dashboard'], queryFn: getPlatformStats });

  if (query.isLoading) return <LoadingScreen label="Chargement de la plateforme…" />;
  if (query.error) {
    return <ErrorState message={query.error.message} onRetry={() => query.refetch()} onCancel={signOut} />;
  }

  const data = query.data!;
  const stats = [
    ['Entreprises', data.companies, 'office-building-outline', '#087F5B'],
    ['Entreprises actives', data.active_companies, 'office-building-check-outline', '#2F9E44'],
    ['Entreprises suspendues', Math.max(0, data.companies - data.active_companies), 'office-building-remove-outline', '#C92A2A'],
    ['Magasins', data.stores, 'store-outline', '#1971C2'],
    ['Utilisateurs', data.users, 'account-group-outline', '#7048E8'],
    ['Ventes', data.sales, 'cash-multiple', '#E67700'],
  ] as const;

  return (
    <PlatformPage
      title="Super Administration"
      back={false}
      action={<Appbar.Action icon="logout" onPress={signOut} />}
    >
      <View style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}>
        <View style={[styles.heroIcon, { backgroundColor: theme.colors.primary }]}>
          <Icon source="shield-crown-outline" size={34} color={theme.colors.onPrimary} />
        </View>
        <View style={styles.copy}>
          <Text variant="headlineSmall" style={styles.bold}>Vue globale de StockMaster</Text>
          <Text style={{ color: theme.colors.onPrimaryContainer }}>
            Suivez et administrez toute la plateforme depuis un espace sécurisé.
          </Text>
        </View>
        <Chip icon="shield-check">Super Admin</Chip>
      </View>

      <View style={styles.grid}>
        {stats.map(([label, value, icon, color]) => (
          <Card
            key={label}
            mode="contained"
            style={[styles.stat, { backgroundColor: theme.colors.surface }, width < 560 && styles.full]}
          >
            <Card.Content style={styles.statContent}>
              <View style={[styles.statIcon, { backgroundColor: `${color}1F` }]}>
                <Icon source={icon} size={26} color={color} />
              </View>
              <Text variant="headlineSmall" style={styles.bold}>{value}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      <Card mode="contained" style={{ backgroundColor: theme.colors.surface }}>
        <Card.Title
          title="Chiffre d’affaires par devise"
          subtitle="Les devises ne sont jamais additionnées entre elles"
        />
        <Card.Content style={styles.currencyList}>
          {data.revenue_by_currency.length ? data.revenue_by_currency.map((item) => (
            <View key={item.currency_code} style={styles.currencyRow}>
              <Chip>{item.currency_code}</Chip>
              <Text variant="titleLarge" style={styles.bold}>
                {money(item.revenue, item.currency_code)}
              </Text>
            </View>
          )) : <Text>Aucune vente enregistrée.</Text>}
        </Card.Content>
      </Card>

      <Card mode="contained" style={{ backgroundColor: theme.colors.surface }}>
        <Card.Title title="Abonnements" subtitle="Répartition actuelle des entreprises" />
        <Card.Content style={styles.planGrid}>
          {Object.entries(data.subscriptions).length ? Object.entries(data.subscriptions).map(([status, count]) => (
            <View key={status} style={[styles.planItem, { borderColor: theme.colors.outlineVariant }]}>
              <Text variant="headlineSmall" style={styles.bold}>{count}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>{status}</Text>
            </View>
          )) : <Text>Aucun abonnement enregistré.</Text>}
        </Card.Content>
      </Card>

      <Card mode="contained" style={{ backgroundColor: theme.colors.surface }}>
        <Card.Title
          title="Activité des 6 derniers mois"
          subtitle={`${data.sales} ventes enregistrées au total`}
        />
        <Card.Content style={styles.currencyList}>
          {data.monthly_sales.length ? data.monthly_sales.map((item) => (
            <View key={`${item.month}-${item.currency_code}`} style={styles.currencyRow}>
              <Text>{item.month} · {item.sales} vente(s)</Text>
              <Text style={styles.bold}>{money(item.revenue, item.currency_code)}</Text>
            </View>
          )) : <Text>Aucune activité sur cette période.</Text>}
        </Card.Content>
      </Card>

      <Text variant="titleLarge" style={styles.bold}>Gestion de la plateforme</Text>
      <View style={styles.grid}>
        {links.map(([title, subtitle, icon, route]) => (
          <Card
            key={title}
            mode="contained"
            onPress={() => router.push(route as never)}
            style={[styles.link, { backgroundColor: theme.colors.surface }, width < 680 && styles.full]}
          >
            <Card.Title
              title={title}
              subtitle={subtitle}
              left={() => (
                <View style={[styles.linkIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
                  <Icon source={icon} size={25} color={theme.colors.secondary} />
                </View>
              )}
              right={() => <Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />}
            />
          </Card>
        ))}
      </View>
    </PlatformPage>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, padding: 22, borderRadius: 26 },
  heroIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 220, gap: 4 },
  bold: { fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  stat: { flexGrow: 1, flexBasis: '22%', borderRadius: 20 },
  statContent: { gap: 7 },
  statIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  full: { flexBasis: '100%' },
  currencyList: { gap: 12 },
  currencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  link: { flexGrow: 1, flexBasis: '46%', borderRadius: 20 },
  linkIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  planItem: { minWidth: 140, flexGrow: 1, padding: 16, borderWidth: 1, borderRadius: 16, gap: 4 },
});
