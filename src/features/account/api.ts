import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';

export async function requestAccountDeletion(reason: string) {
  const { error } = await supabase.rpc('request_account_deletion', {
    p_reason: reason.trim() || null,
  });
  if (error) throw new Error(userErrorMessage(error));
}

export type AccountDeletionRequest = {
  id: string;
  reason: string | null;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'cancelled';
  requestedAt: string;
  processedAt: string | null;
};

export async function getMyAccountDeletionRequest(): Promise<AccountDeletionRequest | null> {
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('id,reason,status,requested_at,processed_at')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(userErrorMessage(error));
  if (!data) return null;
  return {
    id: data.id,
    reason: data.reason,
    status: data.status,
    requestedAt: data.requested_at,
    processedAt: data.processed_at,
  } as AccountDeletionRequest;
}

export async function changePasswordWithVerification(currentPassword: string, newPassword: string) {
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user?.email) throw new Error('Votre session doit être renouvelée. Reconnectez-vous puis réessayez.');
  const { error: verificationError } = await supabase.auth.signInWithPassword({
    email: userResult.user.email,
    password: currentPassword,
  });
  if (verificationError) throw new Error('Le mot de passe actuel est incorrect.');
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
    data: { ...userResult.user.user_metadata, must_change_password: false },
  });
  if (updateError) throw new Error(userErrorMessage(updateError));
}

export async function replaceTemporaryPassword(newPassword: string) {
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user) throw new Error('Votre session doit être renouvelée. Reconnectez-vous puis réessayez.');
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    data: { ...userResult.user.user_metadata, must_change_password: false },
  });
  if (error) throw new Error(userErrorMessage(error));
}

export type AdminAccessRequest = { id:string;company_name:string;store_name:string;country_code:string;status:'pending'|'approved'|'rejected'|'completed'|'cancelled';review_reason:string|null;created_at:string };
export async function getMyAdminAccessRequest(){const{data,error}=await supabase.from('admin_access_requests').select('id,company_name,store_name,country_code,status,review_reason,created_at').order('created_at',{ascending:false}).limit(1).maybeSingle();if(error)throw new Error(userErrorMessage(error));return data as AdminAccessRequest|null}
export async function requestAdminAccess(input:{companyName:string;storeName:string;countryCode:string}){const{data,error}=await supabase.rpc('request_admin_access',{p_company_name:input.companyName,p_store_name:input.storeName,p_country_code:input.countryCode});if(error)throw new Error(userErrorMessage(error));return data as string}
export async function finalizeAdminAccess(requestId:string){const{data,error}=await supabase.rpc('finalize_approved_admin_access',{p_request_id:requestId});if(error)throw new Error(userErrorMessage(error));return data as string}
