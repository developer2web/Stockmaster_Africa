import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from './http.ts';
import { toStripeMinorUnits } from './currency.ts';
import { assertSamePaymentRequest, existingPaymentResponse, paymentRequestDetails, terminalPaymentStatus, type PaymentInput, type PaymentOperation } from './paymentOperation.ts';

type SubscriptionQuote = {
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  bonus_days: number;
  promotion_id: string | null;
  currency: string;
};

export async function handleCreatePayment(request: Request, renewalOnly = false) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = request.headers.get('Authorization') ?? '';
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) throw new Error('Non authentifié');
    const { error: securityError } = await caller.rpc('assert_session_security', { p_allow_temporary_password: false });
    if (securityError) throw securityError;

    const body = await request.json() as PaymentInput;
    if (!body.companyId || !body.planId || !body.operationId) throw new Error('Demande de paiement incomplète');
    if (!['monthly', 'annual'].includes(body.billingCycle ?? '')) throw new Error('Cycle de facturation invalide');
    if (body.provider !== 'stripe' && !/^\+?[0-9]{8,15}$/.test(body.phoneNumber?.trim() ?? '')) throw new Error('Numéro Mobile Money invalide');
    if (!/^[a-z0-9_-]{2,40}$/.test(body.provider ?? '')) throw new Error('Prestataire invalide');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operationId)) throw new Error('Identifiant de paiement invalide');

    const { data: ownership } = await admin.from('client_businesses')
      .select('company_id')
      .eq('company_id', body.companyId)
      .eq('client_id', user.id)
      .maybeSingle();
    if (!ownership) throw new Error('Seul le propriétaire peut payer un forfait');
    if (body.keepCompanyId) {
      const { data: retainedOwnership } = await admin.from('client_businesses')
        .select('company_id')
        .eq('company_id', body.keepCompanyId)
        .eq('client_id', user.id)
        .maybeSingle();
      if (!retainedOwnership) throw new Error('Entreprise à conserver invalide');
    }

    if (renewalOnly) {
      const { data: existing } = await admin.from('subscriptions')
        .select('id')
        .eq('company_id', body.companyId)
        .eq('client_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!existing) throw new Error('Aucun abonnement à renouveler');
    }

    const findOperation = async () => {
      const result = await admin.from('payment_transactions').select('*').eq('client_id', user.id).eq('operation_id', body.operationId!).maybeSingle();
      if (result.error) throw result.error;
      const found = result.data as PaymentOperation | null;
      if (found) assertSamePaymentRequest(found, body);
      return found;
    };
    let transaction = await findOperation();
    if (transaction && (transaction.provider_reference || terminalPaymentStatus(transaction.status))) {
      return json(request, existingPaymentResponse(transaction));
    }
    const { data: plan, error: planError } = await admin.from('plans')
      .select('id,name,monthly_price,annual_price,currency,is_active')
      .eq('id', body.planId)
      .eq('is_active', true)
      .single();
    if (planError || !plan) throw new Error('Forfait indisponible');
    if (!transaction) {
      const { data: quoteResult, error: quoteError } = await caller.rpc('subscription_quote', {
        p_company_id: body.companyId,
        p_plan_id: plan.id,
        p_billing_cycle: body.billingCycle,
        p_promo_code: body.promoCode?.trim() || null,
      });
      if (quoteError) throw quoteError;
      const quote = (Array.isArray(quoteResult) ? quoteResult[0] : quoteResult) as SubscriptionQuote | null;
      if (!quote) throw new Error('Calcul du montant indisponible');
      const amount = Number(quote.final_amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ce paiement ne peut pas avoir un montant nul');

      const { error: transactionError } = await admin.from('payment_transactions')
        .upsert({
          client_id: user.id,
          company_id: body.companyId,
          plan_id: plan.id,
          provider: body.provider,
          operation_id: body.operationId,
          billing_cycle: body.billingCycle,
          amount,
          base_amount: Number(quote.base_amount),
          discount_amount: Number(quote.discount_amount),
          promotion_id: quote.promotion_id,
          bonus_days: Number(quote.bonus_days ?? 0),
          currency: quote.currency || plan.currency,
          phone_number: body.provider === 'stripe' ? null : body.phoneNumber?.trim(),
          status: 'pending',
          retained_company_id: body.keepCompanyId ?? null,
          request_details: { ...paymentRequestDetails(body), planName: plan.name },
        }, { onConflict: 'client_id,operation_id', ignoreDuplicates: true });
      if (transactionError) throw transactionError;
      // A concurrent request may have inserted this operation first. Compare
      // its immutable request and use its snapshotted amount, never overwrite it.
      transaction = await findOperation();
    }
    if (!transaction) throw new Error('Réservation du paiement impossible. Réessayez.');
    if (transaction.provider_reference || terminalPaymentStatus(transaction.status)) return json(request, existingPaymentResponse(transaction));
    const { data: claimed, error: claimError } = await admin.rpc('claim_payment_provider_request', { p_payment_id: transaction.id });
    if (claimError) throw claimError;
    if (!claimed) return json(request, { ...existingPaymentResponse(transaction), instructions: 'La demande est déjà en cours. Vérifiez son statut dans quelques instants.' });
    const amount = Number(transaction.amount);
    const paymentCurrency = transaction.currency;

    let providerRequestSent = false;
    try {
      if (body.provider === 'stripe') {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        const successUrl = Deno.env.get('STRIPE_SUCCESS_URL');
        const cancelUrl = Deno.env.get('STRIPE_CANCEL_URL');
        if (!stripeKey || !successUrl || !cancelUrl) throw new Error('Stripe n’est pas encore configuré');
        const smallestUnit = toStripeMinorUnits(amount, paymentCurrency);
        const form = new URLSearchParams({
          mode: 'payment',
          success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}transactionId=${transaction.id}`,
          cancel_url: cancelUrl,
          client_reference_id: transaction.id,
          'metadata[transaction_id]': transaction.id,
          'line_items[0][quantity]': '1',
          'line_items[0][price_data][currency]': paymentCurrency.toLowerCase(),
          'line_items[0][price_data][unit_amount]': String(smallestUnit),
          'line_items[0][price_data][product_data][name]': `StockMaster ${transaction.request_details?.planName ?? plan.name}`,
        });
        const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `stockmaster-payment-${transaction.id}` }, body: form.toString(), signal: AbortSignal.timeout(30_000) });
        const payload = await response.json() as Record<string,unknown>;
        if (!response.ok || !payload.id || !payload.url) throw new Error('Stripe est momentanément indisponible');
        const { error: saveError } = await admin.from('payment_transactions').update({ provider_reference: String(payload.id), status: 'processing', provider_payload: payload }).eq('id', transaction.id);
        if (saveError) throw saveError;
        await admin.from('payment_status_log').insert({ payment_transaction_id: transaction.id, old_status: 'pending', new_status: 'processing', source: 'stripe-checkout', payload });
        return json(request, { transactionId: transaction.id, status: 'processing', providerReference: String(payload.id), authorizationUrl: String(payload.url) });
      }

      const providerUrl = Deno.env.get('PAYMENT_PROVIDER_URL');
      const providerKey = Deno.env.get('PAYMENT_PROVIDER_API_KEY');
      const sandbox = Deno.env.get('PAYMENT_SANDBOX') === 'true';
      if (!providerUrl && !sandbox) throw new Error('Prestataire Mobile Money non configuré');

      if (sandbox) {
        const reference = `sandbox-${transaction.id}`;
        const { error: saveError } = await admin.from('payment_transactions').update({
          provider_reference: reference,
          status: 'processing',
        }).eq('id', transaction.id);
        if (saveError) throw saveError;
        await admin.from('payment_status_log').insert({
          payment_transaction_id: transaction.id,
          old_status: 'pending',
          new_status: 'processing',
          source: 'create-payment',
        });
        return json(request, {
          transactionId: transaction.id,
          status: 'processing',
          providerReference: reference,
          instructions: 'Mode sandbox : envoyez un webhook signé pour confirmer le paiement.',
        });
      }

      providerRequestSent = true;
      const providerResponse = await fetch(providerUrl!, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `stockmaster-payment-${transaction.id}`,
          ...(providerKey ? { Authorization: `Bearer ${providerKey}` } : {}),
        },
        body: JSON.stringify({
          amount,
          currency: paymentCurrency,
          phone: body.phoneNumber?.trim(),
          merchant_reference: transaction.id,
          callback_url: Deno.env.get('PAYMENT_WEBHOOK_URL'),
          description: `StockMaster ${transaction.request_details?.planName ?? plan.name}`,
        }),
      });
      const providerPayload = await providerResponse.json() as Record<string, unknown>;
      if (!providerResponse.ok) throw new Error(`Prestataire indisponible (${providerResponse.status})`);
      const providerReference = String(providerPayload.reference ?? providerPayload.transaction_id ?? '');
      if (!providerReference) throw new Error('Référence prestataire absente');

      const { error: saveError } = await admin.from('payment_transactions').update({
        provider_reference: providerReference,
        status: 'processing',
        provider_payload: providerPayload,
      }).eq('id', transaction.id);
      if (saveError) throw saveError;
      await admin.from('payment_status_log').insert({
        payment_transaction_id: transaction.id,
        old_status: 'pending',
        new_status: 'processing',
        source: 'create-payment',
        payload: providerPayload,
      });
      return json(request, {
        transactionId: transaction.id,
        status: 'processing',
        providerReference,
        authorizationUrl: providerPayload.authorization_url ?? null,
        instructions: providerPayload.instructions ?? null,
      });
    } catch (error) {
      // Keep the operation and amount for a safe retry, including when the
      // provider accepted a request but its HTTP response was interrupted.
      // A generic Mobile Money API may ignore Idempotency-Key. Once sent, an
      // uncertain request must be reconciled by reference, never sent again.
      // Stripe's lease permits bounded retries with the same idempotency key.
      if (!providerRequestSent && body.provider !== 'stripe') {
        await admin.rpc('release_payment_provider_request', { p_payment_id: transaction.id });
      }
      throw error;
    }
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Erreur inconnue' }, 400);
  }
}
