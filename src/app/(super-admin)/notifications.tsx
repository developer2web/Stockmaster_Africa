import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Card, Chip, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { PlatformPage } from '@/components/superAdmin/PlatformPage';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { getPersistentNotifications, markNotificationsRead } from '@/features/notifications/api';
import { supabase } from '@/services/supabase/client';
import { createRealtimeTopic } from '@/services/supabase/realtime';

export default function SuperAdminNotifications() {
  const { session } = useAuth();
  const theme = useTheme();
  const cache = useQueryClient();
  const userId = session?.user.id ?? '';
  const query = useQuery({ queryKey: ['super-admin-notifications',userId], queryFn: () => getPersistentNotifications(undefined,userId), enabled: !!userId });
  const unread = (query.data??[]).filter((item) => !item.read_at);
  const mark = useMutation({ mutationFn: () => markNotificationsRead(unread.map((item) => item.id)), onSuccess: () => cache.invalidateQueries({ queryKey: ['super-admin-notifications',userId] }) });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(createRealtimeTopic(`super-admin-notifications:${userId}`)).on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => { void cache.invalidateQueries({ queryKey: ['super-admin-notifications',userId] }); },
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cache,userId]);

  return <PlatformPage title="Notifications">
    {unread.length>0&&<AppButton mode="outlined" icon="check-all" loading={mark.isPending} onPress={() => mark.mutate()}>Tout marquer comme lu</AppButton>}
    {!!query.error&&<HelperText type="error" visible>{query.error.message}</HelperText>}
    {(query.data??[]).map((item) => <Card key={item.id} mode={item.read_at?'outlined':'contained'} style={{backgroundColor:item.read_at?undefined:theme.colors.primaryContainer}}><Card.Content style={{flexDirection:'row',alignItems:'center',gap:12}}><Icon source={item.type.startsWith('support_')?'lifebuoy':'bell-outline'} size={28} color={theme.colors.primary}/><Text style={{flex:1}}><Text variant="titleMedium" style={{fontWeight:'800'}}>{item.title}</Text>{'\n'}{item.body}{'\n'}<Text variant="labelSmall">{new Date(item.created_at).toLocaleString('fr-CA')}</Text></Text>{!item.read_at&&<Chip>Nouveau</Chip>}</Card.Content></Card>)}
    {!query.isLoading&&!query.data?.length&&<EmptyState icon="bell-check-outline" title="Aucune notification" message="Les nouveaux tickets d’assistance apparaîtront ici immédiatement."/>}
  </PlatformPage>;
}
