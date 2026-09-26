import { useActiveNotifications } from '@/features/notifications/useActiveNotifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Card, Chip, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { AdminPage } from '@/components/ui/AdminPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { getPersistentNotifications, markNotificationsRead } from '@/features/notifications/api';
import { supabase } from '@/services/supabase/client';
import { createRealtimeTopic } from '@/services/supabase/realtime';
import { formatDateTime } from '@/utils/format';
import { canUseNotifications, notificationQueryKey, notificationTarget } from '@/features/notifications/access';

export default function NotificationsScreen() {
  const { membership, session } = useAuth();
  const theme = useTheme();
  const cache = useQueryClient();
  const company = membership?.companyId ?? '';
  const userId=session?.user.id??'';
  const persistent = useQuery({ queryKey: notificationQueryKey(membership,userId), queryFn: () => getPersistentNotifications(company,membership?.role==='employee'?userId:undefined), enabled: canUseNotifications(membership)&&!!userId, refetchInterval: 60_000 });
  const activeNotifications = useActiveNotifications(persistent.data);
  const unread = activeNotifications.filter((item) => !item.read_at);
  const mark = useMutation({ meta: { allowReadOnly: true }, mutationFn: () => markNotificationsRead(company), onSuccess: () => cache.invalidateQueries({ queryKey: ['persistent-notifications', company] }) });

  useEffect(() => {
    if (!company) return;
    const channel = supabase.channel(createRealtimeTopic(`notifications:${company}`)).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `company_id=eq.${company}` },
      () => { void cache.invalidateQueries({ queryKey: ['persistent-notifications', company] }); },
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cache, company]);

  const icon = (type: string) => type === 'stock_out' ? 'alert-octagon' : type === 'low_stock' ? 'alert-outline' : type === 'customer_debt' ? 'account-cash-outline' : type === 'supplier_debt' ? 'truck-alert-outline' : type === 'cash_unclosed' ? 'cash-register' : type === 'employee_access_removal_request' ? 'account-arrow-left-outline' : type === 'employee_access_removal_rejected' ? 'account-cancel-outline' : type === 'negative_stock' ? 'alert-outline' : type.startsWith('support_') ? 'lifebuoy' : type.startsWith('subscription_') ? 'credit-card-check-outline' : 'bell-outline';
  return <AdminPage title="Notifications" description="Les notifications sont supprimées automatiquement après 48 heures." action={unread.length ? <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8}}><Chip icon="bell-badge-outline">{unread.length} non lue{unread.length>1?'s':''}</Chip><AppButton compact mode="text" loading={mark.isPending} disabled={mark.isPending} onPress={() => mark.mutate()}>Tout marquer comme lu</AppButton></View> : undefined}>
    {!!mark.error && <HelperText type="error" visible>{mark.error.message}</HelperText>}
    {!!persistent.error && <HelperText type="error" visible>{persistent.error.message}</HelperText>}
    {activeNotifications.map((item) => {
      // Retour testeur du 26/09 : cliquable quand une page concernée existe (voir notificationTarget).
      const target = notificationTarget(item.type, membership);
      return <Card key={item.id} mode={item.read_at ? 'outlined' : 'contained'} style={{ backgroundColor: item.read_at ? undefined : theme.colors.primaryContainer }} onPress={target ? () => router.push(target as never) : undefined} accessibilityLabel={target ? `${item.title}. Ouvrir la page concernée` : undefined}><Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon source={icon(item.type)} size={28} color={theme.colors.primary}/><Text style={{ flex: 1 }}><Text variant="titleMedium">{item.title}</Text>{'\n'}{item.body}{'\n'}<Text variant="labelSmall">{formatDateTime(item.created_at)}</Text></Text>{!item.read_at && <Chip>Nouveau</Chip>}{!!target && <Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant}/>}</Card.Content></Card>;
    })}
    {!persistent.isLoading && !persistent.error && !activeNotifications.length && <EmptyState icon="bell-check-outline" title="Tout va bien" message="Aucune notification au cours des dernières 48 heures."/>}
  </AdminPage>;
}
