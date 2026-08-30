import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Card, Chip, HelperText, Icon, Snackbar, Text, TextInput } from 'react-native-paper';
import { SelectField } from '@/components/forms/SelectField';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { createTicket, getMyTickets } from '@/features/support/api';
import { supabase } from '@/services/supabase/client';
import { createRealtimeTopic } from '@/services/supabase/realtime';
import { formatDateTime } from '@/utils/format';

const statusLabels: Record<string,string> = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé' };

export default function SupportScreen() {
  const { membership } = useAuth();
  const cache = useQueryClient();
  const company = membership?.companyId ?? '';
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string | null>('normal');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'closed'>('all');
  const [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['my-support-tickets', company], queryFn: () => getMyTickets(company), enabled: !!company });

  useEffect(() => {
    if (!company) return;
    const channel = supabase.channel(createRealtimeTopic(`support:${company}`)).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_tickets', filter: `company_id=eq.${company}` },
      () => { void cache.invalidateQueries({ queryKey: ['my-support-tickets', company] }); },
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cache, company]);

  const filteredTickets = (query.data ?? []).filter((ticket) => statusFilter === 'all' || ticket.status === statusFilter);

  const create = useMutation({ mutationFn: () => createTicket(company, subject.trim(), description.trim(), priority!), onSuccess: async () => {
    await cache.invalidateQueries({ queryKey: ['my-support-tickets', company] });
    setOpen(false); setSubject(''); setDescription(''); setPriority('normal');
    setNotice('Votre demande a été envoyée au support StockMaster.');
  }});

  return <AdminPage title="Centre d’assistance" action={<AppButton compact icon="plus" onPress={() => setOpen(true)}>Nouvelle demande</AppButton>}>
    <Card mode="contained"><Card.Title title="Support du propriétaire" subtitle="Signalez un problème et suivez les réponses de StockMaster" left={() => <Icon source="lifebuoy" size={30}/>} titleNumberOfLines={2} subtitleNumberOfLines={2}/></Card>
    <Card mode="outlined"><Card.Content style={{ gap: 10 }}>
      <Text variant="titleMedium">Questions fréquentes</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {['Paiement', 'Stock', 'Caisse', 'Facturation', 'Compte'].map((label) => (
          <Chip key={label} selected={subject === label} onPress={() => setSubject(label)}>{label}</Chip>
        ))}
      </View>
      <SelectField label="Filtrer par statut" value={statusFilter} onChange={(value) => setStatusFilter((value as typeof statusFilter) ?? 'all')} options={[{ label: 'Tous', value: 'all' }, { label: 'Ouvert', value: 'open' }, { label: 'En cours', value: 'in_progress' }, { label: 'Résolu', value: 'resolved' }, { label: 'Fermé', value: 'closed' }]} />
    </Card.Content></Card>
    {open && <Card mode="contained"><Card.Title title="Contacter le support StockMaster"/><Card.Content style={{gap:10}}><TextInput mode="outlined" label="Sujet" value={subject} onChangeText={setSubject}/><TextInput mode="outlined" label="Décrivez précisément le problème" value={description} onChangeText={setDescription} multiline numberOfLines={5}/><SelectField label="Priorité" value={priority} onChange={setPriority} options={[{label:'Faible',value:'low'},{label:'Normale',value:'normal'},{label:'Haute',value:'high'},{label:'Urgente',value:'urgent'}]}/><HelperText type="error" visible={!!create.error}>{create.error?.message}</HelperText><AppButton mode="text" disabled={create.isPending} onPress={() => setOpen(false)}>Annuler</AppButton><AppButton loading={create.isPending} disabled={subject.trim().length<3||description.trim().length<10||!priority} onPress={() => create.mutate()}>Envoyer au support</AppButton></Card.Content></Card>}
    {query.isLoading && <Text>Chargement de vos demandes…</Text>}
    {filteredTickets.map((ticket) => <Card key={ticket.id} mode="outlined"><Card.Title title={ticket.subject} titleNumberOfLines={2} subtitle={formatDateTime(ticket.created_at)} right={() => <Chip style={{marginRight:12}}>{statusLabels[ticket.status]??ticket.status}</Chip>}/><Card.Content><Text>{ticket.description}</Text>{!!ticket.resolution&&<Text style={{fontWeight:'700',marginTop:10}}>Réponse : {ticket.resolution}</Text>}</Card.Content></Card>)}
    {!query.isLoading&&!query.error&&!filteredTickets.length&&<EmptyState icon="lifebuoy" title="Aucune demande" message="Créez une demande pour contacter le support StockMaster."/>}
    <HelperText type="error" visible={!!query.error}>{query.error?.message}</HelperText>
    <Snackbar visible={!!notice} onDismiss={() => setNotice('')}>{notice}</Snackbar>
  </AdminPage>;
}
