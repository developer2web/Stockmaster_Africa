export type FeatureKey =
  | 'inventory'
  | 'sales'
  | 'expenses'
  | 'advanced_reports'
  | 'pdf_export'
  | 'excel_export'
  | 'multi_business'
  | 'multi_store';

export type BillingCycle = 'monthly' | 'annual';

export type PlanFeature = {
  featureKey: FeatureKey;
  isEnabled: boolean;
  usageLimit: number | null;
};

export type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  maxBusinesses: number;
  maxStores: number;
  maxEmployees: number;
  features: PlanFeature[];
};

export type SubscriptionContextValue = {
  subscriptionId: string | null;
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  status: string | null;
  billingCycle: BillingCycle | null;
  startsAt: string | null;
  expiresAt: string | null;
  gracePeriodEndsAt: string | null;
  isReadOnly: boolean;
  maxBusinesses: number;
  maxStores: number;
  maxEmployees: number;
};

export type PaymentTransaction = {
  id: string;
  plan_id: string;
  provider: string;
  provider_reference: string | null;
  billing_cycle: BillingCycle;
  amount: number;
  currency: string;
  phone_number: string | null;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
  failure_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
  plan?: { name: string } | null;
};
