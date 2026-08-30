import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Card, Chip, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { getInternalNotifications, getPersistentNotifications, markNotificationsRead } from '@/features/notifications/api';
import { supabase } from '@/services/supabase/client';
import { createRealtimeTopic } from '@/services/supabase/realtime';
import { formatDateTime } from '@/utils/format';

export default function NotificationsScreen() {
  const { membership } = useAuth();
  const theme = useTheme();
  const cache = useQueryClient();
  const company = membership?.companyId ?? '';
  const store = membership?.storeId ?? '';
  const query = useQuery({ queryKey: ['internal-notifications', store], queryFn: () => getInternalNotifications(store), enabled: !!store });
  const persistent = useQuery({ queryKey: ['persistent-notifications', company], queryFn: () => getPersistentNotifications(company), enabled: !!company });
  const unread = (persistent.data ?? []).filter((item) => !item.read_at);
  const mark = useMutation({ mutationFn: () => markNotificationsRead(unread.map((item) => item.id)), onSuccess: () => cache.invalidateQueries({ queryKey: ['persistent-notifications', company] }) });

  useEffect(() => {
    if (!company) return;
    const channel = supabase.channel(createRealtimeTopic(`notifications:${company}`)).on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `company_id=eq.${company}` },
      () => { void cache.invalidateQueries({ queryKey: ['persistent-notifications', company] }); },
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cache, company]);

  const icon = (type: string) => type === 'stock_out' ? 'alert-octagon' : type === 'low_stock' ? 'alert-outline' : type === 'customer_debt' ? 'account-cash-outline' : type === 'supplier_debt' ? 'truck-alert-outline' : type === 'cash_unclosed' ? 'cash-register' : type.startsWith('support_') ? 'lifebuoy' : type.startsWith('subscription_') ? 'credit-card-check-outline' : 'bell-outline';
  return <AdminPage title="Notifications" action={unread.length ? <AppButton compact mode="text" loading={mark.isPending} onPress={() => mark.mutate()}>Tout marquer comme lu</AppButton> : undefined}>
    {!!query.error && <HelperText type="error" visible>{query.error.message}</HelperText>}
    {!!persistent.error && <HelperText type="error" visible>{persistent.error.message}</HelperText>}
    {persistent.data?.map((item) => <Card key={item.id} mode={item.read_at ? 'outlined' : 'contained'} style={{ backgroundColor: item.read_at ? undefined : theme.colors.primaryContainer }}><Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon source={icon(item.type)} size={28} color={theme.colors.primary}/><Text style={{ flex: 1 }}><Text variant="titleMedium">{item.title}</Text>{'\n'}{item.body}{'\n'}<Text variant="labelSmall">{formatDateTime(item.created_at)}</Text></Text>{!item.read_at && <Chip>Nouveau</Chip>}</Card.Content></Card>)}
    {query.data?.map((item) => <Card key={`live-${item.id}`} mode="outlined"><Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon source={icon(item.type)} size={28} color={item.severity === '3' ? '#C92A2A' : item.severity === '2' ? '#E67700' : '#1971C2'}/><Text style={{ flex: 1 }}><Text variant="titleMedium">{item.title}</Text>{'\n'}{item.body}</Text><Chip>{item.severity === '3' ? 'Urgent' : 'À voir'}</Chip></Card.Content></Card>)}
    {!query.isLoading && !persistent.isLoading && !query.data?.length && !persistent.data?.length && <EmptyState icon="bell-check-outline" title="Tout va bien" message="Aucune nouvelle notification pour cette boutique."/>}
  </AdminPage>;
}
