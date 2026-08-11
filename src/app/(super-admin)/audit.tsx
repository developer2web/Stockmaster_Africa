import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Searchbar, Text, useTheme } from 'react-native-paper';
import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { getPlatformAudit } from '@/features/superAdmin/api';
import { FilterMenu } from '@/components/superAdmin/FilterMenu';

const labels: Record<string, string> = { insert: 'Création', update: 'Modification', delete: 'Suppression' };
export default function AuditScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [company, setCompany] = useState('all');
  const query = useQuery({ queryKey: ['platform-audit'], queryFn: getPlatformAudit });
  const needle = search.trim().toLowerCase();
  const companies = [...new Set((query.data ?? []).map((item) => item.company?.name).filter((name): name is string => !!name))].sort();
  const items = (query.data ?? []).filter((item) =>
    (!needle || item.entity_type.toLowerCase().includes(needle) || (item.company?.name ?? '').toLowerCase().includes(needle) || (item.actor?.full_name ?? '').toLowerCase().includes(needle)) &&
    (action === 'all' || item.action === action) &&
    (company === 'all' || item.company?.name === company));
  const days = items.reduce<Record<string, typeof items>>((result, item) => {
    const key = new Date(item.created_at).toLocaleDateString('fr-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    (result[key] ??= []).push(item);
    return result;
  }, {});
  return (
    <PlatformPage title="Journal d’activité">
      <Searchbar placeholder="Entreprise, utilisateur ou type d’objet" value={search} onChangeText={setSearch} />
      <View style={styles.filters}>
        <FilterMenu label="Action" value={action} onChange={setAction} options={[{label:'Toutes les actions',value:'all'},{label:'Créations',value:'insert'},{label:'Modifications',value:'update'},{label:'Suppressions',value:'delete'}]} />
        <FilterMenu label="Entreprise" value={company} onChange={setCompany} options={[{label:'Toutes les entreprises',value:'all'},...companies.map((value)=>({label:value,value}))]} />
        {(action !== 'all' || company !== 'all') && <Button compact onPress={() => { setAction('all'); setCompany('all'); }}>Réinitialiser</Button>}
      </View>
      {query.error && <ErrorState message={query.error.message} onRetry={() => query.refetch()} />}
      {!query.isLoading && !query.error && items.length === 0 && <EmptyState title="Aucune activité" message="Le journal ne contient aucun événement correspondant." />}
      {Object.entries(days).map(([day, logs]) => <View key={day} style={styles.day}><View style={styles.dayTitle}><Text variant="titleMedium" style={styles.bold}>{day}</Text><Chip compact>{logs.length} activité(s)</Chip></View>{logs.map((log) => <Card key={log.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}><Card.Content style={styles.row}><Chip icon={log.action === 'delete' ? 'delete-outline' : log.action === 'insert' ? 'plus-circle-outline' : 'pencil-outline'}>{labels[log.action] ?? log.action}</Chip><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{log.entity_type}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{log.company?.name ?? 'Entreprise'} · {log.actor?.full_name || 'Système'}</Text></View><Text style={{ color: theme.colors.onSurfaceVariant }}>{new Date(log.created_at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}</Text></Card.Content></Card>)}</View>)}
    </PlatformPage>
  );
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }, copy: { flex: 1, minWidth: 180 }, bold: { fontWeight: '700' }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, day: { gap: 8 }, dayTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 } });
