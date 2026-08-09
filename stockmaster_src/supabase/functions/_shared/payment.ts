import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from './http.ts';

type PaymentRequest = {
  companyId?: string;
  planId?: string;
  billingCycle?: 'monthly' | 'annual';
  phoneNumber?: string;
  provider?: string;
  operationId?: string;
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

    const body = await request.json() as PaymentRequest;
    if (!body.companyId || !body.planId || !body.operationId) throw new Error('Demande de paiement incomplète');
    if (!['monthly', 'annual'].includes(body.billingCycle ?? '')) throw new Error('Cycle de facturation invalide');
    if (!/^\+?[0-9]{8,15}$/.test(body.phoneNumber?.trim() ?? '')) throw new Error('Numéro Mobile Money invalide');
    if (!/^[a-z0-9_-]{2,40}$/.test(body.provider ?? '')) throw new Error('Prestataire invalide');

    const { data: ownership } = await admin.from('client_businesses')
      .select('company_id')
      .eq('company_id', body.companyId)
      .eq('client_id', user.id)
      .maybeSingle();
    if (!ownership) throw new Error('Seul le propriétaire peut payer un forfait');

    if (renewalOnly) {
      const { data: existing } = await admin.from('subscriptions')
        .select('id')
        .eq('company_id', body.companyId)
        .eq('client_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!existing) throw new Error('Aucun abonnement à renouveler');
    }

    const { data: plan, error: planError } = await admin.from('plans')
      .select('id,name,monthly_price,annual_price,currency,is_active')
      .eq('id', body.planId)
      .eq('is_active', true)
      .single();
    if (planError || !plan) throw new Error('Forfait indisponible');
    const amount = Number(body.billingCycle === 'annual' ? plan.annual_price : plan.monthly_price);

    const { data: transaction, error: transactionError } = await admin.from('payment_transactions')
      .upsert({
        client_id: user.id,
        company_id: body.companyId,
        plan_id: plan.id,
        provider: body.provider,
        operation_id: body.operationId,
        billing_cycle: body.billingCycle,
        amount,
        currency: plan.currency,
        phone_number: body.phoneNumber?.trim(),
        status: 'pending',
      }, { onConflict: 'client_id,operation_id', ignoreDuplicates: false })
      .select('id,status,provider_reference')
      .single();
    if (transactionError) throw transactionError;
    if (transaction.provider_reference) {
      return json(request, {
        transactionId: transaction.id,
        status: transaction.status,
        providerReference: transaction.provider_reference,
      });
    }

    const providerUrl = Deno.env.get('PAYMENT_PROVIDER_URL');
    const providerKey = Deno.env.get('PAYMENT_PROVIDER_API_KEY');
    const sandbox = Deno.env.get('PAYMENT_SANDBOX') === 'true';
    if (!providerUrl && !sandbox) throw new Error('Prestataire Mobile Money non configuré');

    if (sandbox) {
      const reference = `sandbox-${transaction.id}`;
      await admin.from('payment_transactions').update({
        provider_reference: reference,
        status: 'processing',
      }).eq('id', transaction.id);
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

    const providerResponse = await fetch(providerUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(providerKey ? { Authorization: `Bearer ${providerKey}` } : {}),
      },
      body: JSON.stringify({
        amount,
        currency: plan.currency,
        phone: body.phoneNumber?.trim(),
        merchant_reference: transaction.id,
        callback_url: Deno.env.get('PAYMENT_WEBHOOK_URL'),
        description: `StockMaster ${plan.name}`,
      }),
    });
    const providerPayload = await providerResponse.json() as Record<string, unknown>;
    if (!providerResponse.ok) throw new Error(`Prestataire indisponible (${providerResponse.status})`);
    const providerReference = String(providerPayload.reference ?? providerPayload.transaction_id ?? '');
    if (!providerReference) throw new Error('Référence prestataire absente');

    await admin.from('payment_transactions').update({
      provider_reference: providerReference,
      status: 'processing',
      provider_payload: providerPayload,
    }).eq('id', transaction.id);
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
    return json(request, { error: error instanceof Error ? error.message : 'Erreur inconnue' }, 400);
  }
}
