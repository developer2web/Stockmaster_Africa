import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';

export async function requestAccountDeletion(reason: string) {
  const { error } = await supabase.rpc('request_account_deletion', {
    p_reason: reason.trim() || null,
  });
  if (error) throw new Error(userErrorMessage(error));
}
