import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, Switch, Text, useTheme } from 'react-native-paper';
import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FilterMenu } from '@/components/superAdmin/FilterMenu';
import { getPlatformUsers, setMembershipActive } from '@/features/superAdmin/api';
import { AppSearchBar } from '@/components/ui/AppSearchBar';
import { AppButton } from '@/components/ui/AppButton';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatDate } from '@/utils/format';

export default function UsersScreen() {
  const theme = useTheme();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [company, setCompany] = useState('all');
  const [role, setRole] = useState('all');
  const [pending, setPending] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const query = useQuery({ queryKey: ['platform-users'], queryFn: getPlatformUsers });
  const mutation = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setMembershipActive(id, active), onSuccess: () => void cache.invalidateQueries({ queryKey: ['platform-users'] }) });
  const needle = search.trim().toLowerCase();
  const companies = [...new Set((query.data ?? []).map((item) => item.company_name))].sort();
  const roles = [...new Set((query.data ?? []).map((item) => item.role_name))].sort();
  const items = (query.data ?? []).filter((item) =>
    (!needle || item.full_name.toLowerCase().includes(needle) || item.email.toLowerCase().includes(needle) || item.company_name.toLowerCase().includes(needle)) &&
    (status === 'all' || (status === 'active' ? item.is_active : !item.is_active)) &&
    (company === 'all' || item.company_name === company) &&
    (role === 'all' || item.role_name === role));
  if (query.isLoading) return <LoadingScreen label="Chargement des utilisateurs…" />;
  return (
    <PlatformPage title="Utilisateurs">
      <AppSearchBar placeholder="Nom, email ou entreprise" value={search} onChangeText={setSearch} />
      <View style={styles.filters}>
        <FilterMenu label="Statut" value={status} onChange={(value) => setStatus(value as typeof status)} options={[{label:'Tous les statuts',value:'all'},{label:'Actifs',value:'active'},{label:'Suspendus',value:'suspended'}]} />
        <FilterMenu label="Entreprise" value={company} onChange={setCompany} options={[{label:'Toutes les entreprises',value:'all'},...companies.map((value)=>({label:value,value}))]} />
        <FilterMenu label="Rôle" value={role} onChange={setRole} options={[{label:'Tous les rôles',value:'all'},...roles.map((value)=>({label:value,value}))]} />
        {(search||status !== 'all' || company !== 'all' || role !== 'all') && <AppButton mode="outlined" icon="filter-remove-outline" onPress={() => {setSearch('');setStatus('all');setCompany('all');setRole('all');}}>Réinitialiser</AppButton>}
      </View>
      {query.error && <ErrorState message={query.error.message} onRetry={() => query.refetch()} />}
      {!!mutation.error && <Text style={{ color: theme.colors.error }}>{mutation.error.message}</Text>}
      {!query.isLoading && !query.error && items.length === 0 && <EmptyState title="Aucun utilisateur" message="Aucun résultat trouvé." />}
      {items.map((user) => (
        <Card key={user.membership_id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
          <Card.Content style={styles.content}><View style={styles.heading}><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{user.full_name||'Utilisateur'}</Text><Text selectable variant="bodySmall" style={{color:theme.colors.onSurfaceVariant}}>{user.email}</Text></View><View style={styles.status}><StatusChip status={user.is_active?'active':'suspended'}/><Switch value={user.is_active} disabled={mutation.isPending} onValueChange={(active)=>setPending({id:user.membership_id,name:user.full_name||user.email,active})}/></View></View><View style={styles.row}><Chip icon="office-building-outline">{user.company_name}</Chip><Chip icon="badge-account-outline">{user.role_name}</Chip>{user.store_name&&<Chip icon="store-outline">{user.store_name}</Chip>}</View><Text variant="bodySmall" style={{color:theme.colors.onSurfaceVariant}}>Ajouté le {formatDate(user.created_at)}</Text></Card.Content>
        </Card>
      ))}
      <ConfirmDialog visible={pending !== null} title={pending?.active ? 'Réactiver l’utilisateur' : 'Suspendre l’utilisateur'} message={pending?.active ? `Réactiver l’accès de ${pending?.name} ?` : `Suspendre ${pending?.name} ? La session sera refusée au prochain contrôle d’accès.`} destructive={!pending?.active} loading={mutation.isPending} onCancel={() => setPending(null)} onConfirm={() => pending && mutation.mutate({ id: pending.id, active: pending.active }, { onSuccess: () => setPending(null) })} />
    </PlatformPage>
  );
}
const styles = StyleSheet.create({content:{gap:12,paddingTop:16},heading:{flexDirection:'row',alignItems:'flex-start',gap:10},copy:{flex:1,minWidth:0,gap:2},status:{alignItems:'center'},bold:{fontWeight:'800'},row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
