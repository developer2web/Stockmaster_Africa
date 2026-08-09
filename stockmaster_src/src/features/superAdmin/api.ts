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
