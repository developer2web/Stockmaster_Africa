import { supabase } from '@/services/supabase/client';
import type { BusinessAccess, StoreAccess, WorkspaceContext } from '@/types/database';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

type BusinessRow = {
  company_id: string;
  company_name: string;
  membership_id: string;
  role: BusinessAccess['role'];
  role_name: string;
  subscription_status: BusinessAccess['subscriptionStatus'];
  country_code: string;
  country_name: string;
  default_currency_code: string;
  secondary_currency_code: string | null;
  currency_locked_at: string | null;
};

type StoreRow = {
  store_id: string;
  store_name: string;
  address: string | null;
};

export async function getAccessibleBusinesses(): Promise<BusinessAccess[]> {
  let rows: BusinessRow[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase.rpc('get_accessible_businesses');
    fail(error);
    rows = (data ?? []) as BusinessRow[];
    if (rows.length || attempt === 2) break;
    await wait(300 * (attempt + 1));
  }
  return rows.map((row) => ({
    companyId: row.company_id,
    companyName: row.company_name,
    membershipId: row.membership_id,
    role: row.role,
    roleName: row.role_name,
    subscriptionStatus: row.subscription_status,
    countryCode: row.country_code,
    countryName: row.country_name,
    defaultCurrencyCode: row.default_currency_code,
    secondaryCurrencyCode: row.secondary_currency_code,
    currencyLockedAt: row.currency_locked_at,
  }));
}

export async function getAccessibleStores(companyId: string): Promise<StoreAccess[]> {
  let rows: StoreRow[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase.rpc('get_accessible_stores', { p_company_id: companyId });
    fail(error);
    rows = (data ?? []) as StoreRow[];
    if (rows.length || attempt === 2) break;
    await wait(300 * (attempt + 1));
  }
  return rows.map((row) => ({
    storeId: row.store_id,
    storeName: row.store_name,
    address: row.address,
  }));
}

export async function getWorkspaceContext(companyId: string, storeId: string): Promise<WorkspaceContext | null> {
  const { data, error } = await supabase.rpc('get_workspace_context', {
    p_company_id: companyId,
    p_store_id: storeId,
  });
  fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    membershipId: row.membership_id,
    companyId: row.company_id,
    companyName: row.company_name,
    storeId: row.store_id,
    storeName: row.store_name,
    role: row.role,
    roleName: row.role_name,
    permissions: row.permissions ?? [],
    subscriptionStatus: row.subscription_status,
    countryCode: row.country_code,
    countryName: row.country_name,
    defaultCurrencyCode: row.default_currency_code,
    secondaryCurrencyCode: row.secondary_currency_code,
    currencyLockedAt: row.currency_locked_at,
  };
}

export async function createBusiness(companyName: string, storeName: string, countryCode: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_business', {
    p_company_name: companyName,
    p_store_name: storeName,
    p_country_code: countryCode,
  });
  fail(error);
  return data as string;
}
