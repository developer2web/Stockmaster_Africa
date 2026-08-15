import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Chip, HelperText, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { AppButton } from '@/components/ui/AppButton';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { getAppErrors, getCompanyHealth, getSupportTickets, updateSupportTicket, type SupportTicket } from '@/features/superAdmin/api';

export default function OperationsScreen() {
  const cache = useQueryClient();
  const { width } = useWindowDimensions();
  const mobile = width < 600;
  const [section, setSection] = useState('health');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [resolution, setResolution] = useState('');
  const health = useQuery({ queryKey: ['company-health'], queryFn: getCompanyHealth, enabled: section === 'health' });
  const tickets = useQuery({ queryKey: ['support-tickets'], queryFn: getSupportTickets, enabled: section === 'tickets' });
  const errors = useQuery({ queryKey: ['app-errors'], queryFn: getAppErrors, enabled: section === 'errors' });
  const update = useMutation({ mutationFn: (status: SupportTicket['status']) => updateSupportTicket(selected!.id, status, resolution), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ['support-tickets'] }); setSelected(null); setResolution(''); } });
  const activeQuery = section === 'health' ? health : section === 'tickets' ? tickets : errors;

  return <PlatformPage title="Centre opérationnel">
    <SegmentedButtons value={section} onValueChange={setSection} buttons={[{ value: 'health', label: mobile ? 'Santé' : 'Santé des entreprises', icon: 'heart-pulse' }, { value: 'tickets', label: 'Support', icon: 'lifebuoy' }, { value: 'errors', label: 'Erreurs', icon: 'alert-octagon-outline' }]} />
    {activeQuery.isLoading && <LoadingScreen label="Chargement…" />}
    {section === 'health' && (health.data ?? []).map(item => {
      const healthy = item.is_active && Number(item.fatal_count_7d) === 0;
      return <Card key={item.company_id} mode="outlined"><Card.Content style={styles.stack}><View style={styles.heading}><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{item.company_name}</Text><Text variant="bodySmall">Dernière vente : {item.last_sale_at ? new Date(item.last_sale_at).toLocaleString('fr-CA') : 'aucune'}</Text></View><Chip compact icon={healthy ? 'check-circle' : 'alert-circle'}>{healthy ? 'Stable' : 'À vérifier'}</Chip></View><View style={styles.row}><Chip>{item.subscription_status ?? 'Sans abonnement'}</Chip><Chip icon="alert">{item.error_count_7d} erreurs</Chip><Chip icon="lifebuoy">{item.open_tickets} tickets</Chip></View></Card.Content></Card>;
    })}
    {section === 'tickets' && (tickets.data ?? []).map(ticket => <Card key={ticket.id} mode="outlined" onPress={() => { setSelected(ticket); setResolution(ticket.resolution ?? ''); }}><Card.Content style={styles.stack}><View style={styles.heading}><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{ticket.subject}</Text><Text variant="bodySmall">{ticket.company?.name ?? 'Entreprise'} · {new Date(ticket.created_at).toLocaleString('fr-CA')}</Text></View><Chip compact>{ticket.priority}</Chip></View><Text numberOfLines={3}>{ticket.description}</Text><Chip compact style={styles.selfStart}>{ticket.status}</Chip></Card.Content></Card>)}
    {section === 'errors' && (errors.data ?? []).map(error => <Card key={error.id} mode="outlined"><Card.Content style={styles.stack}><View style={styles.heading}><View style={styles.copy}><Text variant="titleMedium" style={styles.bold}>{error.code}</Text><Text variant="bodySmall">{error.company?.name ?? 'Sans entreprise'} · {error.platform ?? '?'} {error.app_version ?? ''}</Text></View><Chip compact>{error.severity}</Chip></View><Text>{error.message}</Text><Text variant="labelSmall">{new Date(error.created_at).toLocaleString('fr-CA')}</Text></Card.Content></Card>)}
    <HelperText type="error" visible={!!activeQuery.error}>{activeQuery.error?.message}</HelperText>
    {selected && <Card mode="contained"><Card.Content style={styles.stack}><Text variant="titleMedium" style={styles.bold}>Traiter : {selected.subject}</Text><TextInput mode="outlined" label="Réponse / résolution" value={resolution} onChangeText={setResolution} multiline /><View style={styles.actions}><AppButton mode="outlined" loading={update.isPending && update.variables === 'in_progress'} disabled={update.isPending} onPress={() => update.mutate('in_progress')}>Prendre en charge</AppButton><AppButton loading={update.isPending && update.variables === 'resolved'} disabled={update.isPending} onPress={() => update.mutate('resolved')}>Résoudre</AppButton><AppButton mode="text" disabled={update.isPending} onPress={() => setSelected(null)}>Fermer</AppButton></View><HelperText type="error" visible={!!update.error}>{update.error?.message}</HelperText></Card.Content></Card>}
  </PlatformPage>;
}

const styles = StyleSheet.create({ stack: { gap: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, copy: { flex: 1, minWidth: 0, gap: 2 }, bold: { fontWeight: '800' }, selfStart: { alignSelf: 'flex-start' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
