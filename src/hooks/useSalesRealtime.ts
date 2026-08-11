import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/services/supabase/client';
import { createRealtimeTopic } from '@/services/supabase/realtime';

export function useSalesRealtime(companyId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['sales', companyId] });
    };

    const channel = supabase
      .channel(createRealtimeTopic(`sales:${companyId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales',
          filter: `company_id=eq.${companyId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);
}
