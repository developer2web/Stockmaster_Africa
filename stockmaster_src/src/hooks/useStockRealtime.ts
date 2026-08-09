import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/services/supabase/client';
import { createRealtimeTopic } from '@/services/supabase/realtime';

export function useStockRealtime(companyId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-levels', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['stock-movements', companyId] });
    };

    const channel = supabase
      .channel(createRealtimeTopic(`stock:${companyId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_levels',
          filter: `company_id=eq.${companyId}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_movements',
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
