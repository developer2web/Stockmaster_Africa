import { useActiveNotifications } from '@/features/notifications/useActiveNotifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Badge } from 'react-native-paper';

import { useAuth } from '@/features/auth/AuthProvider';
import { getPersistentNotifications } from '@/features/notifications/api';
import { createRealtimeTopic } from '@/services/supabase/realtime';
import { supabase } from '@/services/supabase/client';
import { canUseNotifications, notificationQueryKey, notificationRoute } from '@/features/notifications/access';

export function NotificationBell({color}:{color?:string}){
  const {membership,session}=useAuth();
  const cache=useQueryClient();
  const companyId=membership?.companyId??'';
  const userId=session?.user.id??'';
  const enabled=canUseNotifications(membership)&&!!userId;
  const query=useQuery({queryKey:notificationQueryKey(membership,userId),queryFn:()=>getPersistentNotifications(companyId,membership?.role==='employee'?userId:undefined),enabled,staleTime:20_000,refetchInterval:60_000});
  const active=useActiveNotifications(query.data);
  const unread=active.filter(item=>!item.read_at).length;

  useEffect(()=>{
    if(!enabled)return;
    const channel=supabase.channel(createRealtimeTopic(`notification-bell:${companyId}`)).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`company_id=eq.${companyId}`},()=>{void cache.invalidateQueries({queryKey:['persistent-notifications',companyId]});}).subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[cache,companyId,enabled]);

  if(!enabled)return null;
  return <View style={styles.wrap}><Appbar.Action icon="bell-outline" color={color} accessibilityLabel={unread?`Notifications, ${unread} non lue${unread>1?'s':''}`:'Notifications'} onPress={()=>router.push(notificationRoute(membership) as never)}/>{unread>0&&<Badge visible style={styles.badge}>{unread>99?'99+':unread}</Badge>}</View>;
}

const styles=StyleSheet.create({wrap:{position:'relative'},badge:{position:'absolute',right:2,top:3,minWidth:19,height:19,fontSize:10,fontWeight:'900'}});
