import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Card, Chip, Searchbar, Switch, Text, useTheme } from 'react-native-paper';
import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { getPlatformUsers, setMembershipActive } from '@/features/superAdmin/api';

export default function UsersScreen() {
  const theme = useTheme();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['platform-users'], queryFn: getPlatformUsers });
  const mutation = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setMembershipActive(id, active), onSuccess: () => void cache.invalidateQueries({ queryKey: ['platform-users'] }) });
  const needle = search.trim().toLowerCase();
  const items = (query.data ?? []).filter((item) => !needle || item.full_name.toLowerCase().includes(needle) || item.email.toLowerCase().includes(needle) || item.company_name.toLowerCase().includes(needle));
  return (
    <PlatformPage title="Utilisateurs">
      <Searchbar placeholder="Nom, email ou entreprise" value={search} onChangeText={setSearch} />
      {query.error && <ErrorState message={query.error.message} onRetry={() => query.refetch()} />}
      {!query.isLoading && !query.error && items.length === 0 && <EmptyState title="Aucun utilisateur" message="Aucun résultat trouvé." />}
      {items.map((user) => (
        <Card key={user.membership_id} mode="contained" style={{ backgroundColor: theme.colors.surface }}>
          <Card.Title title={user.full_name || 'Utilisateur'} subtitle={user.email} right={() => <Switch value={user.is_active} disabled={mutation.isPending} onValueChange={(active) => mutation.mutate({ id: user.membership_id, active })} />} />
          <Card.Content style={styles.row}><Chip icon="office-building-outline">{user.company_name}</Chip><Chip icon="badge-account-outline">{user.role_name}</Chip>{user.store_name && <Chip icon="store-outline">{user.store_name}</Chip>}<Text style={{ color: theme.colors.onSurfaceVariant }}>Ajouté le {new Date(user.created_at).toLocaleDateString('fr-CA')}</Text></Card.Content>
        </Card>
      ))}
    </PlatformPage>
  );
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 } });
