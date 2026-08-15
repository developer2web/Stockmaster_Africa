import { supabase } from '@/services/supabase/client';
import { userErrorMessage } from '@/utils/errors';

export type PlatformStats = {
  companies: number;
  active_companies: number;
  stores: number;
  users: number;
  sales: number;
  revenue_by_currency: { currency_code: string; revenue: number }[];
  monthly_sales: { month: string; currency_code: string; revenue: number; sales: number }[];
  subscriptions: Record<string, number>;
};

export type PlatformCompany = {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
  created_at: string;
  store_count: number;
  user_count: number;
  sale_count: number;
  revenue: number;
  currency_code: string;
  subscription_status: string | null;
  plan_code: string | null;
};

export type PlatformUser = {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string;
  company_id: string;
  company_name: string;
  store_name: string | null;
  role_name: string;
  is_active: boolean;
  created_at: string;
};

export type PlatformStore = {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  company: { name: string } | null;
};

export type PlatformAudit = {
  id: string;
  company_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  company: { name: string } | null;
  actor: { full_name: string } | null;
};

export type PlatformPayment = {
  id:string;company_id:string;company_name:string;client_email:string;plan_name:string;amount:number;base_amount:number;discount_amount:number;currency:string;provider:string;provider_reference:string|null;billing_cycle:string;status:string;proof_path:string|null;promotion_name:string|null;submitted_at:string|null;reviewed_at:string|null;reviewer_name:string|null;failure_reason:string|null;created_at:string;
};

export type Promotion = { id:string;name:string;code:string|null;promotion_type:'free_days'|'percentage'|'fixed_amount';value:number;starts_at:string;expires_at:string;usage_limit:number|null;audience:'new_clients'|'existing_clients'|'all';is_active:boolean;promotion_plans:{plan_id:string}[] };
export type PlatformAdminRequest={id:string;user_id:string;email:string;full_name:string;company_name:string;store_name:string;country_code:string;status:string;review_reason:string|null;created_at:string;reviewed_at:string|null};
export type CompanyHealth={company_id:string;company_name:string;is_active:boolean;last_sale_at:string|null;last_activity_at:string|null;error_count_7d:number;fatal_count_7d:number;open_tickets:number;subscription_status:string|null};
export type SupportTicket={id:string;company_id:string;subject:string;description:string;priority:'low'|'normal'|'high'|'urgent';status:'open'|'in_progress'|'resolved'|'closed';resolution:string|null;created_at:string;company?:{name:string}|null;creator?:{full_name:string}|null};
export type AppErrorEvent={id:string;severity:string;code:string;message:string;platform:string|null;app_version:string|null;created_at:string;company:{name:string}|null;user:{full_name:string}|null};

function fail(error: { message: string } | null) {
  if (error) throw new Error(userErrorMessage(error));
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const { data, error } = await supabase.rpc('super_admin_dashboard');
  fail(error);
  return data as PlatformStats;
}

export async function getPlatformCompanies(): Promise<PlatformCompany[]> {
  const { data, error } = await supabase.rpc('super_admin_companies');
  fail(error);
  return (data ?? []) as PlatformCompany[];
}

export async function setCompanyActive(id: string, active: boolean) {
  const { error } = await supabase.rpc('set_company_active', { p_company_id: id, p_active: active });
  fail(error);
}

export async function setCompanyPlan(companyId: string, planCode: 'basic' | 'pro' | 'premium') {
  const { error } = await supabase.rpc('super_admin_set_company_plan', {
    p_company_id: companyId,
    p_plan_code: planCode,
    p_duration_days: 30,
  });
  fail(error);
}

export async function getPlatformUsers(): Promise<PlatformUser[]> {
  const { data, error } = await supabase.rpc('super_admin_users');
  fail(error);
  return (data ?? []) as PlatformUser[];
}

export async function setMembershipActive(id: string, active: boolean) {
  const { error } = await supabase.rpc('set_membership_active', { p_membership_id: id, p_active: active });
  fail(error);
}

export async function getPlatformStores(): Promise<PlatformStore[]> {
  const { data, error } = await supabase.from('stores')
    .select('id,company_id,name,address,is_active,created_at,company:companies(name)')
    .order('created_at', { ascending: false })
    .limit(500);
  fail(error);
  return (data ?? []) as unknown as PlatformStore[];
}

