import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Searchbar, Switch, Text, useTheme } from 'react-native-paper';

import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FilterMenu } from '@/components/superAdmin/FilterMenu';
import {
  getPlatformCompanies,
  setCompanyActive,
  setCompanyPlan,
} from '@/features/superAdmin/api';

export default function CompaniesScreen() {
  const theme = useTheme();
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

  return (
    <PlatformPage title="Entreprises et abonnements">
      <Searchbar
        placeholder="Rechercher une entreprise"
        value={search}
        onChangeText={setSearch}
      />
      <View style={styles.filterBar}>
        <FilterMenu label="Statut" value={status} onChange={(value) => setStatus(value as typeof status)} options={[{label:'Tous les statuts',value:'all'},{label:'Actives',value:'active'},{label:'Suspendues',value:'suspended'}]} />
        <FilterMenu label="Forfait" value={plan} onChange={(value) => setPlan(value as typeof plan)} options={[{label:'Tous les forfaits',value:'all'},{label:'Basic',value:'basic'},{label:'Pro',value:'pro'},{label:'Premium',value:'premium'}]} />
        {(status !== 'all' || plan !== 'all') && <Button compact onPress={() => { setStatus('all'); setPlan('all'); }}>Réinitialiser</Button>}
      </View>
      {!!activeMutation.error && <Text style={{ color: theme.colors.error }}>{activeMutation.error.message}</Text>}
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
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <Card.Title
              title={company.name}
              subtitle={company.slug || 'Aucun identifiant public'}
              right={() => (
                <Switch
                  value={company.is_active}
                  disabled={activeMutation.isPending}
                  onValueChange={(active) =>
                    setPendingAction({ kind: 'active', id: company.id, name: company.name, active })}
                />
              )}
            />
            <Card.Content style={styles.content}>
              <View style={styles.chips}>
                <Chip icon="store-outline">{company.store_count} boutiques</Chip>
                <Chip icon="account-group-outline">{company.user_count} utilisateurs</Chip>
              </View>
              <Text variant="titleLarge" style={styles.bold}>
                {new Intl.NumberFormat('fr-CA', {
                  style: 'currency',
                  currency: company.currency_code,
                  currencyDisplay: 'code',
                }).format(Number(company.revenue))}
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                {company.sale_count} ventes · créée le{' '}
                {new Date(company.created_at).toLocaleDateString('fr-CA')}
              </Text>
              <Chip compact icon="credit-card-outline">
                {(company.plan_code ?? 'Aucun forfait').toUpperCase()} ·{' '}
                {company.subscription_status ?? 'inactif'}
              </Chip>
              <Text variant="labelLarge">Attribuer un forfait pendant 30 jours</Text>
              <View style={styles.chips}>
                {(['basic', 'pro', 'premium'] as const).map((planCode) => (
                  <Chip
                    key={planCode}
                    selected={company.plan_code === planCode}
                    disabled={planMutation.isPending}
                    onPress={() =>
                      setPendingAction({ kind: 'plan', id: company.id, name: company.name, plan: planCode })}
                  >
                    {planCode.toUpperCase()}
                  </Chip>
                ))}
              </View>
              {!!planMutation.error && (
                <Text style={{ color: theme.colors.error }}>{planMutation.error.message}</Text>
              )}
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
  card: { flexGrow: 1, flexBasis: 350, borderRadius: 20 },
  content: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bold: { fontWeight: '800' },
});
