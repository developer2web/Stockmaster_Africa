import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, HelperText, Searchbar, Switch, useTheme } from 'react-native-paper';
import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getPlatformStores, setStoreActive } from '@/features/superAdmin/api';

export default function StoresScreen() {
  const theme = useTheme();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const query = useQuery({ queryKey: ['platform-stores'], queryFn: getPlatformStores });
  const mutation = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setStoreActive(id, active), onSuccess: () => void cache.invalidateQueries({ queryKey: ['platform-stores'] }) });
  const needle = search.trim().toLowerCase();
  const items = (query.data ?? []).filter((item) => !needle || item.name.toLowerCase().includes(needle) || item.company?.name.toLowerCase().includes(needle));
  return (
    <PlatformPage title="Magasins">
      <Searchbar placeholder="Rechercher un magasin ou une entreprise" value={search} onChangeText={setSearch} />
      {query.error && <ErrorState message={query.error.message} onRetry={() => query.refetch()} />}
      {!!mutation.error && <HelperText type="error" visible>{mutation.error.message}</HelperText>}
      {!query.isLoading && !query.error && items.length === 0 && <EmptyState title="Aucun magasin" message="Aucun résultat trouvé." />}
      <View style={styles.grid}>{items.map((store) => <Card key={store.id} mode="contained" style={[styles.card, { backgroundColor: theme.colors.surface }]}><Card.Title title={store.name} subtitle={store.address || 'Adresse non renseignée'} right={() => <Switch value={store.is_active} disabled={mutation.isPending} onValueChange={(active) => setPending({ id: store.id, name: store.name, active })} />} /><Card.Content><Chip icon="office-building-outline">{store.company?.name ?? 'Entreprise inconnue'}</Chip></Card.Content></Card>)}</View>
      <ConfirmDialog visible={pending !== null} title={pending?.active ? 'Réactiver la boutique' : 'Désactiver la boutique'} message={pending?.active ? `Réactiver la boutique ${pending?.name} ?` : `Désactiver ${pending?.name} ? Les opérations de cette boutique seront bloquées.`} destructive={!pending?.active} loading={mutation.isPending} onCancel={() => setPending(null)} onConfirm={() => pending && mutation.mutate({ id: pending.id, active: pending.active }, { onSuccess: () => setPending(null) })} />
    </PlatformPage>
  );
}
const styles = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, card: { flexGrow: 1, flexBasis: 340, borderRadius: 20 } });
