export type PaymentInput = {
  companyId?: string; planId?: string; billingCycle?: 'monthly' | 'annual';
  phoneNumber?: string; provider?: string; operationId?: string;
  promoCode?: string | null; keepCompanyId?: string | null;
};

export type PaymentOperation = {
  id: string; company_id: string; plan_id: string; billing_cycle: string;
  provider: string; phone_number: string | null; retained_company_id: string | null;
  promotion_id: string | null; request_details: Record<string, unknown> | null;
  provider_reference: string | null; status: string; amount: number; currency: string;
  provider_payload: Record<string, unknown> | null;
};

export function paymentRequestDetails(input: PaymentInput) {
  return {
    companyId: input.companyId, planId: input.planId, billingCycle: input.billingCycle,
    provider: input.provider, phoneNumber: input.provider === 'stripe' ? null : input.phoneNumber?.trim() || null,
    promoCode: input.promoCode?.trim().toUpperCase() || null, keepCompanyId: input.keepCompanyId || null,
  };
}

export function assertSamePaymentRequest(existing: PaymentOperation, input: PaymentInput) {
  const requested = paymentRequestDetails(input);
  const previous = existing.request_details ?? {
    companyId: existing.company_id, planId: existing.plan_id, billingCycle: existing.billing_cycle,
    provider: existing.provider, phoneNumber: existing.provider === 'stripe' ? null : existing.phone_number,
    promoCode: null, keepCompanyId: existing.retained_company_id,
  };
  if ((!existing.request_details && existing.promotion_id && requested.promoCode)
    || Object.entries(requested).some(([key, value]) => previous[key] !== value)) {
    throw new Error('Cette opération de paiement existe déjà avec d’autres paramètres. Créez une nouvelle demande.');
  }
}

export function existingPaymentResponse(transaction: PaymentOperation) {
  return {
    transactionId: transaction.id, status: transaction.status, providerReference: transaction.provider_reference,
    authorizationUrl: transaction.status === 'processing'
      ? transaction.provider === 'stripe' ? transaction.provider_payload?.url ?? null : transaction.provider_payload?.authorization_url ?? null
      : null,
  };
}

export const terminalPaymentStatus = (status: string) => ['succeeded', 'failed', 'cancelled', 'expired'].includes(status);
