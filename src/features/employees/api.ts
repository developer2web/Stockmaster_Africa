import { supabase } from '@/services/supabase/client';
import type { Employee, EmployeeRole, Permission, Store } from '@/types/database';
import type { EmployeeInput, RoleInput, StoreInput } from '@/schemas/organization';

function fail(error: { message: string } | null) { if (error) throw new Error(error.message); }

type RoleRow = {
  id: string; company_id: string; name: string; code: EmployeeRole['code'];
  role_permissions: { permission: { code: string } | null }[];
};

type EmployeeRow = {
  id: string; user_id: string; role_id: string; store_id: string | null;
  all_stores: boolean; is_active: boolean; created_at: string;
  profile: { full_name: string } | null;
  role: { name: string; code: string } | null;
  store: { name: string } | null;
  membership_stores: { store_id: string; store: { name: string } | null }[];
};

export async function getCompany(companyId: string) {
  const { data, error } = await supabase.from('companies').select('id,name,slug,phone,email,address,logo_url,language,tax_rate,allow_discounts,allow_credit_sales,low_stock_alerts,receipt_footer,country_code,country_name,default_currency_code,secondary_currency_code,currency_locked_at,created_at').eq('id', companyId).single(); fail(error); return data as {
    id: string; name: string; slug: string | null; country_code: string;
    phone:string|null;email:string|null;address:string|null;logo_url:string|null;language:'fr'|'en';tax_rate:number;allow_discounts:boolean;allow_credit_sales:boolean;low_stock_alerts:boolean;receipt_footer:string|null;
    country_name: string; default_currency_code: string;
    secondary_currency_code: string | null; currency_locked_at: string | null; created_at: string;
  };
}
export async function updateCompany(companyId: string, name: string) { const { error } = await supabase.from('companies').update({ name }).eq('id', companyId); fail(error); }
export async function updateBusinessSettings(companyId:string,value:{phone:string;email:string;address:string;language:'fr'|'en';taxRate:number;allowDiscounts:boolean;allowCreditSales:boolean;lowStockAlerts:boolean;receiptFooter:string}){const{error}=await supabase.from('companies').update({phone:value.phone.trim()||null,email:value.email.trim()||null,address:value.address.trim()||null,language:value.language,tax_rate:value.taxRate,allow_discounts:value.allowDiscounts,allow_credit_sales:value.allowCreditSales,low_stock_alerts:value.lowStockAlerts,receipt_footer:value.receiptFooter.trim()||null}).eq('id',companyId);fail(error)}

export async function getCountryCurrencyMap() {
  const { data, error } = await supabase.from('country_currency_map')
    .select('country_code,country_name,default_currency_code,allowed_currency_codes')
    .eq('is_active', true)
    .order('country_name');
  fail(error);
  return (data ?? []) as {
    country_code: string; country_name: string;
    default_currency_code: string; allowed_currency_codes: string[];
  }[];
}

export async function updateBusinessCurrency(
  companyId: string,
  countryCode: string,
  primaryCurrencyCode: string,
  secondaryCurrencyCode: string | null,
) {
  const { error } = await supabase.rpc('set_business_currency', {
    p_company_id: companyId,
    p_country_code: countryCode,
    p_primary_currency_code: primaryCurrencyCode,
    p_secondary_currency_code: secondaryCurrencyCode,
    p_reason: null,
  });
  fail(error);
}

export async function getStores(companyId: string): Promise<Store[]> {
  const { data, error } = await supabase.from('stores').select('id,company_id,name,address,is_active,created_at').eq('company_id', companyId).order('created_at').limit(100); fail(error); return (data ?? []) as Store[];
}
export async function saveStore(companyId: string, values: StoreInput, id?: string) {
  const payload = { company_id: companyId, name: values.name, address: values.address || null, is_active: values.isActive };
  const query = id ? supabase.from('stores').update(payload).eq('id', id) : supabase.from('stores').insert(payload); const { error } = await query; fail(error);
}

export async function getPermissions(): Promise<Permission[]> { const { data, error } = await supabase.from('permissions').select('id,code,description').order('code'); fail(error); return (data ?? []) as Permission[]; }
export async function getRoles(companyId: string): Promise<EmployeeRole[]> {
  const { data, error } = await supabase.from('roles').select('id,company_id,name,code,role_permissions(permission:permissions(code))').eq('company_id', companyId).order('name'); fail(error);
  return ((data ?? []) as unknown as RoleRow[]).map((role) => ({
    id: role.id,
    company_id: role.company_id,
    name: role.name,
    code: role.code,
    permissions: role.role_permissions.flatMap(({ permission }) => permission ? [permission.code] : []),
  }));
}
export async function saveRole(companyId: string, values: RoleInput, id?: string) { const fn = id ? 'update_employee_role' : 'create_employee_role'; const args = id ? { p_role_id:id, p_name:values.name, p_permission_codes:values.permissions } : { p_company_id:companyId, p_name:values.name, p_permission_codes:values.permissions }; const { error } = await supabase.rpc(fn, args); fail(error); }
export async function deleteRole(id: string) { const { error } = await supabase.rpc('delete_employee_role', { p_role_id:id }); fail(error); }

export async function getEmployees(companyId: string): Promise<Employee[]> {
  const { data, error } = await supabase.from('memberships').select('id,user_id,role_id,store_id,all_stores,is_active,created_at,profile:profiles!memberships_user_id_fkey(full_name),role:roles!memberships_role_id_fkey(name,code),store:stores(name),membership_stores(store_id,store:stores(name))').eq('company_id',companyId).order('created_at').limit(250); fail(error);
  return ((data ?? []) as unknown as EmployeeRow[])
    .filter((membership) => membership.role?.code === 'employee')
    .map((membership) => ({
      id: membership.id,
      userId: membership.user_id,
      fullName: membership.profile?.full_name || 'Employé',
      roleId: membership.role_id,
      roleName: membership.role?.name ?? 'Employé',
      storeId: membership.store_id,
      storeName: membership.store?.name ?? null,
      storeIds: membership.membership_stores.map((access) => access.store_id),
      storeNames: membership.membership_stores.flatMap((access) => access.store ? [access.store.name] : []),
      allStores: membership.all_stores,
      isActive: membership.is_active,
      createdAt: membership.created_at,
    }));
}
export async function inviteEmployee(values: EmployeeInput, companyId: string): Promise<{ userId: string; temporaryPassword: string }> {
  const { data, error } = await supabase.functions.invoke('invite-employee',{ body:{...values,companyId} });
  if (error) {
    const response=(error as {context?:Response}).context;
    if(response){try{const body=await response.clone().json() as {error?:string};if(body.error)throw new Error(body.error)}catch(parsed){if(parsed instanceof Error&&parsed.message!==error.message)throw parsed}}
    throw new Error(error.message);
  }
  if(data?.error)throw new Error(data.error);
  if(!data?.userId||!data?.temporaryPassword)throw new Error('Les identifiants temporaires sont absents de la réponse.');
  return data as { userId: string; temporaryPassword: string };
}
export async function updateEmployee(id:string, roleId:string, storeIds:string[], allStores:boolean, isActive:boolean) { const { error }=await supabase.rpc('update_employee_access',{p_membership_id:id,p_role_id:roleId,p_store_ids:storeIds,p_all_stores:allStores,p_is_active:isActive}); fail(error); }
export async function deleteEmployee(id:string) { const { error }=await supabase.rpc('delete_employee',{p_membership_id:id}); fail(error); }