export async function setStoreActive(id: string, active: boolean) {
  const { error } = await supabase.from('stores').update({ is_active: active }).eq('id', id);
  fail(error);
}

export async function getPlatformAudit(): Promise<PlatformAudit[]> {
  const { data, error } = await supabase.from('audit_logs')
    .select('id,company_id,action,entity_type,entity_id,created_at,company:companies(name),actor:profiles!audit_logs_actor_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(300);
  fail(error);
  return (data ?? []) as unknown as PlatformAudit[];
}

export async function getPlatformPayments():Promise<PlatformPayment[]>{const{data,error}=await supabase.rpc('super_admin_billing_payments');fail(error);return(data??[]) as PlatformPayment[]}
export async function reviewManualPayment(id:string,approve:boolean,reason=''){const{error}=await supabase.rpc('super_admin_review_manual_payment',{p_payment_id:id,p_approve:approve,p_reason:reason.trim()||null});fail(error)}
export async function getPromotions():Promise<Promotion[]>{const{data,error}=await supabase.from('promotions').select('id,name,code,promotion_type,value,starts_at,expires_at,usage_limit,audience,is_active,promotion_plans(plan_id)').order('created_at',{ascending:false});fail(error);return(data??[]) as unknown as Promotion[]}
export async function savePromotion(input:{id?:string;name:string;code:string;type:Promotion['promotion_type'];value:number;startsAt:string;expiresAt:string;usageLimit:number|null;audience:Promotion['audience'];active:boolean;planIds:string[]}){const{error}=await supabase.rpc('super_admin_save_promotion',{p_id:input.id??null,p_name:input.name,p_code:input.code,p_type:input.type,p_value:input.value,p_starts_at:input.startsAt,p_expires_at:input.expiresAt,p_usage_limit:input.usageLimit,p_audience:input.audience,p_is_active:input.active,p_plan_ids:input.planIds});fail(error)}
export async function updateBillingSettings(input:{orangeMoneyNumber:string;orangeMoneyAccountName:string;trialDays:number;gracePeriodDays:number;trialEnabled:boolean}){const{error}=await supabase.from('billing_settings').update({orange_money_number:input.orangeMoneyNumber.trim(),orange_money_account_name:input.orangeMoneyAccountName.trim(),trial_days:input.trialDays,grace_period_days:input.gracePeriodDays,trial_enabled:input.trialEnabled,updated_by:(await supabase.auth.getUser()).data.user?.id}).eq('id',true);fail(error)}
export async function grantCompanyTrial(companyId:string,days:number){const{error}=await supabase.rpc('super_admin_grant_trial',{p_company_id:companyId,p_days:days});fail(error)}
export async function getAdminAccessRequests():Promise<PlatformAdminRequest[]>{const{data,error}=await supabase.rpc('super_admin_admin_access_requests');fail(error);return(data??[]) as PlatformAdminRequest[]}
export async function reviewAdminAccessRequest(id:string,approve:boolean,reason=''){const{error}=await supabase.rpc('super_admin_review_admin_access',{p_request_id:id,p_approve:approve,p_reason:reason.trim()||null});fail(error)}
export async function getCompanyHealth():Promise<CompanyHealth[]>{const{data,error}=await supabase.rpc('super_admin_company_health');fail(error);return(data??[]) as CompanyHealth[]}
export async function getSupportTickets():Promise<SupportTicket[]>{const{data,error}=await supabase.from('support_tickets').select('id,company_id,subject,description,priority,status,resolution,created_at,company:companies(name),creator:profiles!support_tickets_created_by_fkey(full_name)').order('created_at',{ascending:false});fail(error);return(data??[]) as unknown as SupportTicket[]}
export async function updateSupportTicket(id:string,status:SupportTicket['status'],resolution:string){const{error}=await supabase.rpc('update_support_ticket',{p_ticket_id:id,p_status:status,p_resolution:resolution||null});fail(error)}
export async function getAppErrors():Promise<AppErrorEvent[]>{const{data,error}=await supabase.from('app_error_events').select('id,severity,code,message,platform,app_version,created_at,company:companies(name),user:profiles!app_error_events_user_id_fkey(full_name)').order('created_at',{ascending:false}).limit(200);fail(error);return(data??[]) as unknown as AppErrorEvent[]}
