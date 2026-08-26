import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Chip, Switch, Text, useTheme } from 'react-native-paper';

import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FilterMenu } from '@/components/superAdmin/FilterMenu';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { AppButton } from '@/components/ui/AppButton';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatCurrency,formatDate } from '@/utils/format';
import {
  getPlatformCompanies,
  setCompanyActive,
  setCompanyPlan,
} from '@/features/superAdmin/api';

export default function CompaniesScreen() {
  const theme = useTheme();
  const {width}=useWindowDimensions();
  const mobile=width<600;
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [plan, setPlan] = useState<'all' | 'basic' | 'pro' | 'premium'>('all');
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'active'; id: string; name: string; active: boolean }
    | { kind: 'plan'; id: string; name: string; plan: 'basic' | 'pro' | 'premium' }
    | null
  >(null);
  const query = useQuery({
    queryKey: ['platform-companies'],
    queryFn: getPlatformCompanies,
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['platform-companies'] });
    void cache.invalidateQueries({ queryKey: ['platform-dashboard'] });
  };
  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setCompanyActive(id, active),
    onSuccess: refresh,
  });
  const planMutation = useMutation({
    mutationFn: ({
      companyId,
      planCode,
    }: {
      companyId: string;
      planCode: 'basic' | 'pro' | 'premium';
    }) => setCompanyPlan(companyId, planCode),
    onSuccess: refresh,
  });
  const needle = search.trim().toLowerCase();
  const items = (query.data ?? []).filter(
    (item) =>
      (!needle || item.name.toLowerCase().includes(needle) || item.slug?.toLowerCase().includes(needle)) &&
      (status === 'all' || (status === 'active' ? item.is_active : !item.is_active)) &&
      (plan === 'all' || item.plan_code === plan),
  );

  if (query.isLoading) return <LoadingScreen label="Chargement des entreprises…" />;

  return (
    <PlatformPage title="Entreprises et abonnements">
      <AppSearchBar
        placeholder="Rechercher une entreprise"
        value={search}
        onChangeText={setSearch}
      />
      <View style={styles.filterBar}>
        <FilterMenu label="Statut" value={status} onChange={(value) => setStatus(value as typeof status)} options={[{label:'Tous les statuts',value:'all'},{label:'Actives',value:'active'},{label:'Suspendues',value:'suspended'}]} />
        <FilterMenu label="Forfait" value={plan} onChange={(value) => setPlan(value as typeof plan)} options={[{label:'Tous les forfaits',value:'all'},{label:'Basic',value:'basic'},{label:'Pro',value:'pro'},{label:'Business',value:'premium'}]} />
        {(search||status !== 'all' || plan !== 'all') && <AppButton mode="outlined" icon="filter-remove-outline" onPress={() => {setSearch('');setStatus('all');setPlan('all');}}>Réinitialiser</AppButton>}
      </View>
      {!!activeMutation.error && <Text style={{ color: theme.colors.error }}>{activeMutation.error.message}</Text>}
      {!!planMutation.error && <Text style={{ color: theme.colors.error }}>{planMutation.error.message}</Text>}
      {query.error && <ErrorState message={query.error.message} onRetry={() => query.refetch()} />}
      {!query.isLoading && !query.error && items.length === 0 && (
        <EmptyState
          title="Aucune entreprise"
          message="Aucun résultat ne correspond à votre recherche."
        />
      )}
      <View style={styles.grid}>
        {items.map((company) => (
          <Card
            key={company.id}
            mode="contained"
            style={[styles.card, mobile && styles.cardMobile, { backgroundColor: theme.colors.surface }]}
          >
            <Card.Content style={styles.content}>
              <View style={styles.cardHeading}><View style={styles.grow}><Text variant="titleLarge" numberOfLines={2} style={styles.bold}>{company.name}</Text><Text variant="bodySmall" style={{color:theme.colors.onSurfaceVariant}}>{company.slug||'Identifiant non défini'}</Text></View><View style={styles.status}><StatusChip status={company.is_active?'active':'suspended'}/><Switch value={company.is_active} disabled={activeMutation.isPending} onValueChange={(active)=>setPendingAction({kind:'active',id:company.id,name:company.name,active})}/></View></View>
              <View style={styles.chips}>
                <Chip icon="store-outline">{company.store_count} boutiques</Chip>
                <Chip icon="account-group-outline">{company.user_count} utilisateurs</Chip>
              </View>
              <Text variant={mobile?'headlineSmall':'titleLarge'} style={styles.bold}>
                {formatCurrency(company.revenue,company.currency_code)}
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                {company.sale_count} ventes · créée le{' '}
                {formatDate(company.created_at)}
              </Text>
              <Chip compact icon="credit-card-outline">
                {company.plan_code === 'premium' ? 'BUSINESS' : (company.plan_code ?? 'Aucun forfait').toUpperCase()} ·{' '}
                {company.subscription_status ?? 'inactif'}
              </Chip>
              <StatusChip status={company.subscription_status}/>
              <Text variant="labelLarge">Forfait pour les 30 prochains jours</Text>
              <View style={styles.chips}>
                {(['basic', 'pro', 'premium'] as const).map((planCode) => (
                  <Chip
                    key={planCode}
                    selected={company.plan_code === planCode}
                    disabled={planMutation.isPending}
                    onPress={() =>
                      setPendingAction({ kind: 'plan', id: company.id, name: company.name, plan: planCode })}
                  >
                    {planCode === 'premium' ? 'BUSINESS' : planCode.toUpperCase()}
                  </Chip>
                ))}
              </View>
            </Card.Content>
          </Card>
        ))}
      </View>
      <ConfirmDialog
        visible={pendingAction !== null}
        title={pendingAction?.kind === 'plan' ? 'Modifier le forfait' : pendingAction?.active ? 'Réactiver l’entreprise' : 'Suspendre l’entreprise'}
        message={pendingAction?.kind === 'plan'
          ? `Attribuer le forfait ${pendingAction.plan.toUpperCase()} à ${pendingAction.name} pendant 30 jours ?`
          : pendingAction?.active
            ? `Réactiver ${pendingAction?.name} et ses accès ?`
            : `Suspendre ${pendingAction?.name} ? Ses utilisateurs perdront immédiatement leur accès.`}
        destructive={pendingAction?.kind === 'active' && !pendingAction.active}
        loading={activeMutation.isPending || planMutation.isPending}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (!pendingAction) return;
          if (pendingAction.kind === 'active') activeMutation.mutate({ id: pendingAction.id, active: pendingAction.active }, { onSuccess: () => setPendingAction(null) });
          else planMutation.mutate({ companyId: pendingAction.id, planCode: pendingAction.plan }, { onSuccess: () => setPendingAction(null) });
        }}
      />
    </PlatformPage>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { flexGrow: 1, flexBasis: 350, minWidth:0,borderRadius: 18 },
  cardMobile: { width: '100%', flexBasis: 'auto', flexGrow: 0, flexShrink: 1 },
  content: { gap: 12,paddingTop:16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bold: { fontWeight: '800' },
  cardHeading:{flexDirection:'row',alignItems:'flex-start',gap:10},
  grow:{flex:1,minWidth:0},
  status:{alignItems:'center',gap:2},
});
