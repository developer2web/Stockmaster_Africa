import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Appbar, Card, Chip, Icon, Text, useTheme } from 'react-native-paper';

import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAuth } from '@/features/auth/AuthProvider';
import { getPlatformStats } from '@/features/superAdmin/api';

const platformSections = [
  {title:'Gestion',description:'Entreprises, magasins et accès',links:[
    ['Entreprises', 'Comptes clients et abonnements', 'office-building-cog-outline', '/(super-admin)/companies'],
    ['Magasins', 'Tous les points de vente', 'store-cog-outline', '/(super-admin)/stores'],
    ['Utilisateurs', 'Comptes, rôles et accès', 'account-cog-outline', '/(super-admin)/users'],
  ]},
  {title:'Finance',description:'Encaissements et offres commerciales',links:[
    ['Paiements', 'Orange Money et Stripe', 'credit-card-check-outline', '/(super-admin)/payments'],
    ['Promotions', 'Codes promo et périodes d’essai', 'ticket-percent-outline', '/(super-admin)/promotions'],
  ]},
  {title:'Surveillance',description:'Activité, support et incidents',links:[
    ['Journal d’activité', 'Historique des opérations sensibles', 'history', '/(super-admin)/audit'],
    ['Centre opérationnel', 'Santé, support et erreurs', 'heart-pulse', '/(super-admin)/operations'],
  ]},
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
  const mobile=width<600;
  const theme = useTheme();
  const query = useQuery({ queryKey: ['platform-dashboard'], queryFn: getPlatformStats });

  if (query.isLoading) return <LoadingScreen label="Chargement de la plateforme…" />;
  if (query.error) {
    return <ErrorState message={query.error.message} onRetry={() => query.refetch()} onCancel={signOut} />;
  }

  const data = query.data!;
  const stats = [
    ['Entreprises', data.companies, 'office-building-outline', '#084B50'],
    ['Entreprises actives', data.active_companies, 'check-decagram-outline', '#2F9E44'],
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
      <View style={[styles.hero, mobile&&styles.heroMobile, { backgroundColor: theme.colors.primaryContainer }]}>
        <View style={[styles.heroIcon, { backgroundColor: theme.colors.primary }]}>
          <Icon source="shield-crown-outline" size={34} color={theme.colors.onPrimary} />
        </View>
        <View style={styles.copy}>
          <Text variant="headlineSmall" style={styles.bold}>Vue globale de StockMaster</Text>
          <Text style={{ color: theme.colors.onPrimaryContainer }}>
            Suivez et administrez toute la plateforme depuis un espace sécurisé.
          </Text>
        </View>
        <Chip compact={mobile} icon="shield-check">Super Admin</Chip>
      </View>

      <View style={[styles.grid,mobile&&styles.statsGridMobile]}>
        {stats.map(([label, value, icon, color]) => (
          <Card
            key={label}
            mode="contained"
            style={[styles.stat, mobile&&styles.statMobile, { backgroundColor: theme.colors.surface }]}
          >
            <Card.Content style={[styles.statContent,mobile&&styles.statContentMobile]}>
              <View style={[styles.statIcon,mobile&&styles.statIconMobile, { backgroundColor: `${color}1F` }]}>
                <Icon source={icon} size={mobile?21:26} color={color} />
              </View>
              <View style={styles.statCopy}><Text variant={mobile?'titleLarge':'headlineSmall'} style={styles.bold}>{value}</Text><Text variant={mobile?'labelMedium':'bodyMedium'} numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text></View>
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

      <View style={styles.sectionHeading}><Text variant="headlineSmall" style={styles.bold}>Gestion de la plateforme</Text><Text style={{color:theme.colors.onSurfaceVariant}}>Accédez rapidement aux outils d’administration.</Text></View>
      {platformSections.map(section=><View key={section.title} style={styles.moduleSection}><View><Text variant="titleMedium" style={styles.bold}>{section.title}</Text><Text variant="bodySmall" style={{color:theme.colors.onSurfaceVariant}}>{section.description}</Text></View><View style={[styles.grid,mobile&&styles.moduleGridMobile]}>
        {section.links.map(([title, subtitle, icon, route]) => (
          <Card
            key={title}
            mode="contained"
            onPress={() => router.push(route as never)}
            style={[styles.link, { backgroundColor: theme.colors.surface }, mobile&&styles.linkMobile]}
          >
            <Card.Content style={[styles.linkContent,mobile&&styles.linkContentMobile]}><View style={[styles.linkIcon,mobile&&styles.linkIconMobile,{ backgroundColor: theme.colors.secondaryContainer }]}><Icon source={icon} size={mobile?22:25} color={theme.colors.secondary} /></View><View style={styles.linkCopy}><Text variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.85} style={styles.linkTitle}>{title}</Text><Text variant="bodyMedium" numberOfLines={1} style={{color:theme.colors.onSurfaceVariant,lineHeight:20}}>{subtitle}</Text></View><Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant}/></Card.Content>
          </Card>
        ))}
      </View></View>)}
    </PlatformPage>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, padding: 22, borderRadius: 26 },
  heroMobile:{padding:16,borderRadius:20,gap:12},
  heroIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 220, gap: 4 },
  bold: { fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  statsGridMobile:{gap:12,justifyContent:'space-between'},
  stat: { flexGrow: 1, flexBasis: '22%', borderRadius: 20 },
  statMobile:{flexGrow:0,flexBasis:'auto',width:'48%',minWidth:0,minHeight:112,borderRadius:16},
  statContent: { gap: 7 },
  statContentMobile:{padding:12,gap:7},
  statCopy:{minWidth:0,flex:1},
  statIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statIconMobile:{width:38,height:38,borderRadius:12},
  currencyList: { gap: 12 },
  currencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap:'wrap', gap: 12 },
  link: { flexGrow: 1, flexBasis: '46%', borderRadius: 20 },
  linkMobile:{width:'100%',flexBasis:'auto',flexGrow:0,borderRadius:16},
  linkIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  linkIconMobile:{width:42,height:42,borderRadius:14},
  linkContent:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:14},
  linkContentMobile:{paddingHorizontal:14,paddingVertical:12},
  linkCopy:{flex:1,minWidth:0,gap:2},
  linkTitle:{fontWeight:'800',lineHeight:22},
  sectionHeading:{gap:4,marginTop:4},
  moduleSection:{gap:10,marginTop:4},
  moduleGridMobile:{flexDirection:'column',flexWrap:'nowrap',gap:10},
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  planItem: { minWidth: 140, flexGrow: 1, padding: 16, borderWidth: 1, borderRadius: 16, gap: 4 },
});
