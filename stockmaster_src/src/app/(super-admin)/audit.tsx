import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, Searchbar, Text, useTheme } from 'react-native-paper';
import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { getPlatformAudit } from '@/features/superAdmin/api';

const labels: Record<string, string> = { insert: 'Création', update: 'Modification', delete: 'Suppression' };
export default function AuditScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['platform-audit'], queryFn: getPlatformAudit });
  const needle = search.trim().toLowerCase();
  const items = (query.data ?? []).filter((item) => !needle || item.entity_type.toLowerCase().includes(needle) || item.company?.name.toLowerCase().includes(needle) || item.actor?.full_name.toLowerCase().includes(needle));
  return (
    <PlatformPage title="Journal d’activité">
      <Searchbar placeholder="Entreprise, utilisateur ou type d’objet" value={search} onChangeText={setSearch} />
      {query.error && <ErrorState message={query.error.message} onRetry={() => query.refetch()} />}
      {!query.isLoading && !query.error && items.length === 0 && <EmptyState title="Aucune activité" message="Le journal ne contient aucun événement correspondant." />}
      {items.map((log) => <Card key={log.id} mode="contained" style={{ backgroundColor: theme.colors.surface }}><Card.Content style={styles.row}><Chip icon={log.action === 'delete' ? 'delete-outline' : log.action === 'insert' ? 'plus-circle-outline' : 'pencil-outline'}>{labels[log.action] ?? log.action}</Chip><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{log.entity_type}</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>{log.company?.name ?? 'Entreprise'} · {log.actor?.full_name || 'Système'}</Text></View><Text style={{ color: theme.colors.onSurfaceVariant }}>{new Date(log.created_at).toLocaleString('fr-CA')}</Text></Card.Content></Card>)}
    </PlatformPage>
  );
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }, copy: { flex: 1, minWidth: 180 }, bold: { fontWeight: '700' } });
