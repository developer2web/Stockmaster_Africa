import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, Chip, Searchbar, Text } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase/client';
import { formatDateTime } from '@/utils/format';
import { FeatureGate } from '@/components/subscriptions/FeatureGate';

export default function ActivityScreen() {
  const { membership } = useAuth();
  const [search, setSearch] = useState('');
  const companyId = membership?.companyId ?? '';
  const query = useQuery({ queryKey: ['company-activity', companyId], queryFn: async () => {
    const { data, error } = await supabase.from('audit_logs').select('id,action,entity_type,payload,created_at,actor:profiles!audit_logs_actor_id_fkey(full_name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((item) => ({ ...item, actor: Array.isArray(item.actor) ? item.actor[0] ?? null : item.actor })) as unknown as { id: string; action: string; entity_type: string; payload: Record<string, unknown>; created_at: string; actor: { full_name: string } | null }[];
  }, enabled: !!companyId && membership?.role === 'company_admin' });
  const term = search.trim().toLowerCase();
  const rows = (query.data ?? []).filter((item) => !term || `${item.action} ${item.entity_type} ${item.actor?.full_name ?? ''}`.toLowerCase().includes(term));
  return <FeatureGate feature="audit_log" label="Le journal d’activité"><AdminPage title="Journal d’activité" description="Suivez les opérations importantes de votre entreprise."><Searchbar placeholder="Rechercher une action ou un utilisateur…" value={search} onChangeText={setSearch} />{query.error && <Text>{query.error.message}</Text>}{query.isLoading && <Text>Chargement du journal…</Text>}{rows.map((item) => <Card key={item.id} mode="outlined"><Card.Title title={item.action.replaceAll('_', ' ')} subtitle={`${item.entity_type} · ${formatDateTime(item.created_at)}`} left={() => <Chip>{item.actor?.full_name ?? 'Système'}</Chip>} /><Card.Content>{Object.keys(item.payload ?? {}).length > 0 && <Text>{Object.entries(item.payload).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}</Text>}</Card.Content></Card>)}{!query.isLoading && !rows.length && <EmptyState icon="history" title="Aucune activité" message={term ? 'Aucune activité ne correspond à votre recherche.' : 'Les opérations importantes apparaîtront ici.'}/>}</AdminPage></FeatureGate>;
}
