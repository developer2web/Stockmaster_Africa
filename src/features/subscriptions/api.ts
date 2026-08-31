import { supabase } from '@/services/supabase/client';
import { createOperationId } from '@/utils/operationId';
import type {
  BillingCycle,
  PaymentTransaction,
  PlanFeature,
  SubscriptionContextValue,
  SubscriptionPlan,
  BillingSettings,
  SubscriptionQuote,
} from './types';
import { withOfflineCache } from '@/features/offline/storage';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price: number;
  annual_price: number;
  currency: string;
  max_businesses: number;
  max_stores: number;
  max_employees: number;
  plan_features: {
    feature_key: PlanFeature['featureKey'];
    is_enabled: boolean;
    usage_limit: number | null;
  }[] | null;
};

function mapPlans(data: unknown): SubscriptionPlan[] {
  return ((data ?? []) as PlanRow[]).map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description ?? '',
    monthlyPrice: Number(plan.monthly_price),
    annualPrice: Number(plan.annual_price),
    currency: plan.currency,
    maxBusinesses: plan.max_businesses,
    maxStores: plan.max_stores,
    maxEmployees: plan.max_employees,
    features: (plan.plan_features ?? []).map((feature) => ({
      featureKey: feature.feature_key,
      isEnabled: feature.is_enabled,
      usageLimit: feature.usage_limit,
    })),
  }));
}

export async function getPlans(companyId: string): Promise<SubscriptionPlan[]> {
  return withOfflineCache(`subscription-plans:${companyId}`, async () => {
    const { data, error } = await supabase.rpc('company_subscription_plans', { p_company_id: companyId });
    if (!error) {
      const localizedPlans = mapPlans(data);
      if (localizedPlans.length) return localizedPlans;
    }

    // Compatibilité avec les environnements Supabase où la fonction de
    // localisation des devises n'est pas encore déployée.
    return getCatalogPlans();
  }, Array.isArray);
}

export async function getCatalogPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase.from('plans')
    .select('id,code,name,description,monthly_price,annual_price,currency,max_businesses,max_stores,max_employees,plan_features(feature_key,is_enabled,usage_limit)')
    .eq('is_active', true)
    .order('monthly_price');
  fail(error);
  return mapPlans(data);
}

export async function getCurrentSubscription(companyId: string): Promise<SubscriptionContextValue | null> {
  return withOfflineCache(`subscription-context:${companyId}`, async () => {
    // La mise à jour du cycle est utile, mais ne doit jamais bloquer l'ouverture
    // du catalogue si cette procédure n'est pas encore disponible à distance.
    await supabase.rpc('refresh_subscription_lifecycle', { p_company_id: companyId });
    const { data, error } = await supabase.rpc('current_subscription', { p_company_id: companyId });
    fail(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      subscriptionId: row.subscription_id,
      planId: row.plan_id,
      planCode: row.plan_code,
      planName: row.plan_name,
      status: row.status,
      billingCycle: row.billing_cycle,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      gracePeriodEndsAt: row.grace_period_ends_at,
      isReadOnly: row.is_read_only,
      maxBusinesses: row.max_businesses,
      maxStores: row.max_stores,
      maxEmployees: row.max_employees,
    } satisfies SubscriptionContextValue;
  }, (value): value is SubscriptionContextValue => !!value && typeof value === 'object' && 'planId' in value && 'status' in value);
}

export async function canUseServerFeature(companyId: string, featureKey: string) {
  const { data, error } = await supabase.rpc('can_use_feature', {
    p_company_id: companyId,
    p_feature_key: featureKey,
  });
  fail(error);
  return !!data;
}

export async function checkSubscriptionUsage(
  subscriptionId: string,
  featureKey: string,
  usageLimit: number | null,
) {
  if (usageLimit === null) return true;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('subscription_usage')
    .select('used_count')
    .eq('subscription_id', subscriptionId)
    .eq('feature_key', featureKey)
    .lte('period_start', now)
    .gt('period_end', now)
    .maybeSingle();
  fail(error);
  return Number(data?.used_count ?? 0) < usageLimit;
}

export async function getPaymentHistory(): Promise<PaymentTransaction[]> {
  const { data, error } = await supabase.from('payment_transactions')
    .select('id,plan_id,provider,provider_reference,billing_cycle,base_amount,discount_amount,amount,currency,phone_number,status,failure_reason,rejection_reason,proof_path,submitted_at,confirmed_at,created_at,plan:plans(name),promotion:promotions(name)')
    .order('created_at', { ascending: false })
    .limit(100);
  fail(error);
  return (data ?? []) as unknown as PaymentTransaction[];
}

export async function getBillingSettings(): Promise<BillingSettings> {
  const { data, error } = await supabase.from('billing_settings').select('orange_money_number,orange_money_account_name,trial_days,grace_period_days,trial_enabled').eq('id', true).single();
  fail(error);
  return { orangeMoneyNumber: data!.orange_money_number, orangeMoneyAccountName: data!.orange_money_account_name, trialDays: data!.trial_days, gracePeriodDays: data!.grace_period_days, trialEnabled: data!.trial_enabled };
}

export async function getSubscriptionQuote(companyId: string, planId: string, billingCycle: BillingCycle, promoCode = ''): Promise<SubscriptionQuote> {
  const { data, error } = await supabase.rpc('subscription_quote', { p_company_id: companyId, p_plan_id: planId, p_billing_cycle: billingCycle, p_promo_code: promoCode.trim() || null });
  fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  return { baseAmount: Number(row.base_amount), discountAmount: Number(row.discount_amount), finalAmount: Number(row.final_amount), promotionId: row.promotion_id, promotionName: row.promotion_name, bonusDays: Number(row.bonus_days), currency: row.currency };
}

export async function submitManualPayment(input: { companyId: string; planId: string; billingCycle: BillingCycle; reference: string; proofPath?: string | null; promoCode?: string; keepCompanyId?: string }) {
  const { data, error } = await supabase.rpc('submit_manual_subscription_payment', { p_company_id: input.companyId, p_plan_id: input.planId, p_billing_cycle: input.billingCycle, p_reference: input.reference.trim(), p_proof_path: input.proofPath ?? null, p_promo_code: input.promoCode?.trim() || null, p_operation_id: createOperationId(), p_retained_company_id: input.keepCompanyId ?? null });
  fail(error);
  return data as string;
}

export async function createPayment(input: {
  companyId: string;
  planId: string;
  billingCycle: BillingCycle;
  phoneNumber?: string;
  provider: string;
  keepCompanyId?: string;
}) {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: { ...input, operationId: createOperationId() },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as {
    transactionId: string;
    status: string;
    providerReference: string | null;
    authorizationUrl?: string | null;
    instructions?: string | null;
  };
}

export async function checkPaymentStatus(transactionId: string) {
  const { data, error } = await supabase.functions.invoke('check-payment-status', {
    body: { transactionId },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as { transactionId: string; status: PaymentTransaction['status']; provider?: string; subscriptionStatus?: string };
}
