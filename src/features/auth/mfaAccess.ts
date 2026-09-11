import type { SupabaseClient } from '@supabase/supabase-js';

export async function needsMfaChallenge(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}
